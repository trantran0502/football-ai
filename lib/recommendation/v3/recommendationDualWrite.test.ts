import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import { runFeatureRecommendationPipeline } from "@/lib/analysis/featureRecommendationPipeline";
import { DECISION_V3_CATALOG_VERSION, type DecisionOutcome } from "@/lib/decision/v3/decisionTypes";
import {
  buildRecommendationComparison,
  isRecommendationDualWriteEnabled,
  runRecommendationDualWriteIfEnabled,
} from "@/lib/recommendation/v3";
import {
  createEmptyRecommendationResult,
  type RecommendationCandidate,
  type RecommendationEngineResult,
  type RecommendationLevel,
} from "@/lib/recommendation/recommendationTypes";
import {
  createShadowRunId,
  getShadowRunRecord,
  resetShadowRunsForTests,
} from "@/lib/shadow/shadowRunScope";
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

function buildCandidate(input: {
  side: MarketSelection["side"];
  score: number;
  confidence: RecommendationLevel;
  reasons?: string[];
  warnings?: string[];
}): RecommendationCandidate {
  const selection =
    buildSampleMarkets().find((market) => market.side === input.side) ??
    buildSampleMarkets()[0];

  return {
    marketType: "moneyline",
    selection,
    confidence: input.confidence,
    expectedValue: 0.12,
    score: input.score,
    marketScore: input.score,
    evidenceScore: 0.1,
    reasons: input.reasons ?? ["Strong home form", "Odds value"],
    warnings: input.warnings ?? [],
    supportingFeatures: ["recentForm"],
  };
}

function buildLegacyRecommendation(input: {
  candidate?: RecommendationCandidate | null;
  globalPass?: boolean;
}): RecommendationEngineResult {
  const candidate = input.candidate ?? null;
  return createEmptyRecommendationResult({
    globalPass: input.globalPass ?? candidate === null,
    candidates: candidate ? [candidate] : [],
  });
}

function buildDecisionOutcome(overrides: Partial<DecisionOutcome> = {}): DecisionOutcome {
  return {
    decision: "lean",
    confidence: "medium",
    weightedScore: 0.6,
    candidate: {
      marketType: "moneyline",
      side: "home",
      label: "home moneyline",
    },
    reasons: [
      {
        evidenceId: "ODDS_IMPLIED_VALUE",
        polarity: "support",
        summary: "Strong home form",
      },
      {
        evidenceId: "FORM_RECENT_10",
        polarity: "support",
        summary: "Odds value",
      },
    ],
    objections: [],
    breakdown: [],
    catalogVersion: DECISION_V3_CATALOG_VERSION,
    decisionWeightVersion: null,
    decisionWeightSource: "fallback",
    ...overrides,
  };
}

function testIdenticalRecommendation(): void {
  const legacy = buildLegacyRecommendation({
    candidate: buildCandidate({ side: "home", score: 60, confidence: "medium" }),
  });
  const decision = buildDecisionOutcome({
    weightedScore: 0.6,
    confidence: "medium",
    candidate: {
      marketType: "moneyline",
      side: "home",
      label: "home moneyline",
    },
  });

  const comparison = buildRecommendationComparison({
    legacyRecommendation: legacy,
    decisionOutcome: decision,
  });

  assert(comparison.agreement.agreement, "identical recommendations should agree");
  assert(comparison.agreement.directionAgreement, "direction agreement");
  assert(comparison.agreement.marketAgreement, "market agreement");
  assert(comparison.agreement.confidenceAgreement, "confidence agreement");
  assert(!comparison.candidateDiff, "candidate should not change");
}

function testDifferentRecommendation(): void {
  const legacy = buildLegacyRecommendation({
    candidate: buildCandidate({ side: "home", score: 70, confidence: "high" }),
  });
  const decision = buildDecisionOutcome({
    weightedScore: -0.4,
    confidence: "high",
    candidate: {
      marketType: "moneyline",
      side: "away",
      label: "away moneyline",
    },
  });

  const comparison = buildRecommendationComparison({
    legacyRecommendation: legacy,
    decisionOutcome: decision,
  });

  assert(!comparison.agreement.agreement, "different recommendations should disagree");
  assert(!comparison.agreement.directionAgreement, "direction should differ");
  assert(comparison.candidateDiff, "candidate changed");
}

