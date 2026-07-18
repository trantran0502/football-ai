import { MockFootballProvider } from "@/lib/providers/mockProvider";
import {
  listMockOddsIndexForTests,
  MockOddsAdapter,
} from "@/lib/providers/odds/mockOddsAdapter";
import type { OddsData, OddsProvider } from "@/lib/providers/providerTypes";
import { parseOdds } from "@/lib/parser/parser";
import { hasParsedMarkets } from "@/lib/parser/syncLegacyMarkets";
import { buildSchedulerPlaceholderOdds } from "@/lib/scheduler/schedulerPlaceholderOdds";
import { isRealSchedulerOddsEnabled } from "@/lib/scheduler/schedulerOddsConfig";
import { formatSchedulerRawOdds } from "@/lib/scheduler/schedulerRawOddsFormatter";
import { resolveSchedulerRawOdds } from "@/lib/scheduler/schedulerOddsResolver";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function withEnv<T>(key: string, value: string | undefined, run: () => T): T {
  const previous = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }

  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
}

async function buildMockOddsData(matchId: string): Promise<OddsData> {
  const provider = new MockFootballProvider();
  const odds = await provider.getOdds({ matchId });
  assert(Boolean(odds), `missing mock odds for ${matchId}`);
  return odds!;
}

function testFeatureFlagDefaultsToDisabledInNonProduction(): void {
  withEnv("NODE_ENV", "development", () => {
    withEnv("USE_REAL_SCHEDULER_ODDS", undefined, () => {
      assert(
        !isRealSchedulerOddsEnabled(),
        "non-production should default real scheduler odds to disabled"
      );
    });
  });
}

function testFeatureFlagDefaultsToEnabledInProduction(): void {
  withEnv("NODE_ENV", "production", () => {
    withEnv("USE_REAL_SCHEDULER_ODDS", undefined, () => {
      assert(
        isRealSchedulerOddsEnabled(),
        "production should default real scheduler odds to enabled"
      );
    });
  });
}

function testFeatureFlagEnablesRealOdds(): void {
  withEnv("USE_REAL_SCHEDULER_ODDS", "true", () => {
    assert(isRealSchedulerOddsEnabled(), "USE_REAL_SCHEDULER_ODDS=true should enable real odds");
  });
}

async function testMockOddsAdapterFetchByMatchId(): Promise<void> {
  const adapter = new MockOddsAdapter();
  const results = await adapter.fetchOdds({ matchId: "mock-upcoming-1" });

  assert(results.length === 1, "matchId query should return one odds record");
  assert(results[0]?.fixtureId === 9001, "fixtureId should be attached");
  assert(results[0]?.bookmakerId === "mock-default", "bookmakerId should be attached");
  assert(results[0]?.marketSelections.length > 0, "marketSelections should be populated");
}

async function testMockOddsAdapterFetchByFixtureId(): Promise<void> {
  const adapter = new MockOddsAdapter();
  const results = await adapter.fetchOdds({ fixtureId: 9002 });

  assert(results.length === 1, "fixtureId query should return one odds record");
  assert(results[0]?.matchId === "mock-upcoming-2", "fixtureId 9002 should map to mock-upcoming-2");
}

async function testMockOddsAdapterFetchByDate(): Promise<void> {
  const adapter = new MockOddsAdapter();
  const results = await adapter.fetchOdds({ date: "2026-07-20" });

  assert(results.length === 1, "date query should return records on that date");
  assert(results[0]?.matchId === "mock-upcoming-1", "2026-07-20 should map to mock-upcoming-1");
}

async function testMockOddsAdapterFetchByLeagueAndSeason(): Promise<void> {
  const adapter = new MockOddsAdapter();
  const results = await adapter.fetchOdds({ leagueId: 998, season: 2026 });

  assert(results.length === 3, "leagueId+season should return historical mock records");
}

async function testMockOddsAdapterFetchByBookmakerId(): Promise<void> {
  const adapter = new MockOddsAdapter();
  const matched = await adapter.fetchOdds({
    matchId: "mock-upcoming-1",
    bookmakerId: "mock-default",
  });
  const unmatched = await adapter.fetchOdds({
    matchId: "mock-upcoming-1",
    bookmakerId: "missing-bookmaker",
  });

  assert(matched.length === 1, "matching bookmakerId should return odds");
  assert(unmatched.length === 0, "non-matching bookmakerId should return empty array");
}

