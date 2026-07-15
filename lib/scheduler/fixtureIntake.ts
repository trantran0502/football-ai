import type { ProductionFixture } from "@/lib/production/productionTypes";
import type { SchedulerFixtureSource } from "@/lib/scheduler/schedulerTypes";
import {
  filterFixturesByLeagueIdWhitelist,
} from "@/lib/scheduler/leagueWhitelist";
import { isLeagueAllowed } from "@/lib/scheduler/schedulerConfig";
import { getApiFootballClient } from "@/lib/providers/apiFootball/apiFootballClient";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import {
  intakeApiFixtures,
  toProductionFixture,
  type FixtureIntakeResult,
} from "@/lib/scheduler/fixtureMapping";
import { buildSchedulerPlaceholderOdds } from "@/lib/scheduler/schedulerPlaceholderOdds";
import {
  buildFixtureFilterStats,
  filterAnalyzableFixtures,
  type FixtureFilterStats,
} from "@/lib/scheduler/fixtureFilterStats";

export { buildSchedulerPlaceholderOdds } from "@/lib/scheduler/schedulerPlaceholderOdds";

export function filterFixturesByLeagueWhitelist(
  fixtures: SchedulerFixtureSource[],
  whitelist: string[]
): SchedulerFixtureSource[] {
  return fixtures.filter((fixture) => isLeagueAllowed(fixture.leagueName, whitelist));
}

export function filterFixturesBySchedulerLeaguePolicy(
  fixtures: SchedulerFixtureSource[],
  options: {
    leagueIdWhitelist: number[];
    leagueWhitelist: string[];
  }
): SchedulerFixtureSource[] {
  let filtered = fixtures.filter(
    (fixture) =>
      typeof fixture.leagueId === "number" &&
      Number.isInteger(fixture.leagueId) &&
      fixture.leagueId > 0 &&
      fixture.leagueName.trim().length > 0
  );

  if (options.leagueIdWhitelist.length > 0) {
    filtered = filterFixturesByLeagueIdWhitelist(filtered, options.leagueIdWhitelist);
  } else if (options.leagueWhitelist.length > 0) {
    filtered = filterFixturesByLeagueWhitelist(filtered, options.leagueWhitelist);
  }

  return filtered;
}

export function toProductionFixtures(fixtures: SchedulerFixtureSource[]): ProductionFixture[] {
  return fixtures.map(toProductionFixture);
}

export async function fetchFixturesByDate(
  matchDate: string,
  options: {
    fetchFromApi?: (date: string) => Promise<ApiFootballFixtureRecord[]>;
  } = {}
): Promise<FixtureIntakeResult> {
  const fetchFromApi =
    options.fetchFromApi ??
    (async (date: string) => {
      const client = getApiFootballClient();
      if (!client.isConfigured()) {
        return [];
      }
      return client.getFixturesByDate(date);
    });

  const apiFixtures = await fetchFromApi(matchDate);
  const activeFixtures = apiFixtures.filter(
    (fixture) => fixture.status !== "CANC" && fixture.status !== "ABD"
  );

  const intake = intakeApiFixtures(activeFixtures);
  return {
    ...intake,
    fetchMeta: {
      apiRaw: apiFixtures.length,
      cancelledOrAbandoned: apiFixtures.length - activeFixtures.length,
    },
  };
}

export { buildFixtureFilterStats, filterAnalyzableFixtures, type FixtureFilterStats } from "@/lib/scheduler/fixtureFilterStats";

export {
  filterFixturesByLeagueIdWhitelist,
  parseLeagueIdWhitelist,
} from "@/lib/scheduler/leagueWhitelist";
