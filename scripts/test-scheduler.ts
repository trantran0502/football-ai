import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import { resetAdminErrorLogsForTests } from "@/lib/admin/adminErrorLog";
import {
  listInMemoryProductionRecords,
  resetInMemoryProductionStore,
  saveMatchInMemory,
  verifyMatchInMemory,
} from "@/lib/production";
import { seedSystemSnapshotForTests, resetAdminDashboardStoreForTests } from "@/lib/admin/adminDashboardStore";
import {
  recordApiFootballRequest,
  resetApiFootballQuotaForTests,
} from "@/lib/providers/apiFootball/apiFootballQuota";
import {
  buildSchedulerPlaceholderOdds,
  disableExecutionLogPersistStoreForTests,
  enableExecutionLogPersistStoreForTests,
  enrichAnalysisReportWithFixture,
  filterFixturesByLeagueIdWhitelist,
  filterFixturesBySchedulerLeaguePolicy,
  intakeApiFixtures,
  mapApiFixtureToSchedulerSource,
  resetExecutionLogsForTests,
  resetPersistedExecutionLogsForTests,
  resetSchedulerLocksForTests,
  runDailyScheduler,
  runResultScheduler,
  getSchedulerStatus,
  setExecutionLogPersistFailureForTests,
  toProductionFixture,
  validateApiFixtureRecord,
  withRetry,
  withTimeout,
  acquireSchedulerLock,
  releaseSchedulerLock,
  listExecutionLogs,
} from "@/lib/scheduler";
import { getSchedulerConfig } from "@/lib/scheduler/schedulerConfig";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const MATCH_DATE = "2026-07-16";
const ORIGINAL_LEAGUE_ID_WHITELIST = process.env.SCHEDULER_LEAGUE_ID_WHITELIST;
const ORIGINAL_LEAGUE_WHITELIST = process.env.SCHEDULER_LEAGUE_WHITELIST;

function resetSchedulerEnv(): void {
  delete process.env.SCHEDULER_LEAGUE_ID_WHITELIST;
  delete process.env.SCHEDULER_LEAGUE_WHITELIST;
}

function restoreSchedulerEnv(): void {
  if (ORIGINAL_LEAGUE_ID_WHITELIST === undefined) {
    delete process.env.SCHEDULER_LEAGUE_ID_WHITELIST;
  } else {
    process.env.SCHEDULER_LEAGUE_ID_WHITELIST = ORIGINAL_LEAGUE_ID_WHITELIST;
  }
  if (ORIGINAL_LEAGUE_WHITELIST === undefined) {
    delete process.env.SCHEDULER_LEAGUE_WHITELIST;
  } else {
    process.env.SCHEDULER_LEAGUE_WHITELIST = ORIGINAL_LEAGUE_WHITELIST;
  }
}

function buildApiFixture(input: {
  id: number;
  home: string;
  away: string;
  league: string;
  leagueId: number | null;
  status: string;
  season?: number | null;
  kickoffTime?: string | null;
  homeGoals?: number | null;
  awayGoals?: number | null;
  htHome?: number | null;
  htAway?: number | null;
}): ApiFootballFixtureRecord {
  return {
    fixtureId: input.id,
    date: MATCH_DATE,
    kickoffTime: input.kickoffTime ?? `${MATCH_DATE}T19:00:00.000Z`,
    league: input.league,
    leagueId: input.leagueId,
    season: input.season ?? 2026,
    homeTeam: input.home,
    awayTeam: input.away,
    homeTeamId: input.id * 10,
    awayTeamId: input.id * 10 + 1,
    status: input.status,
    homeGoals: input.homeGoals ?? null,
    awayGoals: input.awayGoals ?? null,
    halfTimeHome: input.htHome ?? null,
    halfTimeAway: input.htAway ?? null,
    venue: null,
    neutralVenue: false,
  };
}

function intakeFixtures(apiFixtures: ApiFootballFixtureRecord[]) {
  return intakeApiFixtures(apiFixtures);
}

