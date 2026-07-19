import {
  canMakeApiFootballRequest,
  canMakeApiFootballRequestForResultUpdate,
  canMakeApiFootballRequestForPurpose,
  getGeneralDailyQuotaLimit,
  resetApiFootballQuotaForTests,
  runWithApiFootballQuotaPurpose,
  setApiFootballQuotaForTests,
} from "@/lib/providers/apiFootball/apiFootballQuota";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  attachScoresToFinishedFixtures,
  buildResultUpdatesFromFinishedFixtures,
} from "@/lib/scheduler/resultIntake";
import { intakeApiFixtures } from "@/lib/scheduler/fixtureMapping";
import {
  fetchResultUpdateFixturesByDate,
  RESULT_UPDATE_QUOTA_WARNING,
  shouldRefreshGlobalFixturesCacheForVerification,
} from "@/lib/scheduler/resultUpdateFixtureFetch";
import {
  readGlobalFixturesByDateCache,
  writeGlobalFixturesByDateCache,
} from "@/lib/scheduler/resultUpdateFixtureCache";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

class MemoryCacheStore {
  private readonly entries = new Map<string, ApiFootballFixtureRecord[]>();

  async get<T>(cacheKey: string): Promise<T | null> {
    return (this.entries.get(cacheKey) as T | undefined) ?? null;
  }

  set<T>(cacheKey: string, _category: string, data: T): void {
    this.entries.set(cacheKey, data as ApiFootballFixtureRecord[]);
  }
}

function buildFixture(
  overrides: Partial<ApiFootballFixtureRecord> = {}
): ApiFootballFixtureRecord {
  return {
    fixtureId: 123,
    date: "2026-07-20",
    kickoffTime: "2026-07-20T12:00:00.000Z",
    league: "Premier League",
    leagueId: 39,
    season: 2026,
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    homeTeamId: 1,
    awayTeamId: 2,
    status: "FT",
    homeGoals: 2,
    awayGoals: 1,
    halfTimeHome: 1,
    halfTimeAway: 0,
    venue: null,
    neutralVenue: false,
    ...overrides,
  };
}

function buildPendingRecord(
  overrides: Partial<HistoricalMatchRecord> = {}
): Pick<HistoricalMatchRecord, "fixtureId" | "homeTeam" | "awayTeam" | "matchDate" | "status"> {
  return {
    fixtureId: 123,
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    matchDate: "2026-07-20",
    status: "PENDING",
    ...overrides,
  };
}

async function testUsesGlobalCacheWhenVerificationReady(): Promise<void> {
  resetApiFootballQuotaForTests();
  const cacheStore = new MemoryCacheStore();
  const cachedFixture = buildFixture();
  writeGlobalFixturesByDateCache("2026-07-20", [cachedFixture], cacheStore as never);

  let apiCalls = 0;
  const outcome = await fetchResultUpdateFixturesByDate("2026-07-20", {
    cacheStore: cacheStore as never,
    pendingRecords: [buildPendingRecord()],
    fetchFromApi: async () => {
      apiCalls += 1;
      return [];
    },
  });

  assert(outcome.cacheHit, "expected cache hit when cache has FT for pending");
  assert(outcome.source === "cache", "expected cache source");
  assert(apiCalls === 0, "API should not be called when cache is verification-ready");
}

async function testRefreshesStaleNsCacheForPending(): Promise<void> {
  resetApiFootballQuotaForTests();
  const cacheStore = new MemoryCacheStore();
  const staleFixture = buildFixture({
    status: "NS",
    homeGoals: null,
    awayGoals: null,
    halfTimeHome: null,
    halfTimeAway: null,
  });
  writeGlobalFixturesByDateCache("2026-07-20", [staleFixture], cacheStore as never);

  assert(
    shouldRefreshGlobalFixturesCacheForVerification(
      "2026-07-20",
      [buildPendingRecord()],
      [staleFixture]
    ),
    "stale NS cache should require refresh"
  );

  const refreshedFixture = buildFixture();
  let apiCalls = 0;
  const outcome = await fetchResultUpdateFixturesByDate("2026-07-20", {
    cacheStore: cacheStore as never,
    pendingRecords: [buildPendingRecord()],
    fetchFromApi: async () => {
      apiCalls += 1;
      return [refreshedFixture];
    },
  });

  assert(apiCalls === 1, "stale cache should trigger one refresh API call");
  assert(outcome.source === "api", "expected refreshed api source");
  assert(outcome.cacheHit === false, "refresh should not count as cache hit");
  assert(outcome.fixtures[0]?.status === "FT", "refreshed fixtures should include FT status");

  const finishedOnly = intakeApiFixtures(
    outcome.fixtures.filter((fixture) => ["FT", "AET", "PEN"].includes(fixture.status))
  ).fixtures;
  const scored = attachScoresToFinishedFixtures(finishedOnly, outcome.fixtures);
  const updates = buildResultUpdatesFromFinishedFixtures(
    [buildPendingRecord() as HistoricalMatchRecord],
    scored
  );
  assert(updates.length === 1, "refreshed FT cache should build verification update");
}

