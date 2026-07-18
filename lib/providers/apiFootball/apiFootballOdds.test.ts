import {
  ApiFootballClient,
  setApiFootballClientForTests,
} from "@/lib/providers/apiFootball/apiFootballClient";
import {
  buildApiFootballCacheKey,
  getApiFootballCacheStore,
  resetApiFootballCacheStoreForTests,
} from "@/lib/providers/apiFootball/apiFootballCache";
import { selectApiFootballBookmaker } from "@/lib/providers/apiFootball/apiFootballOddsBookmakerSelector";
import {
  mapApiFootballBetsToMarketSelections,
  SCHEDULER_ODDS_TITLE_BTTS,
  SCHEDULER_ODDS_TITLE_HANDICAP,
  SCHEDULER_ODDS_TITLE_MONEYLINE,
  SCHEDULER_ODDS_TITLE_TOTAL_GOALS,
  summarizeMappedMarketCoverage,
} from "@/lib/providers/apiFootball/apiFootballOddsMapper";
import {
  buildApiFootballOddsPath,
  InvalidApiFootballOddsQueryError,
  validateApiFootballOddsQuery,
} from "@/lib/providers/apiFootball/apiFootballOddsQuery";
import type {
  ApiFootballOddsBet,
  ApiFootballOddsBookmaker,
  ApiFootballOddsRecord,
} from "@/lib/providers/apiFootball/apiFootballOddsTypes";
import {
  resetApiFootballQuotaForTests,
  setApiFootballQuotaForTests,
  getApiFootballQuotaSnapshot,
} from "@/lib/providers/apiFootball/apiFootballQuota";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import {
  ApiFootballOddsAdapter,
  mapApiFootballOddsRecordToOddsData,
} from "@/lib/providers/odds/apiFootballOddsAdapter";
import type { OddsProvider } from "@/lib/providers/providerTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const SAMPLE_FIXTURE: ApiFootballFixtureRecord = {
  fixtureId: 120001,
  date: "2026-07-20",
  kickoffTime: "2026-07-20T15:00:00.000Z",
  league: "Premier League",
  leagueId: 39,
  season: 2026,
  homeTeam: "Arsenal",
  awayTeam: "Chelsea",
  homeTeamId: 42,
  awayTeamId: 49,
  status: "NS",
  homeGoals: null,
  awayGoals: null,
  halfTimeHome: null,
  halfTimeAway: null,
  venue: null,
  neutralVenue: false,
};

function buildSampleBets(overrides: Partial<Record<string, ApiFootballOddsBet>> = {}): ApiFootballOddsBet[] {
  const defaults: Record<string, ApiFootballOddsBet> = {
    moneyline: {
      id: 1,
      name: "Match Winner",
      values: [
        { value: "Home", odd: "2.05" },
        { value: "Draw", odd: "3.30" },
        { value: "Away", odd: "3.60" },
      ],
    },
    handicap: {
      id: 4,
      name: "Asian Handicap",
      values: [
        { value: "Home -0.5", odd: "1.95" },
        { value: "Away +0.5", odd: "1.92" },
      ],
    },
    total: {
      id: 5,
      name: "Goals Over/Under",
      values: [
        { value: "Over 2.5", odd: "1.88" },
        { value: "Under 2.5", odd: "1.98" },
      ],
    },
    btts: {
      id: 8,
      name: "Both Teams Score",
      values: [
        { value: "Yes", odd: "1.75" },
        { value: "No", odd: "2.05" },
      ],
    },
  };

  return Object.values({ ...defaults, ...overrides });
}

function buildSampleOddsRecord(
  bookmakers: ApiFootballOddsBookmaker[] = [
    {
      id: 8,
      name: "Bet365",
      bets: buildSampleBets(),
    },
    {
      id: 12,
      name: "Other Book",
      bets: buildSampleBets(),
    },
  ]
): ApiFootballOddsRecord {
  return {
    league: {
      id: 39,
      name: "Premier League",
      country: "England",
      logo: null,
      flag: null,
      season: 2026,
    },
    fixture: {
      id: 120001,
      timezone: "UTC",
      date: "2026-07-20T15:00:00.000Z",
      timestamp: 1784588400,
    },
    update: "2026-07-20T10:00:00.000Z",
    bookmakers,
  };
}

