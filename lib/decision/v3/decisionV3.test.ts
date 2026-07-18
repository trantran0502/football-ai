import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import { runFeatureRecommendationPipeline } from "@/lib/analysis/featureRecommendationPipeline";
import {
  aggregateDecision,
  buildDecisionV3Observability,
  isDecisionV3ShadowEnabled,
} from "@/lib/decision/v3";
import { collectEvidenceV3 } from "@/lib/evidence/v3";
import {
  createShadowRunId,
  getShadowRunRecord,
  resetShadowRunsForTests,
  setShadowRunDecisionV3,
  setShadowRunEvidenceV3,
} from "@/lib/shadow/shadowRunScope";
import type { ProviderResolutionAudit } from "@/lib/providers/teamProfile/teamProfileProviderPipeline";
import type { MarketSelection } from "@/types/match";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function withEnv<T>(
  values: Record<string, string | undefined>,
  run: () => T | Promise<T>
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return Promise.resolve(run()).finally(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetShadowRunsForTests();
  });
}

const SAMPLE_ODDS = `Arsenal vs Chelsea
獨贏
主 1.85
和 3.4
客 4.2`;

function buildSampleMarkets(): MarketSelection[] {
  return [
    {
      marketType: "moneyline",
      marketFamily: "moneyline",
      title: "獨贏",
      period: "full",
      side: "home",
      line: null,
      rawLine: null,
      modifier: null,
      odds: 1.85,
      impliedProbability: 0.5405,
    },
    {
      marketType: "moneyline",
      marketFamily: "moneyline",
      title: "獨贏",
      period: "full",
      side: "draw",
      line: null,
      rawLine: null,
      modifier: null,
      odds: 3.4,
      impliedProbability: 0.2941,
    },
    {
      marketType: "moneyline",
      marketFamily: "moneyline",
      title: "獨贏",
      period: "full",
      side: "away",
      line: null,
      rawLine: null,
      modifier: null,
      odds: 4.2,
      impliedProbability: 0.2381,
    },
  ];
}

function buildProviderAudit(): ProviderResolutionAudit {
  return {
    resolved: [
      {
        key: "recentForm",
        source: "teamProfile",
        confidence: 0.9,
        warnings: [],
        data: {},
        available: true,
      },
      {
        key: "homeAway",
        source: "mock",
        confidence: 0.2,
        warnings: [],
        data: {},
        available: false,
      },
    ],
    mockProviderCount: 1,
    unavailableProviderCount: 0,
    teamProfileProviderCount: 1,
    criticalProvidersUnavailable: false,
    providerSources: {
      recentForm: "teamProfile",
      homeAway: "mock",
    },
  };
}

function testAggregation(): void {
  const evidence = collectEvidenceV3({
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    marketSelections: buildSampleMarkets(),
    providerAudit: buildProviderAudit(),
  });

  const outcome = aggregateDecision({
    evidence,
    marketSelections: buildSampleMarkets(),
  });

  assert(outcome.breakdown.length >= 2, "aggregation should include collected evidence");
  assert(
    outcome.weightedScore >= -1 && outcome.weightedScore <= 1,
    "weighted score bounds"
  );
  assert(outcome.catalogVersion === evidence.catalogVersion, "catalog version propagated");
}

function testEmptyEvidence(): void {
  const outcome = aggregateDecision({
    evidence: {
      evidence: [],
      missing: ["ODDS_IMPLIED_VALUE", "FORM_RECENT_10", "PROVIDER_CONFIDENCE"],
      blocked: [],
      catalogVersion: "evidence-catalog-v3.0",
      collectedAt: "2026-07-18T10:00:00.000Z",
    },
    marketSelections: buildSampleMarkets(),
  });

  assert(outcome.decision === "pass", "empty evidence should pass");
  assert(outcome.weightedScore === 0, "empty evidence score should be zero");
  assert(outcome.candidate === null, "empty evidence should not pick candidate");
}

function testMissingEvidence(): void {
  const evidence = collectEvidenceV3({
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    marketSelections: buildSampleMarkets(),
    providerAudit: null,
  });

  const outcome = aggregateDecision({
    evidence,
    marketSelections: buildSampleMarkets(),
  });

  assert(
    evidence.missing.includes("FORM_RECENT_10"),
    "form evidence should be missing without team profile"
  );
  assert(outcome.breakdown.length >= 1, "available evidence should still aggregate");
}

function testConfidenceWeighting(): void {
  const outcome = aggregateDecision({
    evidence: {
      evidence: [
        {
          id: "ODDS_IMPLIED_VALUE",
          score: 0.5,
          confidence: 0.5,
          reason: "Low confidence odds edge",
          metadata: {
            category: "market",
            direction: "home",
            source: { provider: "parser" },
            capturedAt: "2026-07-18T10:00:00.000Z",
          },
        },
        {
          id: "PROVIDER_CONFIDENCE",
          score: 0.5,
          confidence: 1,
          reason: "High confidence providers",
          metadata: {
            category: "meta",
            direction: "neutral",
            source: { provider: "providerAudit" },
            capturedAt: "2026-07-18T10:00:00.000Z",
          },
        },
      ],
      missing: [],
      blocked: [],
      catalogVersion: "evidence-catalog-v3.0",
      collectedAt: "2026-07-18T10:00:00.000Z",
    },
    marketSelections: buildSampleMarkets(),
  });

  const lowContribution = outcome.breakdown.find(
    (item) => item.evidenceId === "ODDS_IMPLIED_VALUE"
  )?.contribution;
  const highContribution = outcome.breakdown.find(
    (item) => item.evidenceId === "PROVIDER_CONFIDENCE"
  )?.contribution;

  assert((lowContribution ?? 0) < (highContribution ?? 0), "confidence should weight contributions");
}

