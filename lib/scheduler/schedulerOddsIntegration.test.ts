import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import type { OddsData, OddsProvider } from "@/lib/providers/providerTypes";
import { MockOddsAdapter } from "@/lib/providers/odds/mockOddsAdapter";
import {
  disableExecutionLogPersistStoreForTests,
  enableExecutionLogPersistStoreForTests,
  listExecutionLogs,
  mapApiFixtureToSchedulerSource,
  resetExecutionLogsForTests,
  resetSchedulerLocksForTests,
  runDailyScheduler,
  toProductionFixture,
} from "@/lib/scheduler";
import { buildSchedulerPlaceholderOdds } from "@/lib/scheduler/schedulerPlaceholderOdds";
import {
  buildOddsQueryFromSchedulerFixture,
  resolveSchedulerFixturesToProduction,
} from "@/lib/scheduler/schedulerOddsIntegration";
import { resolveSchedulerRawOdds } from "@/lib/scheduler/schedulerOddsResolver";
import type { SchedulerFixtureSource } from "@/lib/scheduler/schedulerTypes";
import {
  resetInMemoryProductionStore,
  saveMatchInMemory,
  listInMemoryProductionRecords,
} from "@/lib/production";

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

function buildSchedulerFixture(
  overrides: Partial<SchedulerFixtureSource> = {}
): SchedulerFixtureSource {
  return {
    fixtureId: 9001,
    matchDate: "2026-07-20",
    league: "International Friendly",
    leagueName: "International Friendly",
    leagueId: 999,
    season: 2026,
    kickoffTime: "2026-07-20T19:00:00.000Z",
    homeTeam: "英格蘭",
    awayTeam: "葡萄牙",
    homeTeamId: 100,
    awayTeamId: 101,
    status: "NS",
    ...overrides,
  };
}

function testFixtureMappingDoesNotCreateOdds(): void {
  const mapped = mapApiFixtureToSchedulerSource({
    fixtureId: 21,
    date: "2026-07-16",
    kickoffTime: "2026-07-16T23:30:00.000Z",
    league: "Brasileirão",
    leagueId: 71,
    season: 2025,
    homeTeam: "Home FC",
    awayTeam: "Away FC",
    homeTeamId: 210,
    awayTeamId: 211,
    status: "NS",
    homeGoals: null,
    awayGoals: null,
    halfTimeHome: null,
    halfTimeAway: null,
    venue: null,
    neutralVenue: false,
  });

  assert(mapped.rawOdds === undefined, "fixture mapping must not create rawOdds");
}

async function testSchedulerIntegrationUsesResolverBeforeProductionFixture(): Promise<void> {
  const fixture = buildSchedulerFixture();
  const query = buildOddsQueryFromSchedulerFixture(fixture);

  assert(query.fixtureId === 9001, "OddsQuery should include fixtureId");
  assert(query.date === undefined, "OddsQuery should not over-filter with date");
  assert(query.leagueId === undefined, "OddsQuery should not over-filter with leagueId");
  assert(query.season === undefined, "OddsQuery should not over-filter with season");

  const { productionFixtures, schedulerOdds } = await resolveSchedulerFixturesToProduction([
    fixture,
  ]);

  assert(productionFixtures.length === 1, "integration should produce one ProductionFixture");
  assert(productionFixtures[0]?.rawOdds.trim().length > 0, "ProductionFixture must have rawOdds");
  assert(schedulerOdds.total === 1, "schedulerOdds total should match fixture count");
  assert(schedulerOdds.source === "placeholder", "default routing should use placeholder");
  assert(
    schedulerOdds.resolved + schedulerOdds.fallback === schedulerOdds.total,
    "schedulerOdds counts should sum to total"
  );
}

async function testFlagOffRegressionMatchesPlaceholderProduction(): Promise<void> {
  await withEnv(
    {
      USE_REAL_SCHEDULER_ODDS: "false",
      SCHEDULER_ODDS_SOURCE: undefined,
    },
    async () => {
      const fixture = buildSchedulerFixture({
        fixtureId: 42,
        homeTeam: "Arsenal",
        awayTeam: "Chelsea",
      });
      const { productionFixtures, schedulerOdds } =
        await resolveSchedulerFixturesToProduction([fixture]);

      const expected = buildSchedulerPlaceholderOdds("Arsenal", "Chelsea");
      assert(
        productionFixtures[0]?.rawOdds === expected,
        "flag off should produce placeholder odds identical to current production"
      );
      assert(schedulerOdds.fallback === 1, "flag off should count as fallback");
      assert(schedulerOdds.resolved === 0, "flag off should not count resolved odds");
      assert(schedulerOdds.source === "placeholder", "flag off should record placeholder source");
      assert(schedulerOdds.providerErrors === 0, "flag off should not record provider errors");
    }
  );
}