function testApiResponseMapping(): void {
  const record = buildSampleOddsRecord();
  assert(record.fixture.id === 120001, "fixture id should map");
  assert(record.league.season === 2026, "league season should map");
  assert(record.bookmakers[0]?.bets[0]?.values[0]?.odd === "2.05", "odd should map");
}

function testMoneylineMapping(): void {
  const selections = mapApiFootballBetsToMarketSelections([
    {
      id: 1,
      name: "Match Winner",
      values: [
        { value: "Home", odd: "2.05" },
        { value: "Draw", odd: "3.30" },
        { value: "Away", odd: "3.60" },
      ],
    },
  ]);

  assert(selections.length === 3, "moneyline should map three selections");
  assert(
    selections.every((selection) => selection.marketType === "moneyline"),
    "moneyline marketType"
  );
  assert(
    selections.every((selection) => selection.title === SCHEDULER_ODDS_TITLE_MONEYLINE),
    "moneyline title"
  );
}

function testAsianHandicapMapping(): void {
  const selections = mapApiFootballBetsToMarketSelections([
    {
      id: 4,
      name: "Asian Handicap",
      values: [
        { value: "Home -0.5", odd: "1.95" },
        { value: "Away +0.5", odd: "1.92" },
      ],
    },
  ]);

  assert(selections.length === 2, "handicap should map two selections");
  assert(selections[0]?.side === "home", "home handicap side");
  assert(selections[0]?.line === -0.5, "home handicap line");
  assert(selections[0]?.title === SCHEDULER_ODDS_TITLE_HANDICAP, "handicap title");
}

function testOverUnderMapping(): void {
  const selections = mapApiFootballBetsToMarketSelections([
    {
      id: 5,
      name: "Goals Over/Under",
      values: [
        { value: "Over 2.5", odd: "1.88" },
        { value: "Under 2.5", odd: "1.98" },
      ],
    },
  ]);

  assert(selections.length === 2, "total goals should map two selections");
  assert(selections[0]?.side === "over", "over side");
  assert(selections[0]?.line === 2.5, "over line");
  assert(selections[0]?.title === SCHEDULER_ODDS_TITLE_TOTAL_GOALS, "total goals title");
}

function testBttsMapping(): void {
  const selections = mapApiFootballBetsToMarketSelections([
    {
      id: 8,
      name: "Both Teams Score",
      values: [
        { value: "Yes", odd: "1.75" },
        { value: "No", odd: "2.05" },
      ],
    },
  ]);

  assert(selections.length === 2, "btts should map two selections");
  assert(selections[0]?.side === "yes", "btts yes side");
  assert(selections[1]?.side === "no", "btts no side");
  assert(selections[0]?.title === SCHEDULER_ODDS_TITLE_BTTS, "btts title");
}

function testUnknownBetIgnored(): void {
  const selections = mapApiFootballBetsToMarketSelections([
    {
      id: 999,
      name: "Correct Score",
      values: [{ value: "1:0", odd: "8.00" }],
    },
    {
      id: 1,
      name: "Match Winner",
      values: [{ value: "Home", odd: "2.00" }],
    },
  ]);

  assert(selections.length === 1, "unknown bet should be ignored");
  assert(selections[0]?.marketType === "moneyline", "known bet should remain");
}

function testMalformedOddIgnored(): void {
  const selections = mapApiFootballBetsToMarketSelections([
    {
      id: 1,
      name: "Match Winner",
      values: [
        { value: "Home", odd: "bad" },
        { value: "Draw", odd: "3.20" },
      ],
    },
  ]);

  assert(selections.length === 1, "malformed odd should be ignored");
  assert(selections[0]?.side === "draw", "valid selection should remain");
}

