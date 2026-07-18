import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import { runFeatureRecommendationPipeline } from "@/lib/analysis/featureRecommendationPipeline";
import {
  aggregateDecision,
  buildFixedDecisionConfig,
  resolveDecisionEvidenceWeights,
  runDecisionV3ShadowIfEnabled,
} from "@/lib/decision/v3";
import { collectEvidenceV3 } from "@/lib/evidence/v3";
import { buildFallbackWeightConfig } from "@/lib/recommendation/weightConfigRuntime";
import type { LoadedRuntimeWeightConfig } from "@/lib/recommendation/weightConfigTypes";
import {
  createShadowRunId,
  getShadowRunRecord,
  resetShadowRunsForTests,
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
    ],
    mockProviderCount: 0,
    unavailableProviderCount: 0,
    teamProfileProviderCount: 1,
    criticalProvidersUnavailable: false,
    providerSources: { recentForm: "teamProfile" },
  };
}

function buildEvidenceCollection() {
  return collectEvidenceV3({
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    marketSelections: buildSampleMarkets(),
    providerAudit: buildProviderAudit(),
  });
}

function buildRuntimeWeightConfig(
  overrides: Partial<LoadedRuntimeWeightConfig> = {}
): LoadedRuntimeWeightConfig {
  const fallback = buildFallbackWeightConfig();
  return {
    ...fallback,
    loadedAt: "2026-07-18T10:00:00.000Z",
    activeVersion: {
      id: "11111111-1111-4111-8111-111111111111",
      version: 7,
      status: "active",
      providerWeights: fallback.providerWeights,
      marketBlendWeight: fallback.marketBlendWeight,
      sourceReportSnapshot: {},
      createdBy: "test",
      createdAt: "2026-07-18T09:00:00.000Z",
      appliedAt: "2026-07-18T09:30:00.000Z",
      archivedAt: null,
    },
    source: "active",
    ...overrides,
  };
}

function testRuntimeWeight(): void {
  const evidence = buildEvidenceCollection();
  const resolved = resolveDecisionEvidenceWeights(
    buildRuntimeWeightConfig({
      decision: {
        evidenceWeights: {
          ODDS_IMPLIED_VALUE: 2,
          FORM_RECENT_10: 0.5,
          PROVIDER_CONFIDENCE: 1.5,
        },
      },
    })
  );

  assert(resolved.source === "runtime", "runtime source when decision weights present");
  assert(resolved.version === 7, "runtime version from activeVersion");
  assert(resolved.weights.ODDS_IMPLIED_VALUE === 2, "runtime odds weight");

  const outcome = aggregateDecision({
    evidence,
    marketSelections: buildSampleMarkets(),
    config: {
      catalogVersion: "decision-catalog-v3.0",
      weights: resolved.weights,
    },
    decisionWeightVersion: resolved.version,
    decisionWeightSource: resolved.source,
  });

  assert(outcome.decisionWeightSource === "runtime", "outcome runtime source");
  assert(outcome.decisionWeightVersion === 7, "outcome runtime version");
}

function testFallbackWeight(): void {
  const resolved = resolveDecisionEvidenceWeights(null);
  assert(resolved.source === "fallback", "fallback when no runtime config");
  assert(resolved.weights.ODDS_IMPLIED_VALUE === 1, "fallback odds weight is 1");
}

function testMissingWeight(): void {
  const resolved = resolveDecisionEvidenceWeights(
    buildRuntimeWeightConfig({
      decision: {
        evidenceWeights: {
          ODDS_IMPLIED_VALUE: 2,
        },
      },
    })
  );

  assert(resolved.weights.FORM_RECENT_10 === 1, "missing evidence weight defaults to 1");
  assert(resolved.weights.PROVIDER_CONFIDENCE === 1, "missing provider weight defaults to 1");
}

function testInvalidWeight(): void {
  const resolved = resolveDecisionEvidenceWeights(
    buildRuntimeWeightConfig({
      decision: {
        evidenceWeights: {
          ODDS_IMPLIED_VALUE: Number.NaN,
          FORM_RECENT_10: Number.POSITIVE_INFINITY,
          PROVIDER_CONFIDENCE: -3,
        },
      },
    })
  );

  assert(resolved.weights.ODDS_IMPLIED_VALUE === 1, "NaN falls back to 1");
  assert(resolved.weights.FORM_RECENT_10 === 1, "Infinity falls back to 1");
  assert(resolved.weights.PROVIDER_CONFIDENCE === 1, "negative falls back to 1");
}

