import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import {
  resetFeatureRecommendationPipelineForTests,
  runFeatureRecommendationPipeline,
} from "@/lib/analysis/featureRecommendationPipeline";
import {
  EVIDENCE_V3_CATALOG,
  EVIDENCE_V3_CATALOG_IDS,
  EVIDENCE_V3_CATALOG_VERSION,
  buildEvidenceV3Observability,
  collectEvidenceV3,
  getEvidenceV3ProviderById,
  getEvidenceV3Providers,
  isEvidenceV3ShadowEnabled,
} from "@/lib/evidence/v3";
import { getShadowRunRecord, resetShadowRunsForTests } from "@/lib/shadow/shadowRunScope";
import type { ProviderResolutionAudit } from "@/lib/providers/teamProfile/teamProfileProviderPipeline";
import type { MatchTeamProfilesSnapshot } from "@/lib/teamProfile/teamProfileTypes";
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
    resetFeatureRecommendationPipelineForTests();
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

function buildTeamProfiles(): MatchTeamProfilesSnapshot {
  return {
    home: {
      teamId: 1,
      teamName: "Arsenal",
      leagueId: 39,
      leagueName: "Premier League",
      season: 2026,
      requestedSeason: 2026,
      isHistoricalBaseline: false,
      stalenessYears: null,
      sampleSize: 10,
      recent10Wins: 7,
      recent10Draws: 1,
      recent10Losses: 2,
      recent10PointsPerGame: 2.2,
      recent10AvgGoals: 2.1,
      recent10AvgConceded: 0.9,
      home5Matches: 5,
      home5WinRate: 0.8,
      home5AvgGoals: 2.4,
      home5AvgConceded: 0.7,
      away5Matches: 5,
      away5WinRate: 0.6,
      away5AvgGoals: 1.8,
      away5AvgConceded: 1.1,
      bttsRate: 0.5,
      over25Rate: 0.6,
      over35Rate: 0.25,
      under25Rate: 0.4,
      cleanSheetRate: 0.4,
      failedToScoreRate: 0.1,
      avgShots: 14,
      avgShotsOnTarget: 5,
      avgPossession: 58,
      avgXg: 1.9,
      avgXga: 0.9,
      formScore: 78,
      momentumScore: 72,
      source: "api-football",
      dataCompleteness: 0.92,
      calculatedAt: "2026-07-18T10:00:00.000Z",
    },
    away: {
      teamId: 2,
      teamName: "Chelsea",
      leagueId: 39,
      leagueName: "Premier League",
      season: 2026,
      requestedSeason: 2026,
      isHistoricalBaseline: false,
      stalenessYears: null,
      sampleSize: 10,
      recent10Wins: 4,
      recent10Draws: 2,
      recent10Losses: 4,
      recent10PointsPerGame: 1.4,
      recent10AvgGoals: 1.3,
      recent10AvgConceded: 1.4,
      home5Matches: 5,
      home5WinRate: 0.5,
      home5AvgGoals: 1.5,
      home5AvgConceded: 1.2,
      away5Matches: 5,
      away5WinRate: 0.3,
      away5AvgGoals: 1.1,
      away5AvgConceded: 1.6,
      bttsRate: 0.45,
      over25Rate: 0.5,
      over35Rate: 0.15,
      under25Rate: 0.5,
      cleanSheetRate: 0.25,
      failedToScoreRate: 0.2,
      avgShots: 11,
      avgShotsOnTarget: 4,
      avgPossession: 49,
      avgXg: 1.4,
      avgXga: 1.3,
      formScore: 55,
      momentumScore: 48,
      source: "api-football",
      dataCompleteness: 0.9,
      calculatedAt: "2026-07-18T10:00:00.000Z",
    },
    completeness: 0.91,
    warnings: [],
  };
}

function buildProviderAudit(
  overrides: Partial<ProviderResolutionAudit> = {}
): ProviderResolutionAudit {
  return {
    resolved: [],
    mockProviderCount: 0,
    unavailableProviderCount: 0,
    teamProfileProviderCount: 0,
    criticalProvidersUnavailable: false,
    providerSources: {},
    ...overrides,
  };
}

function testRegistry(): void {
  const providers = getEvidenceV3Providers();
  assert(providers.length === 3, "registry should expose three providers");
  assert(
    EVIDENCE_V3_CATALOG.length === 3,
    "catalog should define three evidence entries"
  );
  assert(
    EVIDENCE_V3_CATALOG_IDS.join(",") ===
      "ODDS_IMPLIED_VALUE,FORM_RECENT_10,PROVIDER_CONFIDENCE",
    "catalog ids"
  );
  assert(
    getEvidenceV3ProviderById("ODDS_IMPLIED_VALUE")?.id === "ODDS_IMPLIED_VALUE",
    "provider lookup"
  );
}