async function testDaily0800NsThen1100ResultUpdateSimulation(): Promise<void> {
  resetApiFootballQuotaForTests();
  const cacheStore = new MemoryCacheStore();
  const morningSnapshot = buildFixture({
    status: "NS",
    homeGoals: null,
    awayGoals: null,
    halfTimeHome: null,
    halfTimeAway: null,
  });
  writeGlobalFixturesByDateCache("2026-07-20", [morningSnapshot], cacheStore as never);

  const pending = [buildPendingRecord()];
  let apiCalls = 0;
  const outcome = await fetchResultUpdateFixturesByDate("2026-07-20", {
    cacheStore: cacheStore as never,
    pendingRecords: pending,
    fetchFromApi: async () => {
      apiCalls += 1;
      return [
        buildFixture({
          status: "FT",
          homeGoals: 3,
          awayGoals: 2,
          halfTimeHome: 1,
          halfTimeAway: 1,
        }),
      ];
    },
  });

  assert(apiCalls === 1, "11:00 result update should refresh stale 08:00 NS cache");
  const finishedOnly = intakeApiFixtures(
    outcome.fixtures.filter((fixture) => ["FT", "AET", "PEN"].includes(fixture.status))
  ).fixtures;
  const scored = attachScoresToFinishedFixtures(finishedOnly, outcome.fixtures);
  const updates = buildResultUpdatesFromFinishedFixtures(
    [pending[0] as HistoricalMatchRecord],
    scored
  );
  assert(updates.length === 1, "simulation should allow VERIFIED update after refresh");
}

async function testUsesReservedQuotaWhenGeneralQuotaExhausted(): Promise<void> {
  resetApiFootballQuotaForTests();
  setApiFootballQuotaForTests({ dailyCount: 85, minuteCount: 0 });
  assert(canMakeApiFootballRequestForResultUpdate(), "reserved quota should remain available at 85");
  assert(!canMakeApiFootballRequest(), "general quota should be blocked at 85");

  let apiCalls = 0;
  const outcome = await fetchResultUpdateFixturesByDate("2026-07-21", {
    cacheStore: new MemoryCacheStore() as never,
    pendingRecords: [buildPendingRecord({ matchDate: "2026-07-21", fixtureId: 456 })],
    fetchFromApi: async () => {
      apiCalls += 1;
      return [buildFixture({ fixtureId: 456, date: "2026-07-21" })];
    },
  });

  assert(apiCalls === 1, "result update should still fetch when reserved quota remains");
  assert(outcome.source === "api", "expected api source");
  assert(outcome.quotaSkipped === false, "should not skip with reserved quota");
}

async function testReservedQuotaBoundaries(): Promise<void> {
  resetApiFootballQuotaForTests();
  const generalLimit = getGeneralDailyQuotaLimit();

  setApiFootballQuotaForTests({ dailyCount: 84, minuteCount: 0 });
  assert(canMakeApiFootballRequestForPurpose("general"), "general should allow at 84");
  assert(canMakeApiFootballRequestForResultUpdate(), "result update should allow at 84");

  setApiFootballQuotaForTests({ dailyCount: 85, minuteCount: 0 });
  assert(!canMakeApiFootballRequestForPurpose("general"), "general should block at 85");
  assert(canMakeApiFootballRequestForResultUpdate(), "result update should allow at 85");

  setApiFootballQuotaForTests({ dailyCount: 99, minuteCount: 0 });
  assert(canMakeApiFootballRequestForResultUpdate(), "result update should allow at 99");

  setApiFootballQuotaForTests({ dailyCount: 100, minuteCount: 0 });
  assert(!canMakeApiFootballRequestForResultUpdate(), "result update should block at 100");

  assert(generalLimit === 85, "expected general limit 85 with default reserve 15");
}

async function testSkipsWhenFullyExhaustedWithoutCache(): Promise<void> {
  resetApiFootballQuotaForTests();
  setApiFootballQuotaForTests({ dailyCount: 100, minuteCount: 0 });

  const outcome = await fetchResultUpdateFixturesByDate("2026-07-22", {
    cacheStore: new MemoryCacheStore() as never,
    pendingRecords: [buildPendingRecord({ matchDate: "2026-07-22" })],
    fetchFromApi: async () => [],
  });

  assert(outcome.quotaSkipped, "expected quota skip");
  assert(outcome.warning === RESULT_UPDATE_QUOTA_WARNING, "expected quota warning");
}

async function testPurposeScopeRestoresAfterException(): Promise<void> {
  resetApiFootballQuotaForTests();
  setApiFootballQuotaForTests({ dailyCount: getGeneralDailyQuotaLimit(), minuteCount: 0 });

  let threw = false;
  try {
    await runWithApiFootballQuotaPurpose("result_update", async () => {
      throw new Error("boom");
    });
  } catch {
    threw = true;
  }

  assert(threw, "expected exception to propagate");
  assert(!canMakeApiFootballRequest(), "general purpose should restore after exception");
}

async function runTests(): Promise<void> {
  await testUsesGlobalCacheWhenVerificationReady();
  await testRefreshesStaleNsCacheForPending();
  await testDaily0800NsThen1100ResultUpdateSimulation();
  await testUsesReservedQuotaWhenGeneralQuotaExhausted();
  await testReservedQuotaBoundaries();
  await testSkipsWhenFullyExhaustedWithoutCache();
  await testPurposeScopeRestoresAfterException();
  const cached = await readGlobalFixturesByDateCache("2026-07-20", new MemoryCacheStore() as never);
  assert(cached === null, "unrelated cache store should miss");
  console.log("resultUpdateFixtureFetch.test.ts passed");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
