import { resolveAdminSystemSnapshot } from "@/lib/admin/adminDashboardService";
import { buildUnifiedLiveMetricsSnapshot } from "@/lib/admin/unifiedLiveMetricsService";
import {
  fetchGoogleLiveResultWithOutcome,
  TEAM_CONTEXT_QUERY,
} from "@/lib/providers/googleSearch/googleSearchService";
import {
  resetGroundingRuntimeMetricsForTests,
  getGroundingRuntimeMetricsSnapshot,
} from "@/lib/admin/groundingRuntimeMetrics";
import {
  beginProfileCacheMetricsBatch,
  getProfileCacheMetricsSnapshot,
  registerProfileTeamRequest,
  resetProfileCacheMetricsForTests,
} from "@/lib/teamProfile/profileCacheMetrics";
import {
  createDeferredFixtureAttemptState,
  isTerminalDeferredFixture,
  registerDeferredFixtureAttempt,
} from "@/lib/scheduler/deferredAnalysisPolicy";
import { selectFixtureBatch } from "@/lib/scheduler/dailyScheduler";
import type { DailyAnalysisQueueState } from "@/lib/scheduler/dailyAnalysisQueueStore";
import type { ProductionFixture } from "@/lib/production/productionTypes";
import { buildEvidenceCoverageDiagnostics } from "@/lib/analysis/evidenceCoverageDiagnostics";
import { resolveProviderHealthStatuses } from "@/lib/admin/providerHealthResolver";
import { buildProductionBaselineWeightConfig } from "@/lib/recommendation/productionWeightConfig";
import { summarizePendingRecordClassifications } from "@/lib/supabase/services/pendingRecordClassification";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function buildFixture(id: number): ProductionFixture {
  return {
    matchDate: "2026-07-20",
    league: "Premier League",
    leagueName: "Premier League",
    leagueId: 39,
    season: 2026,
    fixtureId: id,
    kickoffTime: "2026-07-20T15:00:00.000Z",
    homeTeam: "Home FC",
    awayTeam: "Away FC",
    homeTeamId: 1,
    awayTeamId: 2,
    rawOdds: "sample odds",
  };
}

async function testGroundingNotConfigured(): Promise<void> {
  resetGroundingRuntimeMetricsForTests();
  const previous = process.env.GOOGLE_GEMINI_API_KEY;
  delete process.env.GOOGLE_GEMINI_API_KEY;
  const outcome = await fetchGoogleLiveResultWithOutcome({
    homeTeam: "A",
    awayTeam: "B",
    matchDate: "2026-07-20",
  });
  if (previous) {
    process.env.GOOGLE_GEMINI_API_KEY = previous;
  }
  assert(outcome.configured === false, "grounding should be not configured without API key");
  assert(outcome.failureReason === "not_configured", "should expose not_configured reason");
  const metrics = getGroundingRuntimeMetricsSnapshot();
  assert(metrics.groundingFailureReason === "not_configured", "metrics should record not_configured");
}

function testProfileBatchDedup(): void {
  resetProfileCacheMetricsForTests();
  beginProfileCacheMetricsBatch();
  assert(registerProfileTeamRequest(1, 39, 2026) === "new", "first request should be new");
  assert(registerProfileTeamRequest(1, 39, 2026) === "duplicate", "duplicate team should dedupe");
  const metrics = getProfileCacheMetricsSnapshot();
  assert(metrics.duplicateTeamRequestsAvoided === 1, "should count avoided duplicate requests");
}

function testDeferredFixturePriorityAndTerminal(): void {
  const queue: DailyAnalysisQueueState = {
    runDate: "2026-07-20",
    fixtureIds: [101, 102, 103],
    cursor: 0,
    completedFixtureIds: [],
    failedFixtureIds: [],
    deferredFixtureIds: [103],
    deferredTeamProfileKeys: [],
    terminalDeferredFixtureIds: [],
    status: "in_progress",
    updatedAt: "2026-07-20T00:00:00.000Z",
  };
  const fixtures = [buildFixture(101), buildFixture(102), buildFixture(103)];
  const batch = selectFixtureBatch(fixtures, queue, 2);
  // New fixtures first; deferred gets at most 1 retry slot and cannot freeze cursor.
  assert(batch.batch[0]?.fixtureId === 101, "new fixture should be preferred first");
  assert(
    batch.batch.some((fixture) => fixture.fixtureId === 103),
    "deferred fixture may still occupy one retry slot"
  );
  assert(batch.cursorAfter > batch.cursorBefore, "cursor must advance past new scans");
  assert(batch.newFixturesSelected >= 1, "at least one new fixture should be selected");
  assert(batch.retryFixturesSelected <= 1, "deferred retries must be capped at 1");

  const monopolizeQueue: DailyAnalysisQueueState = {
    ...queue,
    fixtureIds: [201, 202, 203, 204, 205, 206],
    cursor: 0,
    deferredFixtureIds: [201, 202, 203],
  };
  const monopolizeFixtures = [
    buildFixture(201),
    buildFixture(202),
    buildFixture(203),
    buildFixture(204),
    buildFixture(205),
    buildFixture(206),
  ];
  const capped = selectFixtureBatch(monopolizeFixtures, monopolizeQueue, 3);
  assert(capped.retryFixturesSelected === 1, "batch=3 must allow at most 1 deferred retry");
  assert(capped.newFixturesSelected === 2, "batch=3 should prefer 2 new fixtures");
  assert(capped.cursorAfter > 0, "cursor must advance even when deferred exist");
  assert(
    capped.batch.filter((fixture) =>
      monopolizeQueue.deferredFixtureIds.includes(fixture.fixtureId)
    ).length === 1,
    "deferred must not monopolize the batch"
  );

  const state = createDeferredFixtureAttemptState();
  for (let index = 0; index < 5; index += 1) {
    registerDeferredFixtureAttempt({ fixtureId: 103, state });
  }
  assert(isTerminalDeferredFixture(103, state), "fixture should become terminal after max attempts");
}

