import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import type { OddsData, OddsProvider } from "@/lib/providers/providerTypes";
import { MockOddsAdapter } from "@/lib/providers/odds/mockOddsAdapter";
import { buildSchedulerPlaceholderOdds } from "@/lib/scheduler/schedulerPlaceholderOdds";
import {
  resolveSchedulerOddsProviderSource,
  shouldUseApiFootballSchedulerOddsProvider,
} from "@/lib/scheduler/schedulerOddsConfig";
import { createSchedulerOddsProvider } from "@/lib/scheduler/schedulerOddsProvider";
import {
  resolveSchedulerFixturesToProduction,
} from "@/lib/scheduler/schedulerOddsIntegration";
import {
  resolveSchedulerRawOddsDetailed,
} from "@/lib/scheduler/schedulerOddsResolver";
import type { SchedulerFixtureSource } from "@/lib/scheduler/schedulerTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function withEnv<T>(
  values: Record<string, string | undefined>,
  run: () => T | Promise<T>
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return Promise.resolve(run()).finally(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

function buildFixture(
  overrides: Partial<SchedulerFixtureSource> = {}
): SchedulerFixtureSource {
  return {
    fixtureId: 120001,
    matchDate: "2026-07-20",
    league: "Premier League",
    leagueName: "Premier League",
    leagueId: 39,
    season: 2026,
    kickoffTime: "2026-07-20T15:00:00.000Z",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    homeTeamId: 42,
    awayTeamId: 49,
    status: "NS",
    ...overrides,
  };
}

async function testPlaceholderRouting(): Promise<void> {
  await withEnv(
    { USE_REAL_SCHEDULER_ODDS: "false", SCHEDULER_ODDS_SOURCE: undefined },
    async () => {
      assert(
        resolveSchedulerOddsProviderSource() === "placeholder",
        "disabled flag should route to placeholder"
      );
      const { productionFixtures, schedulerOdds } =
        await resolveSchedulerFixturesToProduction([buildFixture()]);
      assert(
        productionFixtures[0]?.rawOdds ===
          buildSchedulerPlaceholderOdds("Arsenal", "Chelsea"),
        "placeholder routing should use placeholder odds"
      );
      assert(schedulerOdds.source === "placeholder", "stats source should be placeholder");
    }
  );
}

async function testMockRouting(): Promise<void> {
  await withEnv(
    { NODE_ENV: "test", USE_REAL_SCHEDULER_ODDS: "true", SCHEDULER_ODDS_SOURCE: "mock" },
    async () => {
      assert(
        resolveSchedulerOddsProviderSource() === "mock",
        "mock flag should route to mock"
      );
      assert(createSchedulerOddsProvider("mock") instanceof MockOddsAdapter, "mock factory");
    }
  );
}

async function testApiFootballRouting(): Promise<void> {
  await withEnv(
    { USE_REAL_SCHEDULER_ODDS: "true", SCHEDULER_ODDS_SOURCE: "api-football" },
    async () => {
      assert(
        resolveSchedulerOddsProviderSource() === "api-football",
        "api-football flag should route to api-football"
      );
      assert(shouldUseApiFootballSchedulerOddsProvider(), "api-football helper");
      assert(
        createSchedulerOddsProvider("api-football") !== null,
        "api-football factory should create provider"
      );
    }
  );
}

async function testUnknownProviderRouting(): Promise<void> {
  await withEnv(
    { USE_REAL_SCHEDULER_ODDS: "true", SCHEDULER_ODDS_SOURCE: "unknown-source" },
    async () => {
      assert(
        resolveSchedulerOddsProviderSource() === "api-football",
        "unknown source should default to api-football"
      );
      const outcome = await resolveSchedulerRawOddsDetailed(
        {
          query: { fixtureId: 1 },
          homeTeam: "A",
          awayTeam: "B",
        },
        {
          providerSource: "api-football",
          provider: {
            async fetchOdds() {
              return [];
            },
          },
        }
      );
      assert(outcome.usedFallback, "empty api-football result should fallback");
      assert(outcome.providerError, "empty api-football result should count provider error");
    }
  );
}

async function testTimeoutFallback(): Promise<void> {
  const provider: OddsProvider = {
    async fetchOdds() {
      throw new Error("timeout");
    },
  };
  const outcome = await resolveSchedulerRawOddsDetailed(
    { query: { fixtureId: 1 }, homeTeam: "A", awayTeam: "B" },
    {
      providerSource: "api-football",
      provider,
      canUseOddsProvider: () => true,
    }
  );
  assert(outcome.usedFallback, "timeout should fallback");
  assert(outcome.providerError, "timeout should count provider error");
}

async function test429Fallback(): Promise<void> {
  const provider: OddsProvider = {
    async fetchOdds() {
      throw new Error("API-Football transient error: 429");
    },
  };
  const outcome = await resolveSchedulerRawOddsDetailed(
    { query: { fixtureId: 1 }, homeTeam: "A", awayTeam: "B" },
    { providerSource: "api-football", provider, canUseOddsProvider: () => true }
  );
  assert(outcome.providerError, "429 should count provider error");
}

async function testQuotaFallback(): Promise<void> {
  const provider: OddsProvider = {
    async fetchOdds() {
      return [
        {
          matchId: "api-football:1",
          fixtureId: 1,
          date: "2026-07-20",
          league: "Premier League",
          homeTeam: "Arsenal",
          awayTeam: "Chelsea",
          marketSelections: [],
          capturedAt: "2026-07-20T00:00:00.000Z",
          source: "api-football",
        },
      ];
    },
  };

  const { productionFixtures, schedulerOdds } = await resolveSchedulerFixturesToProduction(
    [buildFixture({ fixtureId: 1 }), buildFixture({ fixtureId: 2, homeTeam: "A", awayTeam: "B" })],
    {
      providerSource: "api-football",
      provider,
      canMakeApiFootballRequest: () => false,
    }
  );

  assert(productionFixtures.length === 2, "quota fallback should keep batch size");
  assert(schedulerOdds.fallback === 2, "quota fallback should fallback all fixtures");
  assert(schedulerOdds.providerErrors === 2, "quota fallback should count provider errors");
}

async function testMappingExceptionFallback(): Promise<void> {
  const provider: OddsProvider = {
    async fetchOdds() {
      return [] as OddsData[];
    },
  };
  const outcome = await withEnv({ NODE_ENV: "test" }, async () =>
    resolveSchedulerRawOddsDetailed(
      { query: { fixtureId: 1 }, homeTeam: "A", awayTeam: "B" },
      { providerSource: "mock", provider, canUseOddsProvider: () => true }
    )
  );
  assert(outcome.usedFallback, "empty mapping should fallback");
  assert(outcome.providerError, "empty mapping should count provider error");
}

async function testFormatterExceptionFallback(): Promise<void> {
  const provider = new MockOddsAdapter();
  const outcome = await withEnv({ NODE_ENV: "test" }, async () =>
    resolveSchedulerRawOddsDetailed(
      { query: { fixtureId: 9001 }, homeTeam: "英格蘭", awayTeam: "葡萄牙" },
      {
        providerSource: "mock",
        provider,
        formatter: () => null,
        canUseOddsProvider: () => true,
      }
    )
  );
  assert(outcome.usedFallback, "formatter null should fallback");
  assert(outcome.providerError, "formatter null should count provider error");
}

async function testBatchIsolation(): Promise<void> {
  const provider: OddsProvider = {
    async fetchOdds(query) {
      if (query.fixtureId === 1) {
        throw new Error("fixture 1 failed");
      }
      return new MockOddsAdapter().fetchOdds({ fixtureId: 9002 });
    },
  };

  const { productionFixtures, schedulerOdds } = await withEnv({ NODE_ENV: "test" }, async () =>
    resolveSchedulerFixturesToProduction(
      [
        buildFixture({ fixtureId: 1 }),
        buildSchedulerFixtureLikeMock(),
      ],
      {
        providerSource: "mock",
        provider,
        canUseOddsProvider: () => true,
      }
    )
  );

  assert(productionFixtures.length === 2, "batch isolation should keep all fixtures");
  assert(schedulerOdds.resolved === 1, "one fixture should resolve");
  assert(schedulerOdds.fallback === 1, "one fixture should fallback");
}

function buildSchedulerFixtureLikeMock(): SchedulerFixtureSource {
  return buildFixture({
    fixtureId: 9002,
    matchDate: "2026-07-21",
    homeTeam: "荷蘭",
    awayTeam: "比利時",
    leagueId: 999,
    league: "International Friendly",
    leagueName: "International Friendly",
  });
}

async function testRollbackRegression(): Promise<void> {
  await withEnv(
    { USE_REAL_SCHEDULER_ODDS: "false", SCHEDULER_ODDS_SOURCE: "api-football" },
    async () => {
      const { productionFixtures, schedulerOdds } =
        await resolveSchedulerFixturesToProduction([buildFixture()]);
      assert(
        productionFixtures[0]?.rawOdds ===
          buildSchedulerPlaceholderOdds("Arsenal", "Chelsea"),
        "rollback should ignore api-football source when flag is off"
      );
      assert(schedulerOdds.source === "placeholder", "rollback stats source");
    }
  );
}

async function testProductionFixtureHasRawOddsAndAnalyzeMatchPass(): Promise<void> {
  const { productionFixtures } = await resolveSchedulerFixturesToProduction([
    buildFixture(),
  ]);
  const production = productionFixtures[0]!;
  assert(production.rawOdds.trim().length > 0, "production fixture must have rawOdds");
  const report = analyzeMatch(production.rawOdds);
  assert(report.recommendation !== undefined, "analyzeMatch should pass");
}

export async function runSchedulerOddsProductionRolloutTests(): Promise<void> {
  await testPlaceholderRouting();
  await testMockRouting();
  await testApiFootballRouting();
  await testUnknownProviderRouting();
  await testTimeoutFallback();
  await test429Fallback();
  await testQuotaFallback();
  await testMappingExceptionFallback();
  await testFormatterExceptionFallback();
  await testBatchIsolation();
  await testRollbackRegression();
  await testProductionFixtureHasRawOddsAndAnalyzeMatchPass();
}

void runSchedulerOddsProductionRolloutTests()
  .then(() => {
    console.log("Scheduler odds production rollout tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
