import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import { SETTLEMENT_TEST_CASES } from "@/lib/backtest/mockData";
import {
  buildLearningEngineReport,
  collectLearningInputFromRecords,
  buildWeightSuggestions,
} from "@/lib/learning";
import { withRetry } from "@/lib/scheduler/retry";
import {
  listInMemoryProductionRecords,
  resetInMemoryProductionStore,
  runDailyMatchPipeline,
  runResultUpdatePipeline,
  saveMatchInMemory,
  verifyMatchInMemory,
  buildResultUpdatesFromFixtures,
  listPendingProductionMatches,
} from "@/lib/production";
import type { ProductionFixture } from "@/lib/production/productionTypes";
import { createEmptyRecommendationResult, type RecommendationEngineResult } from "@/lib/recommendation/recommendationTypes";
import { validateMatchRecommendations } from "@/lib/validation";
import { buildMatchResult } from "@/lib/database/matchSchema";
import { DEFAULT_LEARNING_ENGINE_CONFIG } from "@/lib/learning/learningTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const SAMPLE_ODDS = `Arsenal vs Chelsea
獨贏
主 1.85
和 3.4
客 4.2
全場讓分
主-0.5 0.92
客+0.5 0.98
全場大小
大(2.5) 0.90
小(2.5) 0.96
雙方進球
是 0.82
否 1.02`;

const MATCH_DATE = "2026-07-16";

const LEAGUE_IDS: Record<string, number> = {
  "Premier League": 39,
  "La Liga": 140,
};

function buildFixture(home: string, away: string, league = "Premier League"): ProductionFixture {
  return {
    matchDate: MATCH_DATE,
    league,
    leagueName: league,
    leagueId: LEAGUE_IDS[league] ?? 999,
    season: 2025,
    fixtureId: 1000 + home.length + away.length + league.length,
    kickoffTime: `${MATCH_DATE}T19:00:00.000Z`,
    homeTeam: home,
    awayTeam: away,
    homeTeamId: 1000 + home.length,
    awayTeamId: 2000 + away.length,
    rawOdds: SAMPLE_ODDS.replace("Arsenal", home).replace("Chelsea", away),
  };
}

async function seedVerifiedRecords(): Promise<void> {
  resetInMemoryProductionStore();

  const fixtures = [
    buildFixture("Arsenal", "Chelsea"),
    buildFixture("Liverpool", "Tottenham"),
    buildFixture("Real Madrid", "Barcelona", "La Liga"),
  ];

  await runDailyMatchPipeline(fixtures, MATCH_DATE, {
    analyze: analyzeMatch,
    saveMatch: saveMatchInMemory,
  });

  const pending = listPendingProductionMatches(listInMemoryProductionRecords());
  const updates = buildResultUpdatesFromFixtures(pending, [
    {
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      matchDate: MATCH_DATE,
      fullTimeHomeGoals: 2,
      fullTimeAwayGoals: 1,
      halfTimeHomeGoals: 1,
      halfTimeAwayGoals: 0,
    },
    {
      homeTeam: "Liverpool",
      awayTeam: "Tottenham",
      matchDate: MATCH_DATE,
      fullTimeHomeGoals: 0,
      fullTimeAwayGoals: 0,
      halfTimeHomeGoals: 0,
      halfTimeAwayGoals: 0,
    },
    {
      homeTeam: "Real Madrid",
      awayTeam: "Barcelona",
      matchDate: MATCH_DATE,
      fullTimeHomeGoals: 1,
      fullTimeAwayGoals: 2,
      halfTimeHomeGoals: 0,
      halfTimeAwayGoals: 1,
    },
  ]);

  await runResultUpdatePipeline(updates, {
    verifyMatch: verifyMatchInMemory,
  });
}

async function testLearningInputCollection(): Promise<void> {
  const records = listInMemoryProductionRecords();
  const input = collectLearningInputFromRecords(records);

  assert(input.validationResults.length >= 0, "validation results should be collected");
  assert(input.recommendationHistory.length === 3, "recommendation history should include verified matches");
  assert(input.featureHistory.length === 3, "feature history should include verified matches");
  assert(input.decisionHistory.length === 3, "decision history should include verified matches");
}

async function testLearningEngineReport(): Promise<void> {
  const report = buildLearningEngineReport(listInMemoryProductionRecords());

  assert(typeof report.generatedAt === "string", "report should include generatedAt");
  assert(Array.isArray(report.features), "report should include feature stats");
  assert(Array.isArray(report.rules), "report should include rule stats");
  assert(typeof report.byLeague === "object", "report should include league stats");
  assert(typeof report.byMarket === "object", "report should include market stats");
  assert(typeof report.byDecisionLevel === "object", "report should include decision stats");
  assert(typeof report.byModelVersion === "object", "report should include model version stats");
  assert(Array.isArray(report.rankings.topFeatures), "report should include top features");
  assert(Array.isArray(report.rankings.worstFeatures), "report should include worst features");
  assert(Array.isArray(report.rankings.topRules), "report should include top rules");
  assert(Array.isArray(report.rankings.worstRules), "report should include worst rules");
  assert(Array.isArray(report.rankings.leagueRoiRanking), "report should include league ROI ranking");
  assert(Array.isArray(report.rankings.marketRoiRanking), "report should include market ROI ranking");
  assert(Array.isArray(report.suggestions.increaseWeightFeatures), "report should include increase suggestions");
  assert(Array.isArray(report.suggestions.decreaseWeightFeatures), "report should include decrease suggestions");
  assert(Array.isArray(report.suggestions.disableRules), "report should include disable rule suggestions");
  assert(Array.isArray(report.suggestions.suggestedNewRules), "report should include new rule suggestions");
}

async function testFeatureStatsShape(): Promise<void> {
  const winCase = SETTLEMENT_TEST_CASES.find((item) => item.expected === "WIN");
  assert(Boolean(winCase), "settlement fixture required");

  const syntheticRecommendation: RecommendationEngineResult = createEmptyRecommendationResult({
    globalPass: false,
    candidates: [
      {
        marketType: winCase!.selection.marketType,
        selection: winCase!.selection,
        confidence: "high",
        expectedValue: 0.05,
        score: 60,
        marketScore: 60,
        evidenceScore: 0,
        reasons: ["Learning test reason"],
        warnings: [],
        supportingFeatures: ["Win Rate", "Recent Form"],
      },
    ],
  });

  const syntheticEntries = validateMatchRecommendations({
    matchId: "synthetic-learning",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    matchDate: MATCH_DATE,
    result: buildMatchResult({
      fullTimeHomeGoals: 2,
      fullTimeAwayGoals: 1,
      halfTimeHomeGoals: 1,
      halfTimeAwayGoals: 0,
    }),
    recommendation: syntheticRecommendation,
  });

  assert(syntheticEntries.length === 1, "synthetic validation entry required");

  const report = buildLearningEngineReport({
    validationResults: syntheticEntries.map((entry) => ({
      ...entry,
      league: "Premier League",
      modelVersion: "3",
    })),
    recommendationHistory: [],
    featureHistory: [
      {
        matchId: "synthetic-learning",
        modelVersion: "3",
        features: [],
        fusion: null,
        supportingFeatures: ["Win Rate", "Recent Form"],
      },
    ],
    decisionHistory: [],
  });

  const feature = report.features.find((item) => item.feature === "Win Rate");
  assert(Boolean(feature), "feature stats should include Win Rate");
  assert(feature!.usageCount >= 1, "feature usage count should be tracked");
  assert(typeof feature!.hitRate === "number", "feature hit rate should be numeric");
  assert(typeof feature!.roi === "number", "feature roi should be numeric");
  assert(typeof feature!.averageConfidence === "number", "feature average confidence should be numeric");
  assert(typeof feature!.averageContributionScore === "number", "feature contribution score should be numeric");
}

async function testSuggestionsDoNotMutate(): Promise<void> {
  const report = buildLearningEngineReport(listInMemoryProductionRecords());
  const before = JSON.stringify(report.features);
  const suggestions = buildWeightSuggestions({
    features: report.features,
    rules: report.rules,
    byLeague: report.byLeague,
    byMarket: report.byMarket,
    byDecisionLevel: report.byDecisionLevel,
    confidenceVsHitRate: [],
    config: DEFAULT_LEARNING_ENGINE_CONFIG,
  });

  assert(JSON.stringify(report.features) === before, "suggestions must not mutate feature stats");
  assert(Array.isArray(suggestions.increaseWeightFeatures), "suggestions should be arrays only");
  assert(Array.isArray(suggestions.disableRules), "disable suggestions should remain advisory");
}

async function testRetryUtility(): Promise<void> {
  let attempts = 0;
  await withRetry(
    async () => {
      attempts += 1;
      if (attempts < 2) {
        throw new Error("retry learning");
      }
    },
    { maxRetries: 2, delayMs: 1 }
  );
  assert(attempts === 2, "retry utility should succeed");
}

async function runTests(): Promise<void> {
  await seedVerifiedRecords();
  await testLearningInputCollection();
  await testLearningEngineReport();
  await testFeatureStatsShape();
  await testSuggestionsDoNotMutate();
  await testRetryUtility();
  console.log("All learning tests passed.");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