async function testMockOddsAdapterDoesNotReturnRawOddsString(): Promise<void> {
  const adapter = new MockOddsAdapter();
  const results = await adapter.fetchOdds({ matchId: "mock-upcoming-1" });
  const odds = results[0]!;

  assert(Array.isArray(odds.marketSelections), "adapter should return OddsData with marketSelections");
  assert(!("rawOdds" in odds), "adapter must not expose rawOdds field");
}

async function testFormatterRoundTripFromMockOddsData(): Promise<void> {
  const oddsData = await buildMockOddsData("mock-upcoming-1");
  const formatted = formatSchedulerRawOdds(oddsData);

  assert(typeof formatted === "string" && formatted.length > 0, "formatter should return rawOdds string");
  const parsed = parseOdds(formatted!);
  assert(hasParsedMarkets(parsed), "formatted rawOdds should parse successfully");
  assert(parsed.marketSelections.length >= 4, "formatted rawOdds should include scheduler markets");
}

async function testFormatterReturnsNullForInvalidOddsData(): Promise<void> {
  const oddsData = await buildMockOddsData("mock-upcoming-1");
  const invalid = {
    ...oddsData,
    marketSelections: [],
  };

  assert(formatSchedulerRawOdds(invalid) === null, "empty marketSelections should return null");
}

async function testResolverUsesPlaceholderWhenFeatureFlagDisabled(): Promise<void> {
  const result = await withEnv("USE_REAL_SCHEDULER_ODDS", "false", async () =>
    resolveSchedulerRawOdds({
      query: { fixtureId: 9001 },
      homeTeam: "英格蘭",
      awayTeam: "葡萄牙",
    })
  );

  assert(
    result === buildSchedulerPlaceholderOdds("英格蘭", "葡萄牙"),
    "disabled feature flag should use placeholder odds"
  );
}

async function testResolverUsesMockProviderWhenFeatureFlagEnabled(): Promise<void> {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousReal = process.env.USE_REAL_SCHEDULER_ODDS;
  const previousSource = process.env.SCHEDULER_ODDS_SOURCE;
  process.env.NODE_ENV = "test";
  process.env.USE_REAL_SCHEDULER_ODDS = "true";
  process.env.SCHEDULER_ODDS_SOURCE = "mock";

  try {
    const result = await resolveSchedulerRawOdds({
      query: { fixtureId: 9001 },
      homeTeam: "英格蘭",
      awayTeam: "葡萄牙",
    });

    assert(result.includes("英格蘭 vs 葡萄牙"), "enabled resolver should return formatted mock odds header");
    assert(result.includes("獨贏"), "enabled resolver should include moneyline section");
    assert(
      result !== buildSchedulerPlaceholderOdds("英格蘭", "葡萄牙"),
      "enabled resolver should not use placeholder when mock odds are available"
    );
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousReal === undefined) {
      delete process.env.USE_REAL_SCHEDULER_ODDS;
    } else {
      process.env.USE_REAL_SCHEDULER_ODDS = previousReal;
    }
    if (previousSource === undefined) {
      delete process.env.SCHEDULER_ODDS_SOURCE;
    } else {
      process.env.SCHEDULER_ODDS_SOURCE = previousSource;
    }
  }
}

async function testResolverFallsBackWhenProviderReturnsEmpty(): Promise<void> {
  const emptyProvider: OddsProvider = {
    async fetchOdds() {
      return [];
    },
  };

  const result = await withEnv("NODE_ENV", "test", async () =>
    resolveSchedulerRawOdds(
      {
        query: { fixtureId: 9001 },
        homeTeam: "英格蘭",
        awayTeam: "葡萄牙",
      },
      {
        isRealOddsEnabled: () => true,
        getOddsSource: () => "mock",
        providerSource: "mock",
        provider: emptyProvider,
      }
    )
  );

  assert(
    result === buildSchedulerPlaceholderOdds("英格蘭", "葡萄牙"),
    "empty provider result should fall back to placeholder odds"
  );
}

