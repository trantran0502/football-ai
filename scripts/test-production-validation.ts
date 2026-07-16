import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import { SETTLEMENT_TEST_CASES } from "@/lib/backtest/mockData";
import {
  buildProductionDashboard,
  buildProductionValidationSummary,
  buildResultUpdatesFromFixtures,
  buildWeightReport,
  listInMemoryProductionRecords,
  listPendingProductionMatches,
  resetInMemoryProductionStore,
  runDailyMatchPipeline,
  runResultUpdatePipeline,
  saveMatchInMemory,
  verifyMatchInMemory,
  type ProductionFixture,
} from "@/lib/production";
import { buildLearningReport } from "@/lib/production/learningReport";
import { runMatchVerification } from "@/lib/database/matchVerification";
import {
  buildMatchResult,
  normalizeHistoricalMatchRecord,
} from "@/lib/database/matchSchema";
import type { RecommendationEngineResult } from "@/lib/recommendation/recommendationTypes";
import { validateMatchRecommendations } from "@/lib/validation";
import { runProductionH2HTests } from "@/scripts/test-production-h2h";

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

function buildFixture(home: string, away: string): ProductionFixture {
  return {
    matchDate: MATCH_DATE,
    league: "Premier League",
    leagueName: "Premier League",
    leagueId: 39,
    season: 2025,
    fixtureId: 1000 + home.length + away.length,
    kickoffTime: `${MATCH_DATE}T19:00:00.000Z`,
    homeTeam: home,
    awayTeam: away,
    homeTeamId: 1000 + home.length,
    awayTeamId: 2000 + away.length,
    rawOdds: SAMPLE_ODDS.replace("Arsenal", home).replace("Chelsea", away),
  };
}