function testObservabilityShape(): void {
  const outcome = aggregateDecision({
    evidence: collectEvidenceV3({
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      marketSelections: buildSampleMarkets(),
      providerAudit: buildProviderAudit(),
    }),
    marketSelections: buildSampleMarkets(),
  });

  const observability = buildDecisionV3Observability(outcome);
  assert(typeof observability.reasonCount === "number", "reasonCount");
  assert(typeof observability.objectionCount === "number", "objectionCount");
  assert(JSON.stringify(observability).includes("breakdown") === false, "no breakdown in observability");
  assert(JSON.stringify(observability).includes("rawMetrics") === false, "no raw metrics in observability");
}

async function testShadowOff(): Promise<void> {
  await withEnv({ USE_DECISION_V3_SHADOW: "false" }, () => {
    const result = runFeatureRecommendationPipeline(
      {
        homeTeam: "Arsenal",
        awayTeam: "Chelsea",
        league: "Premier League",
        marketSelections: buildSampleMarkets(),
      },
      buildSampleMarkets()
    );
    assert(!isDecisionV3ShadowEnabled(), "decision shadow flag off");
    assert(!result.shadowRunId, "no shadow run when both flags off");
  });
}

async function testShadowOn(): Promise<void> {
  await withEnv(
    { USE_EVIDENCE_V3_SHADOW: "true", USE_DECISION_V3_SHADOW: "true" },
    () => {
      const result = runFeatureRecommendationPipeline(
        {
          homeTeam: "Arsenal",
          awayTeam: "Chelsea",
          league: "Premier League",
          marketSelections: buildSampleMarkets(),
        },
        buildSampleMarkets()
      );

      const record = getShadowRunRecord(result.shadowRunId!);
      assert(Boolean(record?.evidenceV3), "evidence shadow should be stored");
      assert(Boolean(record?.decisionV3), "decision shadow should be stored");
      assert(record!.decisionV3!.enabled, "decision shadow enabled");
      assert(
        typeof record!.decisionV3!.decisionV3.weightedScore === "number",
        "decision observability weightedScore"
      );
    }
  );
}

async function testRecommendationRegression(): Promise<void> {
  await withEnv(
    { USE_EVIDENCE_V3_SHADOW: "true", USE_DECISION_V3_SHADOW: "true" },
    () => {
      const result = runFeatureRecommendationPipeline(
        {
          homeTeam: "Arsenal",
          awayTeam: "Chelsea",
          league: "Premier League",
          marketSelections: buildSampleMarkets(),
        },
        buildSampleMarkets()
      );

      assert(!("decisionV3" in result), "pipeline must not expose decisionV3 payload");
      assert(result.section.enabled, "recommendation section remains enabled");
    }
  );
}

async function testAnalysisReportRegression(): Promise<void> {
  await withEnv(
    { USE_EVIDENCE_V3_SHADOW: "true", USE_DECISION_V3_SHADOW: "true" },
    () => {
      const report = analyzeMatch(SAMPLE_ODDS);
      assert(!("decisionV3" in report), "AnalysisReport must not expose decisionV3");
      assert(JSON.stringify(report).includes("decisionV3") === false, "no decisionV3 in serialized report");
      assert(report.decision !== null, "legacy decision remains available");
    }
  );
}

function testConcurrentIsolation(): void {
  resetShadowRunsForTests();

  const runA = createShadowRunId({ homeTeam: "Arsenal", awayTeam: "Chelsea" });
  const runB = createShadowRunId({ homeTeam: "Liverpool", awayTeam: "Spurs" });

  setShadowRunEvidenceV3(runA, {
    enabled: true,
    collectedAt: "2026-07-18T10:00:00.000Z",
    evidenceV3: {
      catalogVersion: "evidence-catalog-v3.0",
      collected: ["ODDS_IMPLIED_VALUE"],
      missing: [],
      blocked: [],
    },
  });

  setShadowRunDecisionV3(runB, {
    enabled: true,
    collectedAt: "2026-07-18T10:00:01.000Z",
    decisionV3: {
      decision: "lean",
      confidence: "medium",
      weightedScore: 0.2,
      candidate: null,
      reasonCount: 1,
      objectionCount: 0,
      decisionWeightVersion: null,
      decisionWeightSource: "fallback",
    },
  });

  const recordA = getShadowRunRecord(runA);
  const recordB = getShadowRunRecord(runB);

  assert(Boolean(recordA?.evidenceV3), "run A evidence stored");
  assert(recordA?.decisionV3 === null, "run A decision remains isolated");
  assert(recordB?.evidenceV3 === null, "run B evidence remains isolated");
  assert(Boolean(recordB?.decisionV3), "run B decision stored");
  assert(runA !== runB, "run ids must be unique");
}

function testRunIdIsolation(): void {
  resetShadowRunsForTests();
  const runId = createShadowRunId({ fixtureId: 1490329, homeTeam: "A", awayTeam: "B" });
  assert(runId.startsWith("1490329:"), "run id should include fixture scope");
  assert(getShadowRunRecord(runId)?.fixtureKey === "1490329", "fixture key stored");
}

export async function runDecisionV3Tests(): Promise<void> {
  testAggregation();
  testEmptyEvidence();
  testMissingEvidence();
  testConfidenceWeighting();
  testObservabilityShape();
  await testShadowOff();
  await testShadowOn();
  await testRecommendationRegression();
  await testAnalysisReportRegression();
  testConcurrentIsolation();
  testRunIdIsolation();
}

void runDecisionV3Tests()
  .then(() => {
    console.log("Decision v3 tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
