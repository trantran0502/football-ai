import {
  getSchedulerOddsProviderMode,
  isRealSchedulerOddsEnabled,
  logSchedulerOddsProvider,
  resolveSchedulerOddsProviderSource,
} from "@/lib/scheduler/schedulerOddsConfig";
import { createSchedulerOddsProvider } from "@/lib/scheduler/schedulerOddsProvider";
import { resolveSchedulerFixturesToProduction } from "@/lib/scheduler/schedulerOddsIntegration";
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

function buildFixture(): SchedulerFixtureSource {
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
  };
}

async function testProductionDefaultsToRealProvider(): Promise<void> {
  await withEnv(
    {
      NODE_ENV: "production",
      USE_REAL_SCHEDULER_ODDS: "true",
      SCHEDULER_ODDS_SOURCE: "api-football",
    },
    async () => {
      assert(isRealSchedulerOddsEnabled(), "production should enable real scheduler odds");
      assert(
        resolveSchedulerOddsProviderSource() === "api-football",
        "production should route to api-football"
      );
      assert(
        getSchedulerOddsProviderMode("api-football") === "REAL",
        "api-football should be REAL mode"
      );
      assert(createSchedulerOddsProvider("api-football") !== null, "real provider factory");

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      };

      try {
        await resolveSchedulerFixturesToProduction([buildFixture()], {
          provider: {
            async fetchOdds() {
              return [
                {
                  matchId: "api-football:120001",
                  fixtureId: 120001,
                  date: "2026-07-20",
                  league: "Premier League",
                  homeTeam: "Arsenal",
                  awayTeam: "Chelsea",
                  marketSelections: [
                    {
                      marketType: "moneyline",
                      marketFamily: "moneyline",
                      title: "Moneyline",
                      period: "full",
                      side: "home",
                      line: null,
                      rawLine: null,
                      modifier: null,
                      odds: 1.9,
                      impliedProbability: 0.526,
                    },
                  ],
                  capturedAt: "2026-07-20T00:00:00.000Z",
                  source: "api-football",
                },
              ];
            },
          },
          canMakeApiFootballRequest: () => true,
        });
      } finally {
        console.log = originalLog;
      }

      assert(
        logs.some((line) => line === "Scheduler Odds Provider: REAL"),
        "production run should log REAL provider"
      );
    }
  );
}

async function testProductionWithoutEnvDefaultsToRealProvider(): Promise<void> {
  await withEnv(
    {
      NODE_ENV: "production",
      USE_REAL_SCHEDULER_ODDS: undefined,
      SCHEDULER_ODDS_SOURCE: undefined,
    },
    () => {
      assert(isRealSchedulerOddsEnabled(), "unset env in production should default to true");
      assert(
        resolveSchedulerOddsProviderSource() === "api-football",
        "unset source in production should default to api-football"
      );
    }
  );
}

async function testTestEnvironmentAllowsMockProvider(): Promise<void> {
  await withEnv(
    {
      NODE_ENV: "test",
      USE_REAL_SCHEDULER_ODDS: "false",
      SCHEDULER_ODDS_SOURCE: "mock",
    },
    () => {
      assert(!isRealSchedulerOddsEnabled(), "test env may disable real odds");
      assert(
        resolveSchedulerOddsProviderSource() === "placeholder",
        "USE_REAL_SCHEDULER_ODDS=false should still use placeholder"
      );

      process.env.USE_REAL_SCHEDULER_ODDS = "true";
      assert(
        resolveSchedulerOddsProviderSource() === "mock",
        "test env with mock source should allow mock provider"
      );
      assert(
        getSchedulerOddsProviderMode("mock") === "MOCK",
        "mock provider should report MOCK mode"
      );

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      };
      try {
        logSchedulerOddsProvider("mock");
      } finally {
        console.log = originalLog;
      }
      assert(
        logs.some((line) => line === "Scheduler Odds Provider: MOCK"),
        "mock provider should log MOCK"
      );
    }
  );
}

async function testProductionWithRealOddsDisabledThrows(): Promise<void> {
  await withEnv(
    {
      NODE_ENV: "production",
      USE_REAL_SCHEDULER_ODDS: "false",
      SCHEDULER_ODDS_SOURCE: undefined,
    },
    () => {
      let threw = false;
      try {
        resolveSchedulerOddsProviderSource();
      } catch (error) {
        threw = true;
        assert(
          error instanceof Error &&
            error.message.includes("Production scheduler requires USE_REAL_SCHEDULER_ODDS=true"),
          "production with USE_REAL_SCHEDULER_ODDS=false should throw"
        );
      }
      assert(threw, "production with disabled real odds must throw");
    }
  );
}

async function testProductionWithMockSourceThrows(): Promise<void> {
  await withEnv(
    {
      NODE_ENV: "production",
      USE_REAL_SCHEDULER_ODDS: "true",
      SCHEDULER_ODDS_SOURCE: "mock",
    },
    () => {
      let threw = false;
      try {
        resolveSchedulerOddsProviderSource();
      } catch (error) {
        threw = true;
        assert(
          error instanceof Error &&
            (error.message.includes("Production scheduler cannot use mock odds") ||
              error.message.includes("MockOddsAdapter is only allowed")),
          "production with mock source should throw"
        );
      }
      assert(threw, "production mock routing must throw");
    }
  );
}

export async function runSchedulerOddsProductionGuardTests(): Promise<void> {
  await testProductionDefaultsToRealProvider();
  await testProductionWithoutEnvDefaultsToRealProvider();
  await testTestEnvironmentAllowsMockProvider();
  await testProductionWithRealOddsDisabledThrows();
  await testProductionWithMockSourceThrows();
}

void runSchedulerOddsProductionGuardTests()
  .then(() => {
    console.log("Scheduler odds production guard tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