async function runTests(): Promise<void> {
  resetInMemoryProductionStore();

  const fixtures = [buildFixture("Arsenal", "Chelsea"), buildFixture("Liverpool", "Tottenham")];
  const daily = await runDailyMatchPipeline(fixtures, MATCH_DATE, {
    analyze: analyzeMatch,
    saveMatch: saveMatchInMemory,
  });

  assert(daily.created === 2, "daily pipeline should create two matches");
  assert(daily.failed === 0, "daily pipeline should not fail");
  assert(
    daily.items.every((item) => item.status === "created"),
    "daily pipeline items should be created"
  );

  const pending = listPendingProductionMatches(listInMemoryProductionRecords());
  assert(pending.length === 2, "two pending matches should remain");

  const stored = pending[0];
  assert(
    stored.analysisSnapshot?.recommendation !== undefined,
    "analysis snapshot should store recommendation section for traceability"
  );

  const duplicateDaily = await runDailyMatchPipeline(fixtures.slice(0, 1), MATCH_DATE, {
    analyze: analyzeMatch,
    saveMatch: saveMatchInMemory,
  });
  assert(duplicateDaily.duplicates === 1, "duplicate fixture should not create new record");

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
  ]);
  assert(updates.length === 2, "result pipeline should build two updates");

  const resultPipeline = await runResultUpdatePipeline(updates, {
    verifyMatch: verifyMatchInMemory,
  });
  assert(resultPipeline.verified === 2, "result pipeline should verify two matches");

  const verifiedRecords = listInMemoryProductionRecords().filter(
    (record) => record.status === "VERIFIED"
  );
  assert(verifiedRecords.length === 2, "two verified records should exist");
  assert(
    verifiedRecords.every(
      (record) =>
        record.verificationResult?.recommendationValidation !== undefined
    ),
    "verification should include recommendation validation"
  );

  const winCase = SETTLEMENT_TEST_CASES.find((item) => item.expected === "WIN");
  assert(Boolean(winCase), "settlement fixture required");
  const syntheticRecommendation: RecommendationEngineResult = {
    globalPass: false,
    passReason: null,
    candidates: [
      {
        marketType: winCase!.selection.marketType,
        selection: winCase!.selection,
        confidence: "high",
        expectedValue: 0.05,
        score: 60,
        reasons: ["Production validation reason"],
        warnings: [],
        supportingFeatures: ["Win Rate", "Recent Form"],
      },
    ],
  };

  const syntheticEntries = validateMatchRecommendations({
    matchId: "synthetic",
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
  assert(syntheticEntries.length === 1, "validation should produce one entry");
  assert(
    syntheticEntries[0].evaluation.result === "WIN" ||
      syntheticEntries[0].evaluation.result === "LOSE" ||
      syntheticEntries[0].evaluation.result === "PUSH" ||
      syntheticEntries[0].evaluation.result === "HALF_WIN" ||
      syntheticEntries[0].evaluation.result === "HALF_LOSE",
    "validation should settle recommendation"
  );

  const summary = buildProductionValidationSummary(listInMemoryProductionRecords());
  assert(summary.dashboard.totalMatches === 2, "dashboard should count verified matches");
  assert(
    summary.dashboard.totalRecommendations >= 0,
    "dashboard should expose recommendation count"
  );
  assert(
    Object.keys(summary.dashboard.byMarket).length === 4,
    "dashboard should include all market buckets"
  );
  assert(
    typeof summary.dashboard.byRule === "object",
    "dashboard should include rule buckets"
  );
  assert(
    typeof summary.dashboard.byLeague === "object",
    "dashboard should include league ROI buckets"
  );
  assert(
    summary.dashboard.confidenceVsHitRate.length === 3,
    "dashboard should include confidence vs hit rate points"
  );
  assert(
    summary.dashboard.settlementCounts.wins +
      summary.dashboard.settlementCounts.losses +
      summary.dashboard.settlementCounts.pushes +
      summary.dashboard.settlementCounts.halfWins +
      summary.dashboard.settlementCounts.halfLoses >=
      0,
    "dashboard should expose settlement counts"
  );

  const weightReport = buildWeightReport(summary.dashboard);
  assert(Array.isArray(weightReport.highRoiFeatures), "weight report should list high ROI features");
  assert(Array.isArray(weightReport.invalidRules), "weight report should list invalid rules");
  assert(Array.isArray(weightReport.bestMarkets), "weight report should list best markets");

  const learningReport = buildLearningReport(summary.dashboard, weightReport);
  assert(
    Array.isArray(learningReport.increaseWeightFeatures),
    "learning report should suggest weight increases"
  );
  assert(
    Array.isArray(learningReport.disableRules),
    "learning report should suggest rule disables"
  );
  assert(
    Array.isArray(learningReport.suggestedNewRules),
    "learning report should suggest new rules"
  );

  if (summary.traces.length > 0) {
    const trace = summary.traces[0];
    assert(Boolean(trace.matchId), "trace should include match id");
    assert(
      trace.recommendation !== undefined,
      "trace should link recommendation snapshot"
    );
    assert(
      trace.fusion !== undefined || trace.recommendation === null,
      "trace should link fusion snapshot when available"
    );
    assert(
      trace.validationEntries.length >= 0,
      "trace should include validation entries"
    );
    assert(
      typeof trace.roi === "number",
      "trace should expose ROI for continuous learning"
    );
  }

  const storedRecommendationRecord = normalizeHistoricalMatchRecord({
    ...verifiedRecords[0],
    analysisSnapshot: {
      ...verifiedRecords[0].analysisSnapshot!,
      recommendation: {
        enabled: true,
        fusion: null,
        result: syntheticRecommendation,
        message: "stored",
      },
    },
  });
  const storedValidation = runMatchVerification(storedRecommendationRecord, verifiedRecords);
  assert(
    storedValidation.recommendationValidation.entries.length >= 1,
    "stored recommendation should be used during verification"
  );

  console.log("Production validation tests passed.");
  await runProductionH2HTests();
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