async function testMockIntegrationWhenFlagsEnabled(): Promise<void> {
  await withEnv(
    {
      NODE_ENV: "test",
      USE_REAL_SCHEDULER_ODDS: "true",
      SCHEDULER_ODDS_SOURCE: "mock",
    },
    async () => {
      const fixture = buildSchedulerFixture();
      const { productionFixtures, schedulerOdds } =
        await resolveSchedulerFixturesToProduction([fixture]);

      assert(
        productionFixtures[0]?.rawOdds.includes("英格蘭 vs 葡萄牙"),
        "mock integration should produce formatted mock odds"
      );
      assert(
        productionFixtures[0]?.rawOdds !==
          buildSchedulerPlaceholderOdds(fixture.homeTeam, fixture.awayTeam),
        "mock integration should not use placeholder when mock odds exist"
      );
      assert(schedulerOdds.resolved === 1, "mock integration should count resolved odds");
      assert(schedulerOdds.fallback === 0, "mock integration should not count fallback");
      assert(schedulerOdds.source === "mock", "mock integration should record mock source");
      assert(schedulerOdds.providerErrors === 0, "mock integration should not record provider errors");
    }
  );
}

async function testProviderFailFallbackDoesNotBreakBatch(): Promise<void> {
  const failingProvider: OddsProvider = {
    async fetchOdds() {
      throw new Error("provider failed");
    },
  };

  const fixtures = [
    buildSchedulerFixture({ fixtureId: 1, homeTeam: "A", awayTeam: "B" }),
    buildSchedulerFixture({ fixtureId: 2, homeTeam: "C", awayTeam: "D" }),
  ];

  const { productionFixtures, schedulerOdds } = await withEnv({ NODE_ENV: "test" }, async () =>
    resolveSchedulerFixturesToProduction(fixtures, {
      isRealOddsEnabled: () => true,
      getOddsSource: () => "mock",
      providerSource: "mock",
      provider: failingProvider,
    })
  );

  assert(productionFixtures.length === 2, "batch should continue after provider failure");
  assert(
    productionFixtures.every((fixture) => fixture.rawOdds.trim().length > 0),
    "every ProductionFixture should still have rawOdds"
  );
  assert(schedulerOdds.fallback === 2, "provider failures should count as fallback");
  assert(schedulerOdds.providerErrors === 2, "provider failures should count provider errors");
}

async function testFormatterFailFallbackDoesNotBreakBatch(): Promise<void> {
  const adapter = new MockOddsAdapter();
  const fixtures = [
    buildSchedulerFixture({ fixtureId: 9001 }),
    buildSchedulerFixture({
      fixtureId: 9002,
      matchDate: "2026-07-21",
      homeTeam: "荷蘭",
      awayTeam: "比利時",
    }),
  ];

  const { productionFixtures, schedulerOdds } = await withEnv({ NODE_ENV: "test" }, async () =>
    resolveSchedulerFixturesToProduction(fixtures, {
      isRealOddsEnabled: () => true,
      getOddsSource: () => "mock",
      providerSource: "mock",
      provider: adapter,
      formatter: () => null,
    })
  );

  assert(productionFixtures.length === 2, "batch should continue after formatter failure");
  assert(schedulerOdds.fallback === 2, "formatter failures should count as fallback");
  assert(schedulerOdds.providerErrors === 2, "formatter failures should count provider errors");
}

async function testBatchSingleFailureOnlyAffectsThatFixture(): Promise<void> {
  let callCount = 0;
  const selectiveProvider: OddsProvider = {
    async fetchOdds(query) {
      callCount += 1;
      if (query.fixtureId === 9001) {
        throw new Error("single fixture provider failure");
      }
      return new MockOddsAdapter().fetchOdds(query);
    },
  };

  const fixtures = [
    buildSchedulerFixture({ fixtureId: 9001 }),
    buildSchedulerFixture({
      fixtureId: 9002,
      matchDate: "2026-07-21",
      homeTeam: "荷蘭",
      awayTeam: "比利時",
    }),
  ];

  const { productionFixtures, schedulerOdds } = await withEnv({ NODE_ENV: "test" }, async () =>
    resolveSchedulerFixturesToProduction(fixtures, {
      isRealOddsEnabled: () => true,
      getOddsSource: () => "mock",
      providerSource: "mock",
      provider: selectiveProvider,
    })
  );

  assert(callCount === 2, "provider should be invoked for each fixture");
  assert(productionFixtures.length === 2, "batch should complete both fixtures");
  assert(schedulerOdds.total === 2, "schedulerOdds total should include both fixtures");
  assert(schedulerOdds.fallback === 1, "failed fixture should count as fallback");
  assert(schedulerOdds.resolved === 1, "successful fixture should count as resolved");
  assert(schedulerOdds.providerErrors === 1, "failed fixture should count provider error");
}