async function testDailySchedulerAllLeaguesByDefault(): Promise<void> {
  resetSchedulerEnv();
  resetInMemoryProductionStore();
  resetExecutionLogsForTests();
  resetSchedulerLocksForTests();
  resetAdminErrorLogsForTests();

  const apiFixtures = [
    buildApiFixture({
      id: 1,
      home: "Arsenal",
      away: "Chelsea",
      league: "Premier League",
      leagueId: 39,
      status: "NS",
    }),
    buildApiFixture({
      id: 2,
      home: "Real Madrid",
      away: "Barcelona",
      league: "La Liga",
      leagueId: 140,
      status: "NS",
    }),
    buildApiFixture({
      id: 3,
      home: "Club A",
      away: "Club B",
      league: "J1 League",
      leagueId: 98,
      status: "NS",
    }),
  ];

  const fetchFixtures = async () => intakeFixtures(apiFixtures);
  const listRecords = async () => listInMemoryProductionRecords();

  const result = await runDailyScheduler({
    runDate: MATCH_DATE,
    ownerId: "test-daily",
    fetchFixtures,
    saveMatch: saveMatchInMemory,
    listRecords,
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  });

  assert(!result.skippedDueToLock, "daily scheduler should acquire lock");
  assert(result.fixturesFetched === 3, "should fetch three fixtures");
  assert(result.fixturesSkipped === 0, "valid fixtures should not be skipped");
  assert(result.fixturesAfterWhitelist === 3, "default mode should keep all valid leagues");
  assert(result.pipeline.created === 3, "daily scheduler should create three records");

  const records = listInMemoryProductionRecords();
  const j1Record = records.find((record) => record.league === "J1 League");
  assert(j1Record !== undefined, "non-top-five league should be saved");
  assert(
    j1Record?.analysisSnapshot?.replay?.match.league === "J1 League",
    "analysis snapshot match league should be populated"
  );
  assert(j1Record?.analysisSnapshot?.replay?.match.leagueId === 98, "analysis snapshot leagueId required");
  assert(j1Record?.analysisSnapshot?.replay?.match.fixtureId === 3, "analysis snapshot fixtureId required");
  assert(j1Record?.analysisSnapshot?.replay?.match.season === 2026, "analysis snapshot season required");
}

async function testWhitelistFiltersWhenConfigured(): Promise<void> {
  resetSchedulerEnv();
  process.env.SCHEDULER_LEAGUE_ID_WHITELIST = "39,140";

  const fixtures = intakeFixtures([
    buildApiFixture({
      id: 1,
      home: "Arsenal",
      away: "Chelsea",
      league: "Premier League",
      leagueId: 39,
      status: "NS",
    }),
    buildApiFixture({
      id: 2,
      home: "Club A",
      away: "Club B",
      league: "J1 League",
      leagueId: 98,
      status: "NS",
    }),
  ]).fixtures;

  const config = getSchedulerConfig();
  const filtered = filterFixturesBySchedulerLeaguePolicy(fixtures, {
    leagueIdWhitelist: config.leagueIdWhitelist,
    leagueWhitelist: config.leagueWhitelist,
  });

  assert(filtered.length === 1, "configured whitelist should filter non-listed leagues");
  assert(filtered[0]?.leagueId === 39, "whitelist should keep Premier League");
}

async function testFixtureValidationFailClosed(): Promise<void> {
  const missingLeagueId = validateApiFixtureRecord(
    buildApiFixture({
      id: 10,
      home: "A",
      away: "B",
      league: "Some League",
      leagueId: null,
      status: "NS",
    })
  );
  assert(!missingLeagueId.ok && missingLeagueId.reason === "Missing league.id", "missing league.id should fail");

  const missingLeagueName = validateApiFixtureRecord(
    buildApiFixture({
      id: 11,
      home: "A",
      away: "B",
      league: "",
      leagueId: 99,
      status: "NS",
    })
  );
  assert(!missingLeagueName.ok && missingLeagueName.reason === "Missing league.name", "empty league name should fail");

  const intake = intakeFixtures([
    buildApiFixture({
      id: 12,
      home: "A",
      away: "B",
      league: "",
      leagueId: 99,
      status: "NS",
    }),
    buildApiFixture({
      id: 13,
      home: "C",
      away: "D",
      league: "Valid League",
      leagueId: 100,
      status: "NS",
    }),
  ]);

  assert(intake.skipped.length === 1, "invalid fixture should be skipped");
  assert(intake.fixtures.length === 1, "valid fixture should remain");
  assert(intake.fixtures[0]?.leagueName === "Valid League", "league name must not be empty");
}