function testWeightVersionAndSource(): void {
  const resolved = resolveDecisionEvidenceWeights(buildRuntimeWeightConfig());
  assert(resolved.source === "fallback", "no decision section uses fallback source");
  assert(resolved.version === 7, "version still available from activeVersion");
}

function testShadowComparison(): void {
  resetShadowRunsForTests();
  const previous = process.env.USE_DECISION_V3_SHADOW;
  process.env.USE_DECISION_V3_SHADOW = "true";

  try {
    const runId = createShadowRunId({ homeTeam: "Arsenal", awayTeam: "Chelsea" });
    const evidence = buildEvidenceCollection();

    runDecisionV3ShadowIfEnabled({
      runId,
      evidenceCollection: evidence,
      collectorContext: {
        homeTeam: "Arsenal",
        awayTeam: "Chelsea",
        marketSelections: buildSampleMarkets(),
        providerAudit: buildProviderAudit(),
      },
      marketSelections: buildSampleMarkets(),
      runtimeWeightConfig: buildRuntimeWeightConfig({
        decision: {
          evidenceWeights: {
            ODDS_IMPLIED_VALUE: 3,
            FORM_RECENT_10: 1,
            PROVIDER_CONFIDENCE: 1,
          },
        },
      }),
    });

    const record = getShadowRunRecord(runId);
    assert(Boolean(record?.decisionV3), "decision shadow context should exist");
    assert(Boolean(record?.decisionV3?.weightComparison), "weight comparison should exist");
    assert(
      typeof record!.decisionV3!.weightComparison!.weightedScoreDiff === "number",
      "weightedScoreDiff"
    );
    assert(
      typeof record!.decisionV3!.weightComparison!.decisionChanged === "boolean",
      "decisionChanged"
    );
    assert(
      typeof record!.decisionV3!.weightComparison!.confidenceChanged === "boolean",
      "confidenceChanged"
    );
    assert(
      JSON.stringify(record!.decisionV3!.decisionV3).includes("ODDS_IMPLIED_VALUE") ===
        false,
      "observability must not include full weight map"
    );
  } finally {
    if (previous === undefined) {
      delete process.env.USE_DECISION_V3_SHADOW;
    } else {
      process.env.USE_DECISION_V3_SHADOW = previous;
    }
  }
}

function testFixedConfigUnchanged(): void {
  const fixed = buildFixedDecisionConfig();
  assert(fixed.weights.ODDS_IMPLIED_VALUE === 1, "fixed config remains 1.0");
  assert(fixed.weights.FORM_RECENT_10 === 1, "fixed form weight remains 1.0");
}

async function testRecommendationRegression(): Promise<void> {
  await withEnv(
    {
      USE_EVIDENCE_V3_SHADOW: "true",
      USE_DECISION_V3_SHADOW: "true",
    },
    () => {
      const result = runFeatureRecommendationPipeline(
        {
          homeTeam: "Arsenal",
          awayTeam: "Chelsea",
          league: "Premier League",
          marketSelections: buildSampleMarkets(),
        },
        buildSampleMarkets(),
        {
          runtimeWeightConfig: buildRuntimeWeightConfig({
            decision: {
              evidenceWeights: { ODDS_IMPLIED_VALUE: 2 },
            },
          }),
        }
      );

      assert(!("decisionWeightSource" in result), "pipeline must not expose weight metadata");
      assert(result.section.enabled, "recommendation section unchanged");
    }
  );
}

async function testAnalysisReportRegression(): Promise<void> {
  await withEnv(
    {
      USE_EVIDENCE_V3_SHADOW: "true",
      USE_DECISION_V3_SHADOW: "true",
    },
    () => {
      const report = analyzeMatch(SAMPLE_ODDS, {
        runtimeWeightConfig: buildRuntimeWeightConfig({
          decision: {
            evidenceWeights: { ODDS_IMPLIED_VALUE: 2 },
          },
        }),
      });

      assert(!("decisionWeightSource" in report), "AnalysisReport must not expose weight metadata");
      assert(
        JSON.stringify(report).includes("decisionWeightVersion") === false,
        "serialized report must not include decision weight observability"
      );
    }
  );
}

export async function runDecisionV3WeightBridgeTests(): Promise<void> {
  testRuntimeWeight();
  testFallbackWeight();
  testMissingWeight();
  testInvalidWeight();
  testWeightVersionAndSource();
  testShadowComparison();
  testFixedConfigUnchanged();
  await testRecommendationRegression();
  await testAnalysisReportRegression();
}

void runDecisionV3WeightBridgeTests()
  .then(() => {
    console.log("Decision v3 weight bridge tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