async function testProductionFixtureAlwaysHasRawOddsAndAnalyzeMatchWorks(): Promise<void> {
  const fixture = buildSchedulerFixture({
    fixtureId: 77,
    homeTeam: "Liverpool",
    awayTeam: "Tottenham",
  });
  const { productionFixtures } = await resolveSchedulerFixturesToProduction([fixture]);
  const production = productionFixtures[0]!;

  assert(production.rawOdds.trim().length > 0, "ProductionFixture must always have rawOdds");
  const report = analyzeMatch(production.rawOdds);
  assert(report.recommendation !== undefined, "analyzeMatch should still produce recommendation");
  assert(report.decision !== undefined, "analyzeMatch should still produce decision");
}

async function testExecutionLogIncludesSchedulerOdds(): Promise<void> {
  resetInMemoryProductionStore();
  resetExecutionLogsForTests();
  resetSchedulerLocksForTests();
  enableExecutionLogPersistStoreForTests();

  try {
    await withEnv(
      {
        USE_REAL_SCHEDULER_ODDS: "false",
        SCHEDULER_ODDS_SOURCE: undefined,
      },
      async () =>
        runDailyScheduler({
          runDate: "2026-07-16",
          ownerId: "scheduler-odds-log-test",
          fetchFixtures: async () => ({
            fixtures: [
              mapApiFixtureToSchedulerSource({
                fixtureId: 501,
                date: "2026-07-16",
                kickoffTime: "2026-07-16T19:00:00.000Z",
                league: "Premier League",
                leagueId: 39,
                season: 2026,
                homeTeam: "Arsenal",
                awayTeam: "Chelsea",
                homeTeamId: 5010,
                awayTeamId: 5011,
                status: "NS",
                homeGoals: null,
                awayGoals: null,
                halfTimeHome: null,
                halfTimeAway: null,
                venue: null,
                neutralVenue: false,
              }),
            ],
            skipped: [],
          }),
          saveMatch: saveMatchInMemory,
          listRecords: async () => listInMemoryProductionRecords(),
          runSummaryCron: async () => ({
            summaryDate: "2026-07-16",
            syncedAt: new Date().toISOString(),
          }),
        })
    );

    const log = listExecutionLogs(10).find((entry) => entry.jobName === "daily_analysis");
    const schedulerOdds = log?.context?.schedulerOdds as
      | {
          source: string;
          total: number;
          resolved: number;
          fallback: number;
          providerErrors: number;
        }
      | undefined;

    assert(Boolean(schedulerOdds), "execution log should include schedulerOdds");
    assert(schedulerOdds!.total === 1, "execution log schedulerOdds.total should match fixtures");
    assert(schedulerOdds!.source === "placeholder", "flag off run should record placeholder source");
    assert(schedulerOdds!.fallback === 1, "flag off run should record fallback odds");
    assert(schedulerOdds!.resolved === 0, "flag off run should not record resolved odds");
    assert(schedulerOdds!.providerErrors === 0, "flag off run should not record provider errors");
  } finally {
    disableExecutionLogPersistStoreForTests();
  }
}

function testToProductionFixtureRequiresResolvedOdds(): void {
  const fixture = buildSchedulerFixture();
  let threw = false;
  try {
    toProductionFixture(fixture);
  } catch {
    threw = true;
  }
  assert(threw, "toProductionFixture should require rawOdds from integration step");
}

async function testResolveSchedulerRawOddsStillReturnsNonEmptyWithoutMappingPlaceholder(): Promise<void> {
  const rawOdds = await resolveSchedulerRawOdds({
    query: { fixtureId: 9001 },
    homeTeam: "英格蘭",
    awayTeam: "葡萄牙",
  });

  assert(rawOdds.trim().length > 0, "resolver should still return non-empty rawOdds");
}

export async function runSchedulerOddsIntegrationTests(): Promise<void> {
  testFixtureMappingDoesNotCreateOdds();
  await testSchedulerIntegrationUsesResolverBeforeProductionFixture();
  await testFlagOffRegressionMatchesPlaceholderProduction();
  await testMockIntegrationWhenFlagsEnabled();
  await testProviderFailFallbackDoesNotBreakBatch();
  await testFormatterFailFallbackDoesNotBreakBatch();
  await testBatchSingleFailureOnlyAffectsThatFixture();
  await testProductionFixtureAlwaysHasRawOddsAndAnalyzeMatchWorks();
  await testExecutionLogIncludesSchedulerOdds();
  testToProductionFixtureRequiresResolvedOdds();
  await testResolveSchedulerRawOddsStillReturnsNonEmptyWithoutMappingPlaceholder();
}

void runSchedulerOddsIntegrationTests()
  .then(() => {
    console.log("Scheduler odds integration tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