async function testFixtureMappingFields(): Promise<void> {
  const mapped = mapApiFixtureToSchedulerSource(
    buildApiFixture({
      id: 21,
      home: "Home FC",
      away: "Away FC",
      league: "Brasileirão",
      leagueId: 71,
      status: "NS",
      season: 2025,
      kickoffTime: "2026-07-16T23:30:00.000Z",
    })
  );

  assert(mapped.fixtureId === 21, "fixtureId must map");
  assert(mapped.leagueId === 71, "leagueId must map");
  assert(mapped.leagueName === "Brasileirão", "leagueName must map");
  assert(mapped.season === 2025, "season must map");
  assert(mapped.kickoffTime === "2026-07-16T23:30:00.000Z", "kickoffTime must map");

  const production = toProductionFixture(mapped);
  const report = enrichAnalysisReportWithFixture(analyzeMatch(production.rawOdds), production);
  assert(report.match.league === "Brasileirão", "report match league must be populated");
  assert(report.match.leagueId === 71, "report match leagueId must be populated");
  assert(report.match.fixtureId === 21, "report match fixtureId must be populated");
  assert(report.match.season === 2025, "report match season must be populated");
}

async function testDuplicateProtection(): Promise<void> {
  resetSchedulerEnv();
  resetSchedulerLocksForTests();

  const fetchFixtures = async () =>
    intakeFixtures([
      buildApiFixture({
        id: 4,
        home: "Arsenal",
        away: "Chelsea",
        league: "Premier League",
        leagueId: 39,
        status: "NS",
      }),
    ]);

  const second = await runDailyScheduler({
    runDate: MATCH_DATE,
    ownerId: "test-dup",
    fetchFixtures,
    saveMatch: saveMatchInMemory,
    listRecords: async () => listInMemoryProductionRecords(),
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  });

  assert(second.pipeline.duplicates === 1, "duplicate fixture should not create new record");
  assert(second.pipeline.created === 0, "no new records on duplicate run");
}

async function testLockProtection(): Promise<void> {
  resetSchedulerLocksForTests();

  const lock = acquireSchedulerLock({
    jobName: "daily_analysis",
    ownerId: "existing-lock",
    ttlMs: 60_000,
  });
  assert(lock.acquired, "test lock should be acquired");

  const blocked = await runDailyScheduler({
    runDate: MATCH_DATE,
    ownerId: "blocked",
    fetchFixtures: async () => ({ fixtures: [], skipped: [] }),
    saveMatch: saveMatchInMemory,
    listRecords: async () => [],
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  });

  assert(blocked.skippedDueToLock, "scheduler should skip when lock is held");
  releaseSchedulerLock("daily_analysis", "existing-lock");
}

async function testRetry(): Promise<void> {
  let attempts = 0;

  await withRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("transient");
      }
      return "ok";
    },
    { maxRetries: 3, delayMs: 1 }
  );

  assert(attempts === 3, "retry should succeed on third attempt");
}

async function testTimeout(): Promise<void> {
  let timedOut = false;
  try {
    await withTimeout(
      new Promise((resolve) => setTimeout(resolve, 200)),
      20,
      "timed out"
    );
  } catch (error) {
    timedOut = error instanceof Error && error.message === "timed out";
  }
  assert(timedOut, "timeout wrapper should reject slow operations");
}