function testCandidateChanged(): void {
  const comparison = buildRecommendationComparison({
    legacyRecommendation: buildLegacyRecommendation({
      candidate: buildCandidate({ side: "home", score: 65, confidence: "medium" }),
    }),
    decisionOutcome: buildDecisionOutcome({
      candidate: {
        marketType: "moneyline",
        side: "away",
        label: "away moneyline",
      },
    }),
  });

  assert(comparison.candidateDiff, "candidate diff flag");
  assert(comparison.agreement.candidateChanged, "candidate changed metric");
}

function testConfidenceChanged(): void {
  const comparison = buildRecommendationComparison({
    legacyRecommendation: buildLegacyRecommendation({
      candidate: buildCandidate({ side: "home", score: 65, confidence: "low" }),
    }),
    decisionOutcome: buildDecisionOutcome({
      confidence: "high",
      candidate: {
        marketType: "moneyline",
        side: "home",
        label: "home moneyline",
      },
    }),
  });

  assert(comparison.confidenceDiff > 0, "confidence diff should be positive");
  assert(!comparison.agreement.confidenceAgreement, "confidence agreement false");
}

function testWeightedScoreDiff(): void {
  const comparison = buildRecommendationComparison({
    legacyRecommendation: buildLegacyRecommendation({
      candidate: buildCandidate({ side: "home", score: 50, confidence: "medium" }),
    }),
    decisionOutcome: buildDecisionOutcome({
      weightedScore: 0.75,
      candidate: {
        marketType: "moneyline",
        side: "home",
        label: "home moneyline",
      },
    }),
  });

  assert(
    Math.abs(comparison.weightedScoreDiff - 0.25) < 0.0001,
    "weighted score diff should be decision minus legacy normalized score"
  );
}

function testAgreementMetrics(): void {
  const comparison = buildRecommendationComparison({
    legacyRecommendation: buildLegacyRecommendation({
      candidate: buildCandidate({
        side: "home",
        score: 60,
        confidence: "medium",
        reasons: ["Strong home form"],
        warnings: ["Away defense risk"],
      }),
    }),
    decisionOutcome: buildDecisionOutcome({
      reasons: [
        {
          evidenceId: "ODDS_IMPLIED_VALUE",
          polarity: "support",
          summary: "Strong home form",
        },
      ],
      objections: [
        {
          evidenceId: "FORM_RECENT_10",
          polarity: "objection",
          summary: "Away defense risk",
        },
      ],
      candidate: {
        marketType: "moneyline",
        side: "home",
        label: "home moneyline",
      },
    }),
  });

  assert(typeof comparison.agreement.directionAgreement === "boolean", "direction agreement");
  assert(typeof comparison.agreement.marketAgreement === "boolean", "market agreement");
  assert(typeof comparison.agreement.confidenceAgreement === "boolean", "confidence agreement");
  assert(typeof comparison.agreement.weightedScoreDiff === "number", "weighted score diff metric");
  assert(comparison.agreement.topReasonOverlap >= 1, "top reason overlap");
  assert(typeof comparison.agreement.topReasonConflict === "number", "top reason conflict metric");
  assert(typeof comparison.agreement.candidateChanged === "boolean", "candidate changed metric");
}

function testReasonConflict(): void {
  const comparison = buildRecommendationComparison({
    legacyRecommendation: buildLegacyRecommendation({
      candidate: buildCandidate({
        side: "home",
        score: 60,
        confidence: "medium",
        reasons: ["Home attack edge"],
        warnings: [],
      }),
    }),
    decisionOutcome: buildDecisionOutcome({
      reasons: [],
      objections: [
        {
          evidenceId: "ODDS_IMPLIED_VALUE",
          polarity: "objection",
          summary: "Home attack edge concern",
        },
      ],
      candidate: {
        marketType: "moneyline",
        side: "home",
        label: "home moneyline",
      },
    }),
  });

  assert(comparison.reasonConflict >= 1, "reason conflict detected");
}

async function testDualWriteOff(): Promise<void> {
  await withEnv(
    {
      USE_EVIDENCE_V3_SHADOW: "false",
      USE_DECISION_V3_SHADOW: "false",
      RECOMMENDATION_DUAL_WRITE: "false",
    },
    () => {
      assert(!isRecommendationDualWriteEnabled(), "dual write flag off");
      const result = runFeatureRecommendationPipeline(
        {
          homeTeam: "Arsenal",
          awayTeam: "Chelsea",
          league: "Premier League",
          marketSelections: buildSampleMarkets(),
        },
        buildSampleMarkets()
      );
      assert(!result.shadowRunId, "no shadow run when all shadow flags off");
    }
  );
}