function testProviderContract(): void {
  const provider = getEvidenceV3ProviderById("ODDS_IMPLIED_VALUE");
  assert(Boolean(provider), "odds provider should exist");
  const outcome = provider!.collect({
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    marketSelections: buildSampleMarkets(),
    providerAudit: null,
  });
  assert(outcome.status === "collected", "odds provider should collect");
  if (outcome.status === "collected") {
    assert(outcome.result.id === "ODDS_IMPLIED_VALUE", "result id");
    assert(
      outcome.result.score >= -1 && outcome.result.score <= 1,
      "score bounds"
    );
    assert(
      outcome.result.confidence >= 0 && outcome.result.confidence <= 1,
      "confidence bounds"
    );
    assert(outcome.result.reason.length > 0, "reason required");
  }
}

function testMissingHandling(): void {
  const throwingProvider = {
    id: "THROWS",
    collect() {
      throw new Error("boom");
    },
  };

  const result = collectEvidenceV3(
    {
      homeTeam: "A",
      awayTeam: "B",
      marketSelections: [],
      providerAudit: null,
    },
    [...getEvidenceV3Providers(), throwingProvider]
  );

  assert(result.missing.includes("THROWS"), "throwing provider should be missing");
  assert(result.catalogVersion === EVIDENCE_V3_CATALOG_VERSION, "catalog version");
}

function testOddsImpliedValue(): void {
  const result = collectEvidenceV3({
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    marketSelections: buildSampleMarkets(),
    providerAudit: null,
  });

  const odds = result.evidence.find((item) => item.id === "ODDS_IMPLIED_VALUE");
  assert(Boolean(odds), "odds implied value should collect");
  assert(result.missing.includes("FORM_RECENT_10"), "form should be missing without team profile");
  assert(result.missing.includes("PROVIDER_CONFIDENCE"), "provider confidence missing without audit");
}

function testFormMissingWithoutTeamProfile(): void {
  const result = collectEvidenceV3({
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    marketSelections: buildSampleMarkets(),
    providerAudit: buildProviderAudit({
      providerSources: { recentForm: "mock" },
    }),
  });

  assert(result.missing.includes("FORM_RECENT_10"), "mock recent form should count as missing");
}

function testFormRecent10WithTeamProfiles(): void {
  const result = collectEvidenceV3({
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    marketSelections: buildSampleMarkets(),
    providerAudit: buildProviderAudit({
      providerSources: { recentForm: "teamProfile" },
      teamProfileProviderCount: 1,
      resolved: [
        {
          key: "recentForm",
          source: "teamProfile",
          confidence: 0.9,
          warnings: [],
          data: {
            home: {
              teamName: "Arsenal",
              sampleSize: 10,
              wins: 7,
              draws: 1,
              losses: 2,
              goalsFor: 21,
              goalsAgainst: 9,
              winRate: 0.7,
              avgGoalsFor: 2.1,
              avgGoalsAgainst: 0.9,
              goalDifferencePerMatch: 1.2,
              venueWinRate: 0.8,
              momentum: 0.4,
              cleanSheetRate: 0.4,
              failedToScoreRate: 0.1,
            },
            away: {
              teamName: "Chelsea",
              sampleSize: 10,
              wins: 4,
              draws: 2,
              losses: 4,
              goalsFor: 13,
              goalsAgainst: 14,
              winRate: 0.4,
              avgGoalsFor: 1.3,
              avgGoalsAgainst: 1.4,
              goalDifferencePerMatch: -0.1,
              venueWinRate: 0.3,
              momentum: -0.1,
              cleanSheetRate: 0.25,
              failedToScoreRate: 0.2,
            },
          },
          available: true,
        },
      ],
    }),
    teamProfiles: buildTeamProfiles(),
  });

  const form = result.evidence.find((item) => item.id === "FORM_RECENT_10");
  assert(Boolean(form), "form evidence should collect with team profile");
  assert((form?.score ?? 0) > 0, "home form edge should be positive");
}

function testProviderConfidence(): void {
  const result = collectEvidenceV3({
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    marketSelections: buildSampleMarkets(),
    providerAudit: buildProviderAudit({
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
      teamProfileProviderCount: 1,
      providerSources: {
        recentForm: "teamProfile",
        homeAway: "mock",
      },
    }),
  });

  const confidence = result.evidence.find(
    (item) => item.id === "PROVIDER_CONFIDENCE"
  );
  assert(Boolean(confidence), "provider confidence should collect");
}