function testPartialMarketsPreserved(): void {
  const selections = mapApiFootballBetsToMarketSelections([
    {
      id: 1,
      name: "Match Winner",
      values: [{ value: "Home", odd: "2.00" }],
    },
    {
      id: 5,
      name: "Goals Over/Under",
      values: [{ value: "Over 2.5", odd: "1.90" }],
    },
  ]);

  const coverage = summarizeMappedMarketCoverage(selections);
  assert(selections.length === 2, "partial markets should be preserved");
  assert(coverage.moneyline === 1, "partial moneyline count");
  assert(coverage.totalGoals === 1, "partial total goals count");
  assert(coverage.handicap === 0, "missing handicap should remain zero");
}

function testEmptyMappedFixtureOmitted(): void {
  const oddsData = mapApiFootballOddsRecordToOddsData({
    record: buildSampleOddsRecord([
      {
        id: 8,
        name: "Bet365",
        bets: [{ id: 999, name: "Unknown", values: [{ value: "X", odd: "2.00" }] }],
      },
    ]),
    teams: {
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      homeTeamId: 42,
      awayTeamId: 49,
    },
    bookmaker: { id: 8, name: "Bet365", bets: [{ id: 999, name: "Unknown", values: [] }] },
    capturedAt: "2026-07-20T10:00:00.000Z",
  });

  assert(oddsData === null, "fixture with no mapped markets should be omitted");
}

function testExplicitBookmakerSelection(): void {
  const selected = selectApiFootballBookmaker(buildSampleOddsRecord().bookmakers, {
    preferredBookmakerId: "12",
  });
  assert(selected?.id === 12, "explicit bookmaker id should win");
}

function testEnvBookmakerSelection(): void {
  const previous = process.env.SCHEDULER_ODDS_BOOKMAKER_ID;
  process.env.SCHEDULER_ODDS_BOOKMAKER_ID = "12";
  try {
    const selected = selectApiFootballBookmaker(buildSampleOddsRecord().bookmakers);
    assert(selected?.id === 12, "env bookmaker id should win");
  } finally {
    if (previous === undefined) {
      delete process.env.SCHEDULER_ODDS_BOOKMAKER_ID;
    } else {
      process.env.SCHEDULER_ODDS_BOOKMAKER_ID = previous;
    }
  }
}

function testDeterministicFallbackBookmakerSelection(): void {
  const selected = selectApiFootballBookmaker(buildSampleOddsRecord().bookmakers);
  assert(selected?.id === 8, "fallback should choose lowest bookmaker id");
}

function testOddsQueryValidationAndPath(): void {
  validateApiFootballOddsQuery({ fixtureId: 120001 });
  assert(
    buildApiFootballOddsPath({ fixtureId: 120001, bookmakerId: "8" }) ===
      "/odds?fixture=120001&bookmaker=8",
    "fixture odds path"
  );
  assert(
    buildApiFootballOddsPath({ date: "2026-07-20" }, 2) ===
      "/odds?date=2026-07-20&page=2",
    "date odds path with page"
  );
}

async function testInvalidEmptyQueryNoNetwork(): Promise<void> {
  resetApiFootballQuotaForTests();
  const client = new ApiFootballClient({ apiKey: "test-key" });
  let threw = false;
  try {
    await client.getOdds({});
  } catch (error) {
    threw = error instanceof InvalidApiFootballOddsQueryError;
  }
  assert(threw, "empty odds query should fail before network");
  assert(getApiFootballQuotaSnapshot().dailyCount === 0, "invalid query should not consume quota");
}

async function testFixtureQueryViaAdapter(): Promise<void> {
  const record = buildSampleOddsRecord();
  const mockClient = {
    getOdds: async () => ({ items: [record] }),
    getFixturesByDate: async () => [],
    getFixtureById: async () => SAMPLE_FIXTURE,
    getFixturesByIds: async () => [],
  };

  const adapter = new ApiFootballOddsAdapter(mockClient);
  const results = await adapter.fetchOdds({ fixtureId: 120001 });

  assert(results.length === 1, "adapter should return one OddsData");
  assert(results[0]?.fixtureId === 120001, "fixtureId should map");
  assert(results[0]?.homeTeam === "Arsenal", "home team should enrich from fixture lookup");
  assert(!("rawOdds" in results[0]!), "adapter must not expose rawOdds");
}

