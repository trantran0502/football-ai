import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import { resetAdminErrorLogsForTests } from "@/lib/admin/adminErrorLog";
import {
  listInMemoryProductionRecords,
  resetInMemoryProductionStore,
  saveMatchInMemory,
  verifyMatchInMemory,
} from "@/lib/production";
import {
  buildSchedulerPlaceholderOdds,
  filterFixturesByLeagueWhitelist,
  filterFixturesByLeagueIdWhitelist,
  resetExecutionLogsForTests,
  resetSchedulerLocksForTests,
  runDailyScheduler,
  runResultScheduler,
  getSchedulerStatus,
  withRetry,
  withTimeout,
  acquireSchedulerLock,
  releaseSchedulerLock,
  listExecutionLogs,
} from "@/lib/scheduler";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import type { SchedulerFixtureSource } from "@/lib/scheduler/schedulerTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const MATCH_DATE = "2026-07-16";

function buildApiFixture(input: {
  id: number;
  home: string;
  away: string;
  league: string;
  leagueId: number;
  status: string;
  homeGoals?: number | null;
  awayGoals?: number | null;
  htHome?: number | null;
  htAway?: number | null;
}): ApiFootballFixtureRecord {
  return {
    fixtureId: input.id,
    date: MATCH_DATE,
    league: input.league,
    leagueId: input.leagueId,
    season: 2026,
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

function toSchedulerSources(fixtures: ApiFootballFixtureRecord[]): SchedulerFixtureSource[] {
  return fixtures.map((fixture) => ({
    fixtureId: fixture.fixtureId,
    matchDate: fixture.date,
    league: fixture.league ?? "Unknown",
    leagueId: fixture.leagueId,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    status: fixture.status,
    rawOdds: buildSchedulerPlaceholderOdds(fixture.homeTeam, fixture.awayTeam),
  }));
}

async function testDailyScheduler(): Promise<void> {
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
      home: "Unknown Club A",
      away: "Unknown Club B",
      league: "Regional League",
      leagueId: 999,
      status: "NS",
    }),
  ];

  const fetchFixtures = async () => toSchedulerSources(apiFixtures);
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
  assert(result.fixturesAfterWhitelist === 2, "whitelist should keep two fixtures");
  assert(result.pipeline.created === 2, "daily scheduler should create two records");
  assert(result.summary.analyzedCount === 2, "summary should count two analyzed matches");
  assert(result.executionLogId.length > 0, "execution log should be recorded");

  const logs = listExecutionLogs(5);
  assert(logs.some((log) => log.jobName === "daily_analysis" && log.success), "daily log success");
}

async function testDuplicateProtection(): Promise<void> {
  resetSchedulerLocksForTests();

  const apiFixtures = [
    buildApiFixture({
      id: 4,
      home: "Arsenal",
      away: "Chelsea",
      league: "Premier League",
      leagueId: 39,
      status: "NS",
    }),
  ];

  const fetchFixtures = async () => toSchedulerSources(apiFixtures);
  const listRecords = async () => listInMemoryProductionRecords();

  const second = await runDailyScheduler({
    runDate: MATCH_DATE,
    ownerId: "test-dup",
    fetchFixtures,
    saveMatch: saveMatchInMemory,
    listRecords,
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
    fetchFixtures: async () => [],
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
  resetSchedulerLocksForTests();
  resetExecutionLogsForTests();

  const pending = listInMemoryProductionRecords().filter((record) => record.status === "PENDING");
  assert(pending.length >= 2, "pending records required for result scheduler test");

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
  ];

  const result = await runResultScheduler({
    runDate: MATCH_DATE,
    ownerId: "test-result",
    listPending: async () =>
      listInMemoryProductionRecords().filter((record) => record.status === "PENDING"),
    listRecords: async () => listInMemoryProductionRecords(),
    fetchFixtures: async () => toSchedulerSources(apiFixtures),
    fetchApiFixtures: async () => apiFixtures,
    verifyMatch: verifyMatchInMemory,
    runSummaryCron: async () => ({ summaryDate: MATCH_DATE, syncedAt: new Date().toISOString() }),
  });

  assert(!result.skippedDueToLock, "result scheduler should run");
  assert(result.updatesBuilt === 2, "result scheduler should build two updates");
  assert(result.pipeline.verified === 2, "result scheduler should verify two matches");

  const verified = listInMemoryProductionRecords().filter((record) => record.status === "VERIFIED");
  assert(verified.length === 2, "two verified records expected");
}

async function testSchedulerStatus(): Promise<void> {
  const status = await getSchedulerStatus({
    runDate: MATCH_DATE,
    listRecords: async () => listInMemoryProductionRecords(),
    countTodayFixtures: async () => 3,
  });

  assert(status.analyzedMatches === 2, "status should report analyzed matches");
  assert(status.validatedMatches === 2, "status should report validated matches");
  assert(status.dailySummary !== null, "status should include daily summary");
  assert(typeof status.nextRun.daily === "string", "status should include next daily run");
  assert(status.apiUsage.minuteLimit > 0, "status should include api usage");
}

async function testLeagueWhitelist(): Promise<void> {
  const fixtures = [
    {
      fixtureId: 1,
      matchDate: MATCH_DATE,
      league: "Premier League",
      leagueId: 39,
      homeTeam: "A",
      awayTeam: "B",
      status: "NS",
    },
    {
      fixtureId: 2,
      matchDate: MATCH_DATE,
      league: "Regional",
      leagueId: 999,
      homeTeam: "C",
      awayTeam: "D",
      status: "NS",
    },
  ];

  const filteredByName = filterFixturesByLeagueWhitelist(fixtures, ["Premier League"]);
  assert(filteredByName.length === 1, "league name whitelist should filter fixtures");

  const filteredById = filterFixturesByLeagueIdWhitelist(fixtures, [39]);
  assert(filteredById.length === 1, "league id whitelist should filter fixtures");
}

async function testAnalyzePipelineIntegrity(): Promise<void> {
  const odds = buildSchedulerPlaceholderOdds("Liverpool", "Tottenham");
  const report = analyzeMatch(odds);
  assert(report.recommendation !== undefined, "analyzeMatch should still produce recommendation");
  assert(report.decision !== undefined, "analyzeMatch should still produce decision");
  assert(report.bettingIntelligence !== undefined, "analyzeMatch should still produce betting intelligence");
}

async function runTests(): Promise<void> {
  await testDailyScheduler();
  await testDuplicateProtection();
  await testLockProtection();
  await testRetry();
  await testTimeout();
  await testResultScheduler();
  await testSchedulerStatus();
  await testLeagueWhitelist();
  await testAnalyzePipelineIntegrity();
  console.log("All scheduler tests passed.");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