function testPendingClassification(): void {
  const records: HistoricalMatchRecord[] = [
    {
      id: "pending-upcoming",
      date: "2026-07-21",
      matchDate: "2026-07-21",
      league: "Premier League",
      homeTeam: "A",
      awayTeam: "B",
      rawOdds: "",
      marketSelections: [],
      result: null,
      analysisSnapshot: null,
      candidates: [],
      status: "PENDING",
      verificationResult: null,
      fixtureId: 1001,
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
    },
  ];
  const summary = summarizePendingRecordClassifications(
    records,
    new Date("2026-07-20T12:00:00.000Z")
  );
  assert(summary.byCategory.upcoming === 1, "future pending should classify as upcoming");
}

function testProviderHealthNotConfigured(): void {
  const previous = process.env.GOOGLE_GEMINI_API_KEY;
  delete process.env.GOOGLE_GEMINI_API_KEY;
  const statuses = resolveProviderHealthStatuses([]);
  if (previous) {
    process.env.GOOGLE_GEMINI_API_KEY = previous;
  }
  const google = statuses.find((entry) => entry.provider === "Google Search");
  assert(google?.state === "NOT_CONFIGURED", "google health should be NOT_CONFIGURED without key");
}

function testProductionBaselineWeightConfig(): void {
  const config = buildProductionBaselineWeightConfig(new Date("2026-07-20T00:00:00.000Z"));
  assert(config.source === "production_baseline", "production baseline should use production_baseline source");
  assert(config.activeVersion?.id != null, "production baseline should have version id");
}

async function testAdminSnapshotUsesLiveSource(): Promise<void> {
  const resolved = await resolveAdminSystemSnapshot(new Date("2026-07-20T12:00:00.000Z"), {
    buildLiveSnapshot: async () => ({
      system: {
        apiFootball: {
          usedToday: 10,
          remainingToday: 90,
          minuteUsed: 1,
          minuteLimit: 10,
        },
        googleGemini: { searchesToday: 0, remainingToday: 100, dailyLimit: 100 },
        supabase: {
          configured: true,
          connected: true,
          tables: {
            match_records: 124,
            beta_recommendations: 0,
            beta_rolling_reports: 0,
            admin_daily_summaries: 0,
          },
        },
        cache: { hitRate: 0.5, hits: 1, misses: 1 },
        lastSyncAt: "2026-07-20T12:00:00.000Z",
      },
      analysis: { pendingCount: 11, verifiedCount: 110, anomalyCount: 0 },
    }),
    getSystemSnapshotRecord: async () => ({
      payload: {
        system: {
          apiFootball: { usedToday: 24, remainingToday: 86, minuteUsed: 0, minuteLimit: 10 },
          googleGemini: { searchesToday: 0, remainingToday: 100, dailyLimit: 100 },
          supabase: {
            configured: true,
            connected: true,
            tables: {
              match_records: 24,
              beta_recommendations: 0,
              beta_rolling_reports: 0,
              admin_daily_summaries: 0,
            },
          },
          cache: { hitRate: 0, hits: 0, misses: 0 },
          lastSyncAt: "2026-07-20T08:00:00.000Z",
        },
        analysis: { pendingCount: 7, verifiedCount: 7, anomalyCount: 0 },
      },
      updatedAt: "2026-07-20T08:00:00.000Z",
    }),
  });
  assert(resolved.metadata.dataSource === "live", "admin snapshot should prefer live source");
  assert(resolved.snapshot.analysis.verifiedCount === 110, "admin snapshot should not use stale counts");
}

function testEvidenceCoverageDoesNotFabricateXg(): void {
  const coverage = buildEvidenceCoverageDiagnostics({});
  const xg = coverage.find((entry) => entry.provider === "xg");
  assert(xg?.available === false, "xg should remain unavailable without data");
  assert(xg?.unavailableReason != null, "xg should include unavailable reason");
}

async function runTests(): Promise<void> {
  await testGroundingNotConfigured();
  testProfileBatchDedup();
  testDeferredFixturePriorityAndTerminal();
  testPendingClassification();
  testProviderHealthNotConfigured();
  testProductionBaselineWeightConfig();
  await testAdminSnapshotUsesLiveSource();
  testEvidenceCoverageDoesNotFabricateXg();
  void buildUnifiedLiveMetricsSnapshot;
  console.log("productionDataCompletenessPhase2.test.ts passed");
}

void runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