function testObservabilityShape(): void {
  const result = collectEvidenceV3({
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    marketSelections: buildSampleMarkets(),
    providerAudit: null,
  });
  const observability = buildEvidenceV3Observability(result);

  assert(
    observability.catalogVersion === EVIDENCE_V3_CATALOG_VERSION,
    "observability catalog version"
  );
  assert(Array.isArray(observability.collected), "collected array");
  assert(observability.collected.includes("ODDS_IMPLIED_VALUE"), "collected ids");
  assert(JSON.stringify(observability).includes("rawMetrics") === false, "no raw metrics in observability");
}

async function testShadowFlagOff(): Promise<void> {
  await withEnv(
    { USE_EVIDENCE_V3_SHADOW: "false", USE_DECISION_V3_SHADOW: "false", RECOMMENDATION_DUAL_WRITE: "false" },
    async () => {
    assert(!isEvidenceV3ShadowEnabled(), "shadow flag should be off");
    const result = runFeatureRecommendationPipeline(
      {
        homeTeam: "Arsenal",
        awayTeam: "Chelsea",
        league: "Premier League",
        marketSelections: buildSampleMarkets(),
      },
      buildSampleMarkets()
    );
    assert(!result.shadowRunId, "shadow run should not be created when flag is off");
  }
  );
}

async function testShadowFlagOn(): Promise<void> {
  await withEnv({ USE_EVIDENCE_V3_SHADOW: "true" }, async () => {
    assert(isEvidenceV3ShadowEnabled(), "shadow flag should be on");
    const result = runFeatureRecommendationPipeline(
      {
        homeTeam: "Arsenal",
        awayTeam: "Chelsea",
        league: "Premier League",
        marketSelections: buildSampleMarkets(),
      },
      buildSampleMarkets()
    );
    assert(Boolean(result.shadowRunId), "shadow run id should be created");
    const shadow = getShadowRunRecord(result.shadowRunId!)?.evidenceV3;
    assert(Boolean(shadow), "shadow context should be populated");
    assert(shadow!.enabled, "shadow enabled flag");
    assert(
      shadow!.evidenceV3.catalogVersion === EVIDENCE_V3_CATALOG_VERSION,
      "shadow observability version"
    );
    assert(
      shadow!.evidenceV3.collected.includes("ODDS_IMPLIED_VALUE"),
      "shadow collected odds evidence"
    );
  });
}

async function testNoAnalysisReportRegression(): Promise<void> {
  await withEnv({ USE_EVIDENCE_V3_SHADOW: "true" }, () => {
    const report = analyzeMatch(SAMPLE_ODDS);
    assert(!("evidenceV3" in report), "AnalysisReport must not expose evidenceV3");
    assert(
      JSON.stringify(report).includes("evidenceV3") === false,
      "serialized AnalysisReport must not include evidenceV3"
    );
    assert(report.recommendation.enabled, "recommendation section should remain enabled");
    assert(report.decision !== null, "decision should remain available");
    assert(
      Array.isArray(report.recommendation.result?.candidates),
      "recommendation candidates should remain available"
    );
  });
}

async function testNoRecommendationRegression(): Promise<void> {
  await withEnv(
    { USE_EVIDENCE_V3_SHADOW: "true", USE_DECISION_V3_SHADOW: "false" },
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

    assert(!("evidenceV3" in result), "pipeline result must not include evidenceV3");
    assert(!("decisionV3" in result), "pipeline result must not include decisionV3");
    assert(result.section.enabled, "recommendation section remains enabled");
    assert(
      result.evidenceReport === null || typeof result.evidenceReport === "object",
      "v1 evidence report contract unchanged"
    );
    assert(
      Boolean(getShadowRunRecord(result.shadowRunId!)?.evidenceV3),
      "v3 evidence collected via shadow side channel"
    );
  });
}

export async function runEvidenceV3Tests(): Promise<void> {
  testRegistry();
  testProviderContract();
  testMissingHandling();
  testOddsImpliedValue();
  testFormMissingWithoutTeamProfile();
  testFormRecent10WithTeamProfiles();
  testProviderConfidence();
  testObservabilityShape();
  await testShadowFlagOff();
  await testShadowFlagOn();
  await testNoAnalysisReportRegression();
  await testNoRecommendationRegression();
}

void runEvidenceV3Tests()
  .then(() => {
    console.log("Evidence v3 tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