async function testResultScheduler(): Promise<void> {
  resetSchedulerEnv();
  resetSchedulerLocksForTests();
  resetExecutionLogsForTests();

  const pending = listInMemoryProductionRecords().filter((record) => record.status === "PENDING");
  assert(pending.length >= 3, "pending records required for result scheduler test");

  const apiFixtures = [
    buildApiFixture({
      id: 1,
      home: "Arsenal",
      away: "Chelsea",
      league: "Premier League",
      leagueId: 39,
      status: "FT",
      homeGoals: 2,
      awayGoals: 1,
      htHome: 1,
      htAway: 0,
    }),
    buildApiFixture({
      id: 2,
      home: "Real Madrid",
      away: "Barcelona",
      league: "La Liga",
      leagueId: 140,
      status: "FT",
      homeGoals: 0,
      awayGoals: 0,
      htHome: 0,
      htAway: 0,
    }),
    buildApiFixture({
      id: 3,
      home: "Club A",
      away: "Club B",
      league: "J1 League",
      leagueId: 98,
      status: "FT",
      homeGoals: 1,
      awayGoals: 1,
      htHome: 0,
      htAway: 1,
    }),
  ];

  const result = await runResultScheduler({
    runDate: MATCH_DATE,
    ownerId: "test-result",
    listPending: async () =>
      listInMemoryProductionRecords().filter((record) => record.status === "PENDING"),
    listRecords: async () => listInMemoryProductionRecords(),
    fetchApiFixtures: async () => apiFixtures,
    verifyMatch: verifyMatchInMemory,
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  });

  assert(!result.skippedDueToLock, "result scheduler should run");
  assert(result.updatesBuilt === 3, "result scheduler should build three updates");
  assert(result.pipeline.verified === 3, "result scheduler should verify three matches");
}

async function testSchedulerStatus(): Promise<void> {
  const status = await getSchedulerStatus({
    runDate: MATCH_DATE,
    listRecords: async () => listInMemoryProductionRecords(),
    countTodayFixtures: async () => 3,
  });

  assert(status.analyzedMatches === 3, "status should report analyzed matches");
  assert(status.validatedMatches === 3, "status should report validated matches");
  assert(status.dailySummary !== null, "status should include daily summary");
  assert(typeof status.nextRun.daily === "string", "status should include next daily run");
  assert(status.apiUsage.minuteLimit > 0, "status should include api usage");
  assert(status.lastRun.daily !== null, "status should expose last daily run");
  assert(status.recentExecutions.length > 0, "status should expose recent executions");
  assert(
    status.recentExecutions.some((entry) => entry.jobName === "daily_analysis"),
    "recent executions should include daily_analysis"
  );
}

async function testSchedulerObservabilityColdStart(): Promise<void> {
  resetInMemoryProductionStore();
  resetExecutionLogsForTests();
  resetPersistedExecutionLogsForTests();
  resetSchedulerLocksForTests();
  resetApiFootballQuotaForTests();

  const apiFixtures = [
    buildApiFixture({
      id: 10,
      home: "Team A",
      away: "Team B",
      league: "Premier League",
      leagueId: 39,
      status: "NS",
    }),
  ];

  recordApiFootballRequest();
  recordApiFootballRequest();
  recordApiFootballRequest();

  await runDailyScheduler({
    runDate: MATCH_DATE,
    ownerId: "test-cold-start",
    fetchFixtures: async () => {
      recordApiFootballRequest();
      recordApiFootballRequest();
      recordApiFootballRequest();
      return intakeFixtures(apiFixtures);
    },
    saveMatch: saveMatchInMemory,
    listRecords: async () => listInMemoryProductionRecords(),
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  });

  resetExecutionLogsForTests();
  resetApiFootballQuotaForTests();

  const status = await getSchedulerStatus({
    runDate: MATCH_DATE,
    listRecords: async () => listInMemoryProductionRecords(),
  });

  assert(status.lastRun.daily !== null, "cold start should restore lastRun.daily from persisted logs");
  assert(status.recentExecutions.length > 0, "cold start should restore recentExecutions");
  assert(
    status.recentExecutions.some((entry) => entry.jobName === "daily_analysis"),
    "cold start recentExecutions should include daily_analysis"
  );
  assert(status.apiUsage.usedToday >= 3, "cold start should preserve apiUsage from persisted logs");
}

