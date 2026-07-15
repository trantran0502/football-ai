import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import {
  aggregateDailySummaryFromRecords,
} from "@/lib/admin/adminDailyAggregation";
import { buildAdminDashboardResponse } from "@/lib/admin/adminDashboardService";
import type { AdminDailySummaryPayload } from "@/lib/admin/adminDashboardTypes";
import {
  resetAdminDashboardStoreForTests,
  seedDailySummaryForTests,
  seedSystemSnapshotForTests,
} from "@/lib/admin/adminDashboardStore";
import {
  logAdminError,
  resetAdminErrorLogsForTests,
} from "@/lib/admin/adminErrorLog";
import {
  recordCacheHit,
  recordCacheMiss,
  resetCacheMetricsForTests,
} from "@/lib/admin/adminCacheMetrics";
import {
  recordGoogleSearchRequest,
  resetGoogleQuotaForTests,
} from "@/lib/admin/adminGoogleQuota";
import {
  resetInMemoryProductionStore,
  runDailyMatchPipeline,
  runResultUpdatePipeline,
  saveMatchInMemory,
  verifyMatchInMemory,
  buildResultUpdatesFromFixtures,
  listInMemoryProductionRecords,
  listPendingProductionMatches,
  buildProductionValidationSummary,
} from "@/lib/production";
import { recordApiFootballRequest, resetApiFootballQuotaForTests } from "@/lib/providers/apiFootball/apiFootballQuota";

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
全場大小
大(2.5) 0.90
小(2.5) 0.96`;

const MATCH_DATE = "2026-07-16";

function createEmptyBucket() {
  return {
    sampleSize: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    halfWins: 0,
    halfLoses: 0,
    hitRate: 0,
    roi: 0,
    averageOdds: 0,
    averageConfidence: 0,
    totalProfit: 0,
  };
}

function bucketWithRoi(sampleSize: number, roi: number, hitRate: number) {
  return {
    ...createEmptyBucket(),
    sampleSize,
    roi,
    hitRate,
    totalProfit: roi * sampleSize,
  };
}

function buildSummary(
  summaryDate: string,
  overrides: Partial<AdminDailySummaryPayload> = {}
): AdminDailySummaryPayload {
  return {
    summaryDate,
    analyzedCount: 2,
    recommendedCount: 1,
    passCount: 1,
    verifiedCount: 1,
    recommendationCount: 3,
    hitRate: 0.667,
    roi: 0.12,
    byMarket: {
      Moneyline: bucketWithRoi(1, 0.2, 1),
      Handicap: bucketWithRoi(1, 0.05, 0.5),
      OverUnder: createEmptyBucket(),
      BTTS: createEmptyBucket(),
    },
    byLeague: {
      "Premier League": bucketWithRoi(2, 0.12, 0.667),
    },
    byFeature: {
      "Recent Form": bucketWithRoi(2, 0.15, 0.7),
      "Win Rate": bucketWithRoi(1, -0.05, 0.4),
    },
    byRule: {
      "confidence:high": bucketWithRoi(1, 0.2, 1),
      "confidence:low": bucketWithRoi(1, -0.08, 0.3),
    },
    aiSuggestions: {
      increaseWeightFeatures: ["Recent Form"],
      decreaseWeightFeatures: ["Win Rate"],
      disableRules: ["confidence:low"],
      suggestedNewRules: ["Increase exposure to Moneyline when confidence is high."],
    },
    ...overrides,
  };
}

async function runTests(): Promise<void> {
  resetAdminDashboardStoreForTests();
  resetAdminErrorLogsForTests();
  resetCacheMetricsForTests();
  resetGoogleQuotaForTests();
  resetApiFootballQuotaForTests();
  resetInMemoryProductionStore();

  recordApiFootballRequest();
  recordApiFootballRequest();
  recordGoogleSearchRequest();
  recordCacheHit();
  recordCacheHit();
  recordCacheMiss();

  logAdminError({
    category: "api",
    message: "API-Football transient 429",
  });
  logAdminError({
    category: "validation",
    message: "Validation settlement mismatch",
  });

  seedSystemSnapshotForTests({
    system: {
      apiFootball: {
        usedToday: 2,
        remainingToday: 98,
        minuteUsed: 2,
        minuteLimit: 10,
      },
      googleGemini: {
        searchesToday: 1,
        remainingToday: 99,
        dailyLimit: 100,
      },
      supabase: {
        configured: true,
        connected: true,
        tables: {
          match_records: 10,
          beta_recommendations: 0,
          beta_rolling_reports: 0,
          admin_daily_summaries: 2,
        },
      },
      cache: {
        hitRate: 0.667,
        hits: 2,
        misses: 1,
      },
      lastSyncAt: "2026-07-16T00:00:00.000Z",
    },
    analysis: {
      pendingCount: 3,
      verifiedCount: 7,
    },
  });

  seedDailySummaryForTests(buildSummary(MATCH_DATE));
  seedDailySummaryForTests(
    buildSummary("2026-07-15", {
      recommendationCount: 2,
      roi: 0.05,
      hitRate: 0.5,
    })
  );
  seedDailySummaryForTests(
    buildSummary("2026-06-01", {
      recommendationCount: 1,
      roi: -0.02,
      hitRate: 0.0,
    })
  );

  const dashboard = await buildAdminDashboardResponse(new Date(`${MATCH_DATE}T12:00:00.000Z`));

  assert(dashboard.system.apiFootball.usedToday === 2, "dashboard should expose API usage");
  assert(dashboard.system.googleGemini.searchesToday === 1, "dashboard should expose Google searches");
  assert(dashboard.system.supabase.connected, "dashboard should expose Supabase status");
  assert(dashboard.system.cache.hits === 2, "dashboard should expose cache hits");
  assert(dashboard.analysis.analyzedToday === 2, "dashboard should expose today analyzed count");
  assert(dashboard.analysis.pendingCount === 3, "dashboard should expose pending count");
  assert(dashboard.performance.roiToday === 0.12, "dashboard should expose today ROI");
  assert(dashboard.performance.totalRecommendations === 6, "dashboard should sum recommendation counts");
  assert(
    dashboard.byMarket.Moneyline.sampleSize >= 1,
    "dashboard should aggregate market stats from daily summaries"
  );
  assert(
    dashboard.byLeague["Premier League"].sampleSize >= 2,
    "dashboard should aggregate league stats"
  );
  assert(
    dashboard.byFeature["Recent Form"].roi > 0,
    "dashboard should aggregate feature ROI"
  );
  assert(
    dashboard.byRule["confidence:high"].sampleSize >= 1,
    "dashboard should aggregate rule stats"
  );
  assert(
    dashboard.aiSuggestions.increaseWeightFeatures.includes("Recent Form"),
    "dashboard should expose AI suggestions"
  );
  assert(dashboard.recentErrors.length >= 2, "dashboard should include recent errors");

  await runDailyMatchPipeline(
    [
      {
        matchDate: MATCH_DATE,
        league: "Premier League",
        leagueName: "Premier League",
        leagueId: 39,
        season: 2025,
        fixtureId: 1001,
        kickoffTime: `${MATCH_DATE}T19:00:00.000Z`,
        homeTeam: "Arsenal",
        awayTeam: "Chelsea",
        homeTeamId: 42,
        awayTeamId: 49,
        rawOdds: SAMPLE_ODDS,
      },
    ],
    MATCH_DATE,
    {
      analyze: analyzeMatch,
      saveMatch: saveMatchInMemory,
    }
  );

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
  ]);
  await runResultUpdatePipeline(updates, { verifyMatch: verifyMatchInMemory });

  const verified = listInMemoryProductionRecords().filter((record) => record.status === "VERIFIED");
  const productionSummary = buildProductionValidationSummary(verified);
  const dailySummary = aggregateDailySummaryFromRecords(MATCH_DATE, listInMemoryProductionRecords());

  assert(dailySummary.analyzedCount >= 1, "daily aggregation should count analyzed matches");
  assert(
    productionSummary.dashboard.totalMatches >= 1,
    "validation summary should include verified matches"
  );
  assert(
    typeof productionSummary.dashboard.settlementCounts.wins === "number",
    "validation should expose settlement counts"
  );

  console.log("Dashboard tests passed.");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