async function testResolverFallsBackWhenProviderThrows(): Promise<void> {
  const failingProvider: OddsProvider = {
    async fetchOdds() {
      throw new Error("provider failed");
    },
  };

  const result = await withEnv("NODE_ENV", "test", async () =>
    resolveSchedulerRawOdds(
      {
        query: { fixtureId: 9001 },
        homeTeam: "英格蘭",
        awayTeam: "葡萄牙",
      },
      {
        isRealOddsEnabled: () => true,
        getOddsSource: () => "mock",
        providerSource: "mock",
        provider: failingProvider,
      }
    )
  );

  assert(
    result === buildSchedulerPlaceholderOdds("英格蘭", "葡萄牙"),
    "provider failure should fall back to placeholder odds"
  );
}

async function testResolverFallsBackWhenFormatterReturnsNull(): Promise<void> {
  const adapter = new MockOddsAdapter();
  const result = await withEnv("NODE_ENV", "test", async () =>
    resolveSchedulerRawOdds(
      {
        query: { fixtureId: 9001 },
        homeTeam: "英格蘭",
        awayTeam: "葡萄牙",
      },
      {
        isRealOddsEnabled: () => true,
        getOddsSource: () => "mock",
        providerSource: "mock",
        provider: adapter,
        formatter: () => null,
      }
    )
  );

  assert(
    result === buildSchedulerPlaceholderOdds("英格蘭", "葡萄牙"),
    "formatter null should fall back to placeholder odds"
  );
}

async function testResolverAlwaysReturnsNonEmptyString(): Promise<void> {
  const scenarios = [
    withEnv("USE_REAL_SCHEDULER_ODDS", undefined, async () =>
      resolveSchedulerRawOdds({
        query: { fixtureId: 999999 },
        homeTeam: "A",
        awayTeam: "B",
      })
    ),
    withEnv("NODE_ENV", "test", async () =>
      resolveSchedulerRawOdds(
        {
          query: { fixtureId: 999999 },
          homeTeam: "A",
          awayTeam: "B",
        },
        {
          isRealOddsEnabled: () => true,
          getOddsSource: () => "mock",
          providerSource: "mock",
          provider: {
            async fetchOdds() {
              return [];
            },
          },
        }
      )
    ),
  ];

  for (const scenario of scenarios) {
    const result = await scenario;
    assert(typeof result === "string" && result.trim().length > 0, "resolver must always return non-empty string");
  }
}

async function testRegressionMockProviderGetOddsStillWorks(): Promise<void> {
  const provider = new MockFootballProvider();
  const odds = await provider.getOdds({ matchId: "mock-upcoming-1" });
  assert(Boolean(odds), "MockFootballProvider.getOdds should still resolve by matchId");
  assert(odds!.marketSelections.length > 0, "MockFootballProvider odds should include markets");
}

function testRegressionMockOddsIndexCoversAllMockRecords(): void {
  assert(listMockOddsIndexForTests().length === 5, "mock odds index should cover all mock records");
}

export async function runSchedulerOddsFoundationTests(): Promise<void> {
  testFeatureFlagDefaultsToDisabledInNonProduction();
  testFeatureFlagDefaultsToEnabledInProduction();
  testFeatureFlagEnablesRealOdds();
  await testMockOddsAdapterFetchByMatchId();
  await testMockOddsAdapterFetchByFixtureId();
  await testMockOddsAdapterFetchByDate();
  await testMockOddsAdapterFetchByLeagueAndSeason();
  await testMockOddsAdapterFetchByBookmakerId();
  await testMockOddsAdapterDoesNotReturnRawOddsString();
  await testFormatterRoundTripFromMockOddsData();
  await testFormatterReturnsNullForInvalidOddsData();
  await testResolverUsesPlaceholderWhenFeatureFlagDisabled();
  await testResolverUsesMockProviderWhenFeatureFlagEnabled();
  await testResolverFallsBackWhenProviderReturnsEmpty();
  await testResolverFallsBackWhenProviderThrows();
  await testResolverFallsBackWhenFormatterReturnsNull();
  await testResolverAlwaysReturnsNonEmptyString();
  await testRegressionMockProviderGetOddsStillWorks();
  testRegressionMockOddsIndexCoversAllMockRecords();
}

void runSchedulerOddsFoundationTests()
  .then(() => {
    console.log("Scheduler odds foundation tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