async function testDualWriteOn(): Promise<void> {
  await withEnv(
    {
      USE_EVIDENCE_V3_SHADOW: "false",
      USE_DECISION_V3_SHADOW: "false",
      RECOMMENDATION_DUAL_WRITE: "true",
    },
    () => {
      assert(isRecommendationDualWriteEnabled(), "dual write flag on");
      const result = runFeatureRecommendationPipeline(
        {
          homeTeam: "Arsenal",
          awayTeam: "Chelsea",
          league: "Premier League",
          marketSelections: buildSampleMarkets(),
        },
        buildSampleMarkets()
      );

      assert(Boolean(result.shadowRunId), "shadow run created for dual write");
      const record = getShadowRunRecord(result.shadowRunId!);
      assert(Boolean(record?.recommendationComparison), "comparison stored in shadow");
      assert(record!.recommendationComparison!.enabled, "comparison enabled");
      assert(
        typeof record!.recommendationComparison!.recommendationComparison
          .weightedScoreDiff === "number",
        "observability weightedScoreDiff"
      );
      assert(
        record!.recommendationComparison!.replaySnapshot.schemaVersion ===
          "recommendation-comparison-v1",
        "replay contract schema version"
      );
      assert(
        !("legacyRecommendation" in record!.recommendationComparison!.recommendationComparison),
        "observability must not expose full legacy payload"
      );
    }
  );
}

async function testRecommendationRegression(): Promise<void> {
  await withEnv(
    {
      USE_EVIDENCE_V3_SHADOW: "true",
      USE_DECISION_V3_SHADOW: "true",
      RECOMMENDATION_DUAL_WRITE: "true",
    },
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

      assert(!("recommendationComparison" in result), "pipeline must not expose comparison");
      assert(!("decisionV3" in result), "pipeline must not expose decisionV3 payload");
      assert(result.section.enabled, "recommendation section remains enabled");
      assert(
        Array.isArray(result.recommendation?.candidates),
        "legacy recommendation candidates remain available"
      );
    }
  );
}

async function testAnalysisReportRegression(): Promise<void> {
  await withEnv(
    {
      USE_EVIDENCE_V3_SHADOW: "true",
      USE_DECISION_V3_SHADOW: "true",
      RECOMMENDATION_DUAL_WRITE: "true",
    },
    () => {
      const report = analyzeMatch(SAMPLE_ODDS);
      assert(
        !("recommendationComparison" in report),
        "AnalysisReport must not expose recommendationComparison"
      );
      assert(
        JSON.stringify(report).includes("recommendationComparison") === false,
        "serialized AnalysisReport must not include recommendationComparison"
      );
      assert(report.recommendation.enabled, "recommendation section remains enabled");
      assert(report.decision !== null, "legacy decision remains available");
    }
  );
}

function testDualWriteRunnerClearsWhenDisabled(): void {
  resetShadowRunsForTests();
  const runId = createShadowRunId({ homeTeam: "Arsenal", awayTeam: "Chelsea" });
  const previous = process.env.RECOMMENDATION_DUAL_WRITE;
  delete process.env.RECOMMENDATION_DUAL_WRITE;

  try {
    runRecommendationDualWriteIfEnabled({
      runId,
      legacyRecommendation: buildLegacyRecommendation({
        candidate: buildCandidate({ side: "home", score: 60, confidence: "medium" }),
      }),
      evidenceCollection: null,
      collectorContext: {
        homeTeam: "Arsenal",
        awayTeam: "Chelsea",
        league: "Premier League",
        marketSelections: buildSampleMarkets(),
        providerAudit: null,
        teamProfiles: null,
      },
      marketSelections: buildSampleMarkets(),
    });

    assert(
      getShadowRunRecord(runId)?.recommendationComparison === null,
      "comparison cleared when dual write disabled"
    );
  } finally {
    if (previous === undefined) {
      delete process.env.RECOMMENDATION_DUAL_WRITE;
    } else {
      process.env.RECOMMENDATION_DUAL_WRITE = previous;
    }
    resetShadowRunsForTests();
  }
}

export async function runRecommendationDualWriteTests(): Promise<void> {
  testIdenticalRecommendation();
  testDifferentRecommendation();
  testCandidateChanged();
  testConfidenceChanged();
  testWeightedScoreDiff();
  testAgreementMetrics();
  testReasonConflict();
  await testDualWriteOff();
  await testDualWriteOn();
  await testRecommendationRegression();
  await testAnalysisReportRegression();
  testDualWriteRunnerClearsWhenDisabled();
}

void runRecommendationDualWriteTests()
  .then(() => {
    console.log("Recommendation dual-write tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