async function testSchedulerApiUsageFromSnapshot(): Promise<void> {
  resetExecutionLogsForTests();
  resetPersistedExecutionLogsForTests();
  resetApiFootballQuotaForTests();
  resetAdminDashboardStoreForTests();

  seedSystemSnapshotForTests({
    system: {
      apiFootball: {
        usedToday: 17,
        remainingToday: 83,
        minuteUsed: 2,
        minuteLimit: 10,
      },
      googleGemini: {
        searchesToday: 0,
        remainingToday: null,
        dailyLimit: null,
      },
      supabase: {
        configured: true,
        connected: true,
        tables: {
          match_records: 0,
          beta_recommendations: 0,
          beta_rolling_reports: 0,
          admin_daily_summaries: 0,
        },
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0,
      },
      lastSyncAt: `${MATCH_DATE}T12:00:00.000Z`,
    },
    analysis: {
      pendingCount: 0,
      verifiedCount: 0,
    },
  });

  const status = await getSchedulerStatus({ runDate: MATCH_DATE });
  assert(status.apiUsage.usedToday === 17, "status should read apiUsage from persisted snapshot");
  assert(status.apiUsage.remainingToday === 83, "status should read remaining api quota from snapshot");
}

async function testExecutionLogPersistFailureWarning(): Promise<void> {
  resetInMemoryProductionStore();
  resetExecutionLogsForTests();
  resetPersistedExecutionLogsForTests();
  resetSchedulerLocksForTests();
  setExecutionLogPersistFailureForTests(true);

  const apiFixtures = [
    buildApiFixture({
      id: 11,
      home: "Alpha",
      away: "Beta",
      league: "Premier League",
      leagueId: 39,
      status: "NS",
    }),
  ];

  const result = await runDailyScheduler({
    runDate: MATCH_DATE,
    ownerId: "test-persist-failure",
    fetchFixtures: async () => intakeFixtures(apiFixtures),
    saveMatch: saveMatchInMemory,
    listRecords: async () => listInMemoryProductionRecords(),
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  });

  assert(result.pipeline.created === 1, "persist failure must not re-run analysis");
  assert(
    typeof result.observabilityWarning === "string" && result.observabilityWarning.length > 0,
    "persist failure should surface observabilityWarning"
  );

  setExecutionLogPersistFailureForTests(false);
}

async function testLeagueIdWhitelistHelper(): Promise<void> {
  const fixtures = intakeFixtures([
    buildApiFixture({
      id: 1,
      home: "A",
      away: "B",
      league: "Premier League",
      leagueId: 39,
      status: "NS",
    }),
    buildApiFixture({
      id: 2,
      home: "C",
      away: "D",
      league: "Regional",
      leagueId: 999,
      status: "NS",
    }),
  ]).fixtures;

  const filtered = filterFixturesByLeagueIdWhitelist(fixtures, [39]);
  assert(filtered.length === 1, "league id whitelist helper should filter fixtures");
}

async function testAnalyzePipelineIntegrity(): Promise<void> {
  const odds = buildSchedulerPlaceholderOdds("Liverpool", "Tottenham");
  const report = analyzeMatch(odds);
  assert(report.recommendation !== undefined, "analyzeMatch should still produce recommendation");
  assert(report.decision !== undefined, "analyzeMatch should still produce decision");
  assert(report.bettingIntelligence !== undefined, "analyzeMatch should still produce betting intelligence");
}

async function runTests(): Promise<void> {
  enableExecutionLogPersistStoreForTests();
  try {
    await testFixtureValidationFailClosed();
    await testFixtureMappingFields();
    await testWhitelistFiltersWhenConfigured();
    await testDailySchedulerAllLeaguesByDefault();
    await testDuplicateProtection();
    await testLockProtection();
    await testRetry();
    await testTimeout();
    await testResultScheduler();
    await testSchedulerStatus();
    await testSchedulerObservabilityColdStart();
    await testSchedulerApiUsageFromSnapshot();
    await testExecutionLogPersistFailureWarning();
    await testLeagueIdWhitelistHelper();
    await testAnalyzePipelineIntegrity();
    console.log("All scheduler tests passed.");
  } finally {
    disableExecutionLogPersistStoreForTests();
    restoreSchedulerEnv();
  }
}

runTests().catch((error) => {
  console.error(error);
  disableExecutionLogPersistStoreForTests();
  restoreSchedulerEnv();
  process.exit(1);
});
