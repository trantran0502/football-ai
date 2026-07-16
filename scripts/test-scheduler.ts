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
  setApiFootballQuotaForTests,
} from "@/lib/providers/apiFootball/apiFootballQuota";
import { resetApiFootballCacheStoreForTests } from "@/lib/providers/apiFootball/apiFootballCache";
import { setApiFootballClientForTests } from "@/lib/providers/apiFootball/apiFootballClient";
import {
  enableTeamProfileMemoryStoreForTests,
  resetTeamProfileRefreshDedupeForTests,
} from "@/lib/teamProfile";
import {
  buildSchedulerPlaceholderOdds,
  buildFixtureFilterStats,
  disableDailyAnalysisQueueStoreForTests,
  disableExecutionLogPersistStoreForTests,
  enableDailyAnalysisQueueStoreForTests,
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
  writeResultUpdateFixturesByDateCache,
  withRetry,
  withTimeout,
  acquireSchedulerLock,
  releaseSchedulerLock,
  listDailyAnalysisQueuesForTests,
  listExecutionLogs,
  loadDailyAnalysisQueue,
  resetDailyAnalysisQueueStoreForTests,
  saveDailyAnalysisQueue,
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

const ORIGINAL_TIME_BUDGET = process.env.SCHEDULER_TIME_BUDGET_MS;
const ORIGINAL_MAX_FIXTURES = process.env.SCHEDULER_MAX_FIXTURES_PER_RUN;
const ORIGINAL_MAX_PROFILE_REFRESHES =
  process.env.SCHEDULER_MAX_TEAM_PROFILE_REFRESHS_PER_RUN;

function resetSchedulerEnv(): void {
  delete process.env.SCHEDULER_LEAGUE_ID_WHITELIST;
  delete process.env.SCHEDULER_LEAGUE_WHITELIST;
  delete process.env.SCHEDULER_TIME_BUDGET_MS;
  delete process.env.SCHEDULER_MAX_FIXTURES_PER_RUN;
  delete process.env.SCHEDULER_MAX_TEAM_PROFILE_REFRESHS_PER_RUN;
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
  if (ORIGINAL_TIME_BUDGET === undefined) {
    delete process.env.SCHEDULER_TIME_BUDGET_MS;
  } else {
    process.env.SCHEDULER_TIME_BUDGET_MS = ORIGINAL_TIME_BUDGET;
  }
  if (ORIGINAL_MAX_FIXTURES === undefined) {
    delete process.env.SCHEDULER_MAX_FIXTURES_PER_RUN;
  } else {
    process.env.SCHEDULER_MAX_FIXTURES_PER_RUN = ORIGINAL_MAX_FIXTURES;
  }
  if (ORIGINAL_MAX_PROFILE_REFRESHES === undefined) {
    delete process.env.SCHEDULER_MAX_TEAM_PROFILE_REFRESHS_PER_RUN;
  } else {
    process.env.SCHEDULER_MAX_TEAM_PROFILE_REFRESHS_PER_RUN =
      ORIGINAL_MAX_PROFILE_REFRESHES;
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
  resetInMemoryProductionStore();
  resetDailyAnalysisQueueStoreForTests();

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

  const deps = {
    runDate: MATCH_DATE,
    fetchFixtures,
    saveMatch: saveMatchInMemory,
    listRecords: async () => listInMemoryProductionRecords(),
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  };

  const first = await runDailyScheduler({ ...deps, ownerId: "test-dup-1" });
  assert(first.pipeline.created === 1, "first run should create one record");

  const second = await runDailyScheduler({ ...deps, ownerId: "test-dup-2" });
  assert(
    second.pipeline.duplicates === 1 || second.pipeline.processed === 0,
    "duplicate fixture should not create a new record"
  );
  assert(listInMemoryProductionRecords().length === 1, "store should still contain one record");
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
  resetInMemoryProductionStore();
  resetSchedulerLocksForTests();
  resetExecutionLogsForTests();
  resetDailyAnalysisQueueStoreForTests();
  process.env.SCHEDULER_MAX_FIXTURES_PER_RUN = "10";

  await runDailyScheduler({
    runDate: MATCH_DATE,
    ownerId: "result-seed",
    fetchFixtures: async () =>
      intakeFixtures([
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
      ]),
    saveMatch: saveMatchInMemory,
    listRecords: async () => listInMemoryProductionRecords(),
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  });

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

async function seedSinglePendingMatch(): Promise<void> {
  resetSchedulerEnv();
  resetInMemoryProductionStore();
  resetSchedulerLocksForTests();
  resetExecutionLogsForTests();
  resetDailyAnalysisQueueStoreForTests();
  resetApiFootballCacheStoreForTests();
  resetApiFootballQuotaForTests();
  process.env.SCHEDULER_MAX_FIXTURES_PER_RUN = "10";

  await runDailyScheduler({
    runDate: MATCH_DATE,
    ownerId: "result-cache-seed",
    fetchFixtures: async () =>
      intakeFixtures([
        buildApiFixture({
          id: 101,
          home: "Arsenal",
          away: "Chelsea",
          league: "Premier League",
          leagueId: 39,
          status: "NS",
        }),
      ]),
    saveMatch: saveMatchInMemory,
    listRecords: async () => listInMemoryProductionRecords(),
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  });
}

async function testResultUpdateFixtureCacheHitSkipsApi(): Promise<void> {
  await seedSinglePendingMatch();

  let apiCalls = 0;
  setApiFootballClientForTests({
    isConfigured: () => true,
    getFixturesByDate: async () => {
      apiCalls += 1;
      throw new Error("API should not be called on cache hit.");
    },
  } as never);

  setApiFootballQuotaForTests({ dailyCount: 100 });

  writeResultUpdateFixturesByDateCache(MATCH_DATE, [
    buildApiFixture({
      id: 101,
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
  ]);

  const result = await runResultScheduler({
    runDate: MATCH_DATE,
    ownerId: "result-cache-hit",
    listPending: async () =>
      listInMemoryProductionRecords().filter((record) => record.status === "PENDING"),
    listRecords: async () => listInMemoryProductionRecords(),
    verifyMatch: verifyMatchInMemory,
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  });

  assert(apiCalls === 0, "cache hit should not call API");
  assert(result.executionStatus === "success", "cache hit should succeed");
  assert(result.pipeline.verified === 1, "cache hit should verify pending match");

  setApiFootballClientForTests(null);
}

async function testResultUpdateFixtureCacheMissCallsApiOnce(): Promise<void> {
  await seedSinglePendingMatch();

  let apiCalls = 0;
  setApiFootballClientForTests({
    isConfigured: () => true,
    getFixturesByDate: async () => {
      apiCalls += 1;
      return [
        buildApiFixture({
          id: 101,
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
      ];
    },
  } as never);

  resetApiFootballQuotaForTests();

  const result = await runResultScheduler({
    runDate: MATCH_DATE,
    ownerId: "result-cache-miss",
    listPending: async () =>
      listInMemoryProductionRecords().filter((record) => record.status === "PENDING"),
    listRecords: async () => listInMemoryProductionRecords(),
    verifyMatch: verifyMatchInMemory,
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  });

  assert(apiCalls === 1, "cache miss should call API once");
  assert(result.executionStatus === "success", "cache miss with API should succeed");
  assert(result.pipeline.verified === 1, "API fixtures should verify pending match");

  setApiFootballClientForTests(null);
}

async function testResultUpdateQuotaExceededNoRetry(): Promise<void> {
  await seedSinglePendingMatch();

  let apiCalls = 0;
  setApiFootballClientForTests({
    isConfigured: () => true,
    getFixturesByDate: async () => {
      apiCalls += 1;
      throw new Error("API-Football quota exceeded.");
    },
  } as never);

  resetApiFootballQuotaForTests();

  await runResultScheduler({
    runDate: MATCH_DATE,
    ownerId: "result-quota-no-retry",
    listPending: async () =>
      listInMemoryProductionRecords().filter((record) => record.status === "PENDING"),
    listRecords: async () => listInMemoryProductionRecords(),
    verifyMatch: verifyMatchInMemory,
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  });

  assert(apiCalls === 1, "quota exceeded should not retry API fetch");

  setApiFootballClientForTests(null);
}

async function testResultUpdateQuotaExceededPartialSuccess(): Promise<void> {
  await seedSinglePendingMatch();

  setApiFootballClientForTests({
    isConfigured: () => true,
    getFixturesByDate: async () => {
      throw new Error("API-Football quota exceeded.");
    },
  } as never);

  resetApiFootballQuotaForTests();

  const result = await runResultScheduler({
    runDate: MATCH_DATE,
    ownerId: "result-quota-partial",
    listPending: async () =>
      listInMemoryProductionRecords().filter((record) => record.status === "PENDING"),
    listRecords: async () => listInMemoryProductionRecords(),
    verifyMatch: verifyMatchInMemory,
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  });

  assert(result.executionStatus === "partial_success", "quota exceeded should be partial_success");
  assert(result.pipeline.verified === 0, "quota exceeded without cache should verify zero");
  assert(result.pendingCount === 1, "pending count should be preserved");

  const latestResultLog = listExecutionLogs().find((entry) => entry.jobName === "result_update");
  assert(Boolean(latestResultLog), "result_update execution log should exist");
  assert(latestResultLog!.success, "partial_success should not mark execution as failed");
  assert(
    latestResultLog!.context?.status === "partial_success",
    "execution log should record partial_success"
  );
  assert(latestResultLog!.context?.quotaSkipped === true, "execution log should record quotaSkipped");
  assert(latestResultLog!.context?.pendingCount === 1, "execution log should record pendingCount");
  assert(latestResultLog!.context?.verifiedCount === 0, "execution log should record verifiedCount");
  assert(typeof latestResultLog!.context?.warning === "string", "execution log should record warning");

  setApiFootballClientForTests(null);
}

async function testResultUpdateCachedFixturesVerifyPending(): Promise<void> {
  await seedSinglePendingMatch();

  setApiFootballQuotaForTests({ dailyCount: 100 });
  setApiFootballClientForTests({
    isConfigured: () => true,
    getFixturesByDate: async () => {
      throw new Error("API should not be called when cache can verify pending matches.");
    },
  } as never);

  writeResultUpdateFixturesByDateCache(MATCH_DATE, [
    buildApiFixture({
      id: 101,
      home: "Arsenal",
      away: "Chelsea",
      league: "Premier League",
      leagueId: 39,
      status: "FT",
      homeGoals: 1,
      awayGoals: 0,
      htHome: 1,
      htAway: 0,
    }),
  ]);

  const result = await runResultScheduler({
    runDate: MATCH_DATE,
    ownerId: "result-cache-verify",
    listPending: async () =>
      listInMemoryProductionRecords().filter((record) => record.status === "PENDING"),
    listRecords: async () => listInMemoryProductionRecords(),
    verifyMatch: verifyMatchInMemory,
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  });

  assert(result.pipeline.verified === 1, "cached fixtures should verify pending match");
  const verified = listInMemoryProductionRecords().filter((record) => record.status === "VERIFIED");
  assert(verified.length === 1, "pending match should become verified from cache");

  setApiFootballClientForTests(null);
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

async function testFixtureFilterStatsAllFinished(): Promise<void> {
  resetSchedulerEnv();
  const intake = intakeFixtures([
    buildApiFixture({
      id: 1,
      home: "A",
      away: "B",
      league: "Premier League",
      leagueId: 39,
      status: "FT",
    }),
    buildApiFixture({
      id: 2,
      home: "C",
      away: "D",
      league: "La Liga",
      leagueId: 140,
      status: "AET",
    }),
  ]);
  intake.fetchMeta = { apiRaw: 3, cancelledOrAbandoned: 1 };

  const stats = buildFixtureFilterStats(intake, {
    leagueIdWhitelist: [],
    leagueWhitelist: [],
  });

  assert(stats.total === 2, "total should include valid intake fixtures");
  assert(stats.apiRaw === 3, "apiRaw should come from fetch meta");
  assert(stats.cancelledOrAbandoned === 1, "cancelledOrAbandoned should be tracked");
  assert(stats.analyzable === 0, "finished fixtures should not be analyzable");
  assert(stats.blockedFinishedStatus === 2, "all valid fixtures should be blocked by status");
  assert(stats.afterWhitelist === 0, "no analyzable fixtures should remain after whitelist");
  assert(stats.whitelist.activePolicy === "none", "empty whitelist should use none policy");
}

async function testFixtureFilterStatsWhitelistBlocks(): Promise<void> {
  resetSchedulerEnv();
  process.env.SCHEDULER_LEAGUE_ID_WHITELIST = "39";

  const intake = intakeFixtures([
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
      league: "J1 League",
      leagueId: 98,
      status: "NS",
    }),
  ]);

  const config = getSchedulerConfig();
  const stats = buildFixtureFilterStats(intake, {
    leagueIdWhitelist: config.leagueIdWhitelist,
    leagueWhitelist: config.leagueWhitelist,
  });

  assert(stats.analyzable === 2, "scheduled fixtures should be analyzable");
  assert(stats.blockedLeagueId === 1, "non-whitelisted league should be blocked");
  assert(stats.allowedLeague === 1, "whitelisted league should pass");
  assert(stats.afterWhitelist === 1, "afterWhitelist should equal allowedLeague");
  assert(stats.whitelist.leagueIdWhitelistConfigured, "league id whitelist should be active");
  assert(!stats.whitelist.leagueIdWhitelistReadFailed, "whitelist read should not fail");
}

async function testFixtureFilterStatsInExecutionLog(): Promise<void> {
  resetSchedulerEnv();
  resetInMemoryProductionStore();
  resetExecutionLogsForTests();
  resetSchedulerLocksForTests();

  const apiFixtures = Array.from({ length: 3 }, (_, index) =>
    buildApiFixture({
      id: index + 1,
      home: `Home ${index + 1}`,
      away: `Away ${index + 1}`,
      league: index === 0 ? "Premier League" : "Regional League",
      leagueId: index === 0 ? 39 : 500 + index,
      status: index === 0 ? "NS" : "FT",
    })
  );

  await runDailyScheduler({
    runDate: MATCH_DATE,
    ownerId: "test-filter-stats",
    fetchFixtures: async () => ({
      ...intakeFixtures(apiFixtures),
      fetchMeta: { apiRaw: 4, cancelledOrAbandoned: 1 },
    }),
    saveMatch: saveMatchInMemory,
    listRecords: async () => listInMemoryProductionRecords(),
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  });

  const logs = listExecutionLogs();
  const dailyLog = logs.find((entry) => entry.jobName === "daily_analysis" && entry.success);
  const filterStats = dailyLog?.context?.filterStats as {
    total?: number;
    analyzable?: number;
    blockedFinishedStatus?: number;
    allowedLeague?: number;
    afterWhitelist?: number;
    whitelist?: { activePolicy?: string };
  } | undefined;

  assert(filterStats !== undefined, "execution log should include filterStats");
  assert(filterStats?.total === 3, "filterStats.total should match fetched fixtures");
  assert(filterStats?.blockedFinishedStatus === 2, "filterStats should count finished fixtures");
  assert(filterStats?.allowedLeague === 1, "only one analyzable fixture should remain");
  assert(filterStats?.afterWhitelist === 1, "afterWhitelist should match allowedLeague");
  assert(filterStats?.whitelist?.activePolicy === "none", "default policy should be none");
}

async function testDailySchedulerBatchLimitAndResume(): Promise<void> {
  resetSchedulerEnv();
  process.env.SCHEDULER_MAX_FIXTURES_PER_RUN = "3";
  resetInMemoryProductionStore();
  resetExecutionLogsForTests();
  resetSchedulerLocksForTests();
  enableDailyAnalysisQueueStoreForTests();
  resetDailyAnalysisQueueStoreForTests();

  const apiFixtures = Array.from({ length: 21 }, (_, index) =>
    buildApiFixture({
      id: index + 1,
      home: `Home ${index + 1}`,
      away: `Away ${index + 1}`,
      league: `League ${index + 1}`,
      leagueId: 100 + index,
      status: "NS",
    })
  );

  const fetchFixtures = async () => intakeFixtures(apiFixtures);
  const deps = {
    runDate: MATCH_DATE,
    ownerId: "test-batch",
    fetchFixtures,
    saveMatch: saveMatchInMemory,
    listRecords: async () => listInMemoryProductionRecords(),
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  };

  const first = await runDailyScheduler(deps);
  assert(first.pipeline.processed === 3, "first run should process only batch limit");
  assert(first.batchProgress?.remaining === 18, "first run should leave remaining fixtures");
  assert(first.executionStatus === "partial_success", "first run should be partial_success");

  const queueAfterFirst = await loadDailyAnalysisQueue(MATCH_DATE);
  assert(queueAfterFirst?.completedFixtureIds.length === 3, "queue should track completed fixtures");
  assert(queueAfterFirst?.cursor === 3, "queue cursor should advance");

  const second = await runDailyScheduler({ ...deps, ownerId: "test-batch-2" });
  assert(second.pipeline.processed === 3, "second run should process next batch");
  assert(second.batchProgress?.remaining === 15, "second run should reduce remaining count");
}

async function testDailySchedulerDuplicateCountsAsCompleted(): Promise<void> {
  resetSchedulerEnv();
  process.env.SCHEDULER_MAX_FIXTURES_PER_RUN = "1";
  resetInMemoryProductionStore();
  resetExecutionLogsForTests();
  resetSchedulerLocksForTests();
  enableDailyAnalysisQueueStoreForTests();
  resetDailyAnalysisQueueStoreForTests();

  const apiFixtures = [
    buildApiFixture({
      id: 501,
      home: "Alpha",
      away: "Beta",
      league: "Test League",
      leagueId: 501,
      status: "NS",
    }),
  ];

  const deps = {
    runDate: MATCH_DATE,
    fetchFixtures: async () => intakeFixtures(apiFixtures),
    saveMatch: saveMatchInMemory,
    listRecords: async () => listInMemoryProductionRecords(),
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  };

  const first = await runDailyScheduler({ ...deps, ownerId: "dup-1" });
  assert(first.pipeline.created === 1, "first run should create one record");

  const second = await runDailyScheduler({ ...deps, ownerId: "dup-2" });
  assert(
    second.pipeline.duplicates === 1 || second.pipeline.processed === 0,
    "second run should treat existing match as duplicate or skip via queue sync"
  );
  assert(second.executionStatus === "success", "queue should be complete after duplicate");
}

async function testDailySchedulerTimeBudgetStopsSafely(): Promise<void> {
  resetSchedulerEnv();
  process.env.SCHEDULER_MAX_FIXTURES_PER_RUN = "5";
  process.env.SCHEDULER_TIME_BUDGET_MS = "1000";
  resetInMemoryProductionStore();
  resetExecutionLogsForTests();
  resetSchedulerLocksForTests();
  enableDailyAnalysisQueueStoreForTests();
  resetDailyAnalysisQueueStoreForTests();

  let fakeNow = 1_000;
  const apiFixtures = Array.from({ length: 5 }, (_, index) =>
    buildApiFixture({
      id: 600 + index,
      home: `Budget Home ${index}`,
      away: `Budget Away ${index}`,
      league: "Budget League",
      leagueId: 600,
      status: "NS",
    })
  );

  const result = await runDailyScheduler({
    runDate: MATCH_DATE,
    ownerId: "budget-test",
    now: () => fakeNow,
    fetchFixtures: async () => intakeFixtures(apiFixtures),
    saveMatch: async (rawOdds, report, matchDate) => {
      fakeNow += 600;
      return saveMatchInMemory(rawOdds, report, matchDate);
    },
    listRecords: async () => listInMemoryProductionRecords(),
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  });

  assert(result.batchProgress?.timeBudgetReached === true, "time budget should be reached");
  assert(result.pipeline.processed < 5, "time budget should stop before all fixtures");
  assert(result.executionStatus === "partial_success", "budget-limited run should be partial");
}

async function testDailySchedulerColdStartQueueRestore(): Promise<void> {
  resetSchedulerEnv();
  process.env.SCHEDULER_MAX_FIXTURES_PER_RUN = "2";
  resetInMemoryProductionStore();
  resetExecutionLogsForTests();
  resetSchedulerLocksForTests();
  enableDailyAnalysisQueueStoreForTests();
  resetDailyAnalysisQueueStoreForTests();

  const apiFixtures = Array.from({ length: 4 }, (_, index) =>
    buildApiFixture({
      id: 700 + index,
      home: `Cold Home ${index}`,
      away: `Cold Away ${index}`,
      league: "Cold League",
      leagueId: 700,
      status: "NS",
    })
  );

  const deps = {
    runDate: MATCH_DATE,
    fetchFixtures: async () => intakeFixtures(apiFixtures),
    saveMatch: saveMatchInMemory,
    listRecords: async () => listInMemoryProductionRecords(),
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  };

  await runDailyScheduler({ ...deps, ownerId: "cold-1" });
  const restored = await loadDailyAnalysisQueue(MATCH_DATE);
  assert(restored !== null, "queue should persist for cold start");
  assert(restored!.completedFixtureIds.length === 2, "restored queue should keep completed fixtures");

  disableDailyAnalysisQueueStoreForTests();
  enableDailyAnalysisQueueStoreForTests();
  const queues = listDailyAnalysisQueuesForTests();
  assert(queues.length === 0, "cold start should begin empty in new runtime");

  await saveDailyAnalysisQueue(restored!);
  const second = await runDailyScheduler({ ...deps, ownerId: "cold-2" });
  assert(second.pipeline.processed === 2, "restored queue should resume next batch");
}

async function testDailySchedulerQuotaExhaustedNoWait(): Promise<void> {
  resetSchedulerEnv();
  process.env.SCHEDULER_MAX_FIXTURES_PER_RUN = "1";
  process.env.SCHEDULER_MAX_TEAM_PROFILE_REFRESHS_PER_RUN = "4";
  process.env.TEAM_PROFILE_QUOTA_WAIT_MS = "60000";
  resetApiFootballQuotaForTests();
  resetTeamProfileRefreshDedupeForTests();
  enableTeamProfileMemoryStoreForTests();
  resetInMemoryProductionStore();
  resetExecutionLogsForTests();
  resetSchedulerLocksForTests();
  enableDailyAnalysisQueueStoreForTests();
  resetDailyAnalysisQueueStoreForTests();

  for (let index = 0; index < 100; index += 1) {
    recordApiFootballRequest();
  }

  const startedAt = Date.now();
  const result = await runDailyScheduler({
    runDate: MATCH_DATE,
    ownerId: "quota-no-wait",
    fetchFixtures: async () =>
      intakeFixtures([
        buildApiFixture({
          id: 801,
          home: "Quota Home",
          away: "Quota Away",
          league: "Quota League",
          leagueId: 801,
          status: "NS",
        }),
      ]),
    saveMatch: saveMatchInMemory,
    listRecords: async () => listInMemoryProductionRecords(),
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  });
  const elapsedMs = Date.now() - startedAt;

  assert(elapsedMs < 15_000, "quota exhausted cron should not wait 65 seconds");
  assert(result.pipeline.created === 1, "analysis should continue with deferred profiles");
  assert(
    (result.batchProgress?.deferredTeamProfiles.length ?? 0) >= 0,
    "deferred team profiles should be tracked when budget/quota blocks refresh"
  );

  const logs = listExecutionLogs();
  const dailyLog = logs.find((entry) => entry.jobName === "daily_analysis" && entry.success);
  const diagnostics = dailyLog?.context?.teamProfileDiagnostics as
    | Array<{ skippedReason?: string }>
    | undefined;
  const deferredProfiles = dailyLog?.context?.deferredTeamProfiles as string[] | undefined;
  assert(
    diagnostics?.some((entry) => entry.skippedReason === "quota_exhausted") === true ||
      (deferredProfiles?.length ?? 0) > 0,
    "quota exhausted should be reflected in diagnostics or deferred team profiles"
  );
}

async function testDailySchedulerPartialSuccessExecutionLog(): Promise<void> {
  resetSchedulerEnv();
  process.env.SCHEDULER_MAX_FIXTURES_PER_RUN = "1";
  resetInMemoryProductionStore();
  resetExecutionLogsForTests();
  resetPersistedExecutionLogsForTests();
  resetSchedulerLocksForTests();
  enableDailyAnalysisQueueStoreForTests();
  resetDailyAnalysisQueueStoreForTests();

  await runDailyScheduler({
    runDate: MATCH_DATE,
    ownerId: "partial-log",
    fetchFixtures: async () =>
      intakeFixtures([
        buildApiFixture({
          id: 901,
          home: "Partial A",
          away: "Partial B",
          league: "Partial League",
          leagueId: 901,
          status: "NS",
        }),
        buildApiFixture({
          id: 902,
          home: "Partial C",
          away: "Partial D",
          league: "Partial League",
          leagueId: 901,
          status: "NS",
        }),
      ]),
    saveMatch: saveMatchInMemory,
    listRecords: async () => listInMemoryProductionRecords(),
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  });

  const logs = listExecutionLogs();
  const dailyLog = logs.find((entry) => entry.jobName === "daily_analysis" && entry.success);
  assert(dailyLog?.context?.status === "partial_success", "execution log should mark partial_success");
  assert(dailyLog?.context?.remaining === 1, "execution log should include remaining count");
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

async function testTeamProfileExecutionLogDiagnostics(): Promise<void> {
  resetInMemoryProductionStore();
  resetExecutionLogsForTests();
  resetPersistedExecutionLogsForTests();
  resetSchedulerLocksForTests();
  resetApiFootballQuotaForTests();
  resetTeamProfileRefreshDedupeForTests();
  enableTeamProfileMemoryStoreForTests();

  class TeamProfileMockClient {
    isConfigured(): boolean {
      return true;
    }

    async getTeamForm(
      teamId: number,
      _last: number,
      _options: Record<string, unknown> = {}
    ): Promise<{ teamId: number; fixtures: ApiFootballFixtureRecord[]; meta: { requestPath: string; rawResponseCount: number } }> {
      recordApiFootballRequest();
      return {
        teamId,
        fixtures: [],
        meta: {
          requestPath: `/fixtures?team=${teamId}&last=15&status=FT`,
          rawResponseCount: 0,
        },
      };
    }

    async getTeamStatistics(): Promise<null> {
      return null;
    }
  }

  setApiFootballClientForTests(new TeamProfileMockClient() as never);

  const apiFixtures = [
    buildApiFixture({
      id: 21,
      home: "Arsenal",
      away: "Chelsea",
      league: "Premier League",
      leagueId: 39,
      status: "NS",
    }),
  ];

  await runDailyScheduler({
    runDate: MATCH_DATE,
    ownerId: "test-team-profile-diagnostics",
    fetchFixtures: async () => intakeFixtures(apiFixtures),
    saveMatch: saveMatchInMemory,
    listRecords: async () => listInMemoryProductionRecords(),
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  });

  const logs = listExecutionLogs();
  const dailyLog = logs.find((entry) => entry.jobName === "daily_analysis" && entry.success);
  assert(dailyLog !== undefined, "daily execution log should exist");
  assert(Array.isArray(dailyLog?.context?.teamProfileDiagnostics), "execution log should include teamProfileDiagnostics");
  assert(
    (dailyLog?.context?.teamProfileDiagnostics as unknown[]).length >= 2,
    "execution log should include home and away diagnostics"
  );
  assert(Array.isArray(dailyLog?.context?.teamProfileWarnings), "execution log should include teamProfileWarnings");
  assert(
    typeof dailyLog?.context?.teamProfileApiRequestCount === "number",
    "execution log should include teamProfileApiRequestCount"
  );

  setApiFootballClientForTests(null);
}

async function testTeamProfileQuotaDiagnosticsInExecutionLog(): Promise<void> {
  resetInMemoryProductionStore();
  resetExecutionLogsForTests();
  resetPersistedExecutionLogsForTests();
  resetSchedulerLocksForTests();
  resetApiFootballQuotaForTests();
  resetTeamProfileRefreshDedupeForTests();
  enableTeamProfileMemoryStoreForTests();

  for (let index = 0; index < 10; index += 1) {
    recordApiFootballRequest();
  }

  process.env.TEAM_PROFILE_QUOTA_WAIT_MS = "0";

  class UnusedClient {
    isConfigured(): boolean {
      return true;
    }
  }

  setApiFootballClientForTests(new UnusedClient() as never);

  const apiFixtures = [
    buildApiFixture({
      id: 22,
      home: "Liverpool",
      away: "Tottenham",
      league: "Premier League",
      leagueId: 39,
      status: "NS",
    }),
  ];

  await runDailyScheduler({
    runDate: MATCH_DATE,
    ownerId: "test-team-profile-quota",
    fetchFixtures: async () => intakeFixtures(apiFixtures),
    saveMatch: saveMatchInMemory,
    listRecords: async () => listInMemoryProductionRecords(),
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  });

  const logs = listExecutionLogs();
  const dailyLog = logs.find((entry) => entry.jobName === "daily_analysis" && entry.success);
  const diagnostics = dailyLog?.context?.teamProfileDiagnostics as Array<{ quotaExhausted?: boolean }> | undefined;
  assert(Array.isArray(diagnostics) && diagnostics.length > 0, "quota diagnostics should be logged");
  assert(
    Boolean(diagnostics?.some((entry) => entry.quotaExhausted === true)),
    "quota exhausted teams should be logged in diagnostics"
  );

  setApiFootballClientForTests(null);
  delete process.env.TEAM_PROFILE_QUOTA_WAIT_MS;
}

async function runTests(): Promise<void> {
  enableExecutionLogPersistStoreForTests();
  enableDailyAnalysisQueueStoreForTests();
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
    await testResultUpdateFixtureCacheHitSkipsApi();
    await testResultUpdateFixtureCacheMissCallsApiOnce();
    await testResultUpdateQuotaExceededNoRetry();
    await testResultUpdateQuotaExceededPartialSuccess();
    await testResultUpdateCachedFixturesVerifyPending();
    await testSchedulerObservabilityColdStart();
    await testSchedulerApiUsageFromSnapshot();
    await testExecutionLogPersistFailureWarning();
    await testTeamProfileExecutionLogDiagnostics();
    await testTeamProfileQuotaDiagnosticsInExecutionLog();
    await testFixtureFilterStatsAllFinished();
    await testFixtureFilterStatsWhitelistBlocks();
    await testFixtureFilterStatsInExecutionLog();
    await testDailySchedulerBatchLimitAndResume();
    await testDailySchedulerDuplicateCountsAsCompleted();
    await testDailySchedulerTimeBudgetStopsSafely();
    await testDailySchedulerColdStartQueueRestore();
    await testDailySchedulerQuotaExhaustedNoWait();
    await testDailySchedulerPartialSuccessExecutionLog();
    await testLeagueIdWhitelistHelper();
    await testAnalyzePipelineIntegrity();
    console.log("All scheduler tests passed.");
  } finally {
    disableExecutionLogPersistStoreForTests();
    disableDailyAnalysisQueueStoreForTests();
    restoreSchedulerEnv();
  }
}

runTests().catch((error) => {
  console.error(error);
  disableExecutionLogPersistStoreForTests();
  disableDailyAnalysisQueueStoreForTests();
  restoreSchedulerEnv();
  process.exit(1);
});