async function testDateQueryPaginationViaClient(): Promise<void> {
  resetApiFootballQuotaForTests();
  resetApiFootballCacheStoreForTests();

  let fetchCalls = 0;
  const originalFetch = global.fetch;
  global.fetch = (async () => {
    fetchCalls += 1;
    const current = fetchCalls;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        response: current === 1 ? [buildRawOddsPayload()] : [buildRawOddsPayload(120002)],
        paging: { current, total: 2 },
        errors: [],
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const client = new ApiFootballClient({ apiKey: "test-key" });
    const response = await client.getOdds({ date: "2026-07-20" });
    assert(response.items.length === 2, "date query should aggregate paginated odds");
    assert(response.pagesFetched === 2, "date query should fetch two pages");
    assert(fetchCalls === 2, "pagination should perform two network calls");
  } finally {
    global.fetch = originalFetch;
  }
}

function buildRawOddsPayload(fixtureId = 120001): Record<string, unknown> {
  const record = buildSampleOddsRecord();
  return {
    league: record.league,
    fixture: { ...record.fixture, id: fixtureId },
    update: record.update,
    bookmakers: record.bookmakers,
  };
}

function testQuotaCacheRegression(): void {
  resetApiFootballQuotaForTests();
  resetApiFootballCacheStoreForTests();
  setApiFootballQuotaForTests({ dailyCount: 99 });

  const cacheStore = getApiFootballCacheStore();
  const cacheKey = buildApiFootballCacheKey("odds", {
    fixtureId: 120001,
    page: 1,
  });
  cacheStore.set(cacheKey, "odds", {
    response: [buildSampleOddsRecord()],
    paging: { current: 1, total: 1 },
  });

  assert(cacheStore.getSync(cacheKey) !== null, "odds cache entry should be stored");
  assert(getApiFootballQuotaSnapshot().dailyCount === 99, "cache setup should not mutate quota");
}

async function testAdapterOddsProviderContract(): Promise<void> {
  const adapter: OddsProvider = new ApiFootballOddsAdapter({
    getOdds: async () => ({ items: [buildSampleOddsRecord()] }),
    getFixturesByDate: async () => [SAMPLE_FIXTURE],
    getFixtureById: async () => SAMPLE_FIXTURE,
    getFixturesByIds: async () => [SAMPLE_FIXTURE],
  });

  const results = await adapter.fetchOdds({ date: "2026-07-20" });
  assert(Array.isArray(results), "OddsProvider should return array");
  assert(results[0]?.marketSelections.length >= 4, "mapped fixture should include core markets");
  assert(results[0]?.source === "api-football", "source should be api-football");
  assert(results[0]?.bookmakerId === "8", "bookmaker id should map");
}

export async function runApiFootballOddsTests(): Promise<void> {
  testApiResponseMapping();
  testMoneylineMapping();
  testAsianHandicapMapping();
  testOverUnderMapping();
  testBttsMapping();
  testUnknownBetIgnored();
  testMalformedOddIgnored();
  testPartialMarketsPreserved();
  testEmptyMappedFixtureOmitted();
  testExplicitBookmakerSelection();
  testEnvBookmakerSelection();
  testDeterministicFallbackBookmakerSelection();
  testOddsQueryValidationAndPath();
  await testInvalidEmptyQueryNoNetwork();
  await testFixtureQueryViaAdapter();
  await testDateQueryPaginationViaClient();
  testQuotaCacheRegression();
  await testAdapterOddsProviderContract();
}

void runApiFootballOddsTests()
  .then(() => {
    setApiFootballClientForTests(null);
    console.log("API-Football odds tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
