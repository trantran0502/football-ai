import type { ProductionFixture } from "@/lib/production/productionTypes";
import type { SchedulerFixtureSource } from "@/lib/scheduler/schedulerTypes";
import {
  filterFixturesByLeagueIdWhitelist,
} from "@/lib/scheduler/leagueWhitelist";
import { isLeagueAllowed } from "@/lib/scheduler/schedulerConfig";
import { getApiFootballClient } from "@/lib/providers/apiFootball/apiFootballClient";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";

const PLACEHOLDER_ODDS_TEMPLATE = `{home} vs {away}
獨贏
主 1.95
和 3.40
客 3.80
全場讓分
主-0.5 0.92
客+0.5 0.98
全場大小
大(2.5) 0.90
小(2.5) 0.96
雙方進球
是 0.82
否 1.02`;

export function buildSchedulerPlaceholderOdds(homeTeam: string, awayTeam: string): string {
  return PLACEHOLDER_ODDS_TEMPLATE.replace("{home}", homeTeam).replace("{away}", awayTeam);
}

export function mapApiFixtureToSource(fixture: ApiFootballFixtureRecord): SchedulerFixtureSource {
  return {
    fixtureId: fixture.fixtureId,
    matchDate: fixture.date,
    league: fixture.league ?? "Unknown",
    leagueId: fixture.leagueId,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    status: fixture.status,
    rawOdds: buildSchedulerPlaceholderOdds(fixture.homeTeam, fixture.awayTeam),
  };
}

export function filterFixturesByLeagueWhitelist(
  fixtures: SchedulerFixtureSource[],
  whitelist: string[]
): SchedulerFixtureSource[] {
  return fixtures.filter((fixture) => isLeagueAllowed(fixture.league, whitelist));
}

export function filterFixturesBySchedulerLeaguePolicy(
  fixtures: SchedulerFixtureSource[],
  options: {
    leagueIdWhitelist: number[];
    leagueWhitelist: string[];
  }
): SchedulerFixtureSource[] {
  if (options.leagueIdWhitelist.length > 0) {
    return filterFixturesByLeagueIdWhitelist(fixtures, options.leagueIdWhitelist);
  }

  return filterFixturesByLeagueWhitelist(fixtures, options.leagueWhitelist);
}

export function toProductionFixtures(fixtures: SchedulerFixtureSource[]): ProductionFixture[] {
  return fixtures.map((fixture) => ({
    matchDate: fixture.matchDate,
    league: fixture.league,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    rawOdds: fixture.rawOdds ?? buildSchedulerPlaceholderOdds(fixture.homeTeam, fixture.awayTeam),
  }));
}

export async function fetchFixturesByDate(
  matchDate: string,
  options: {
    fetchFromApi?: (date: string) => Promise<ApiFootballFixtureRecord[]>;
  } = {}
): Promise<SchedulerFixtureSource[]> {
  const fetchFromApi =
    options.fetchFromApi ??
    (async (date: string) => {
      const client = getApiFootballClient();
      if (!client.isConfigured()) {
        return [];
      }
      return client.getFixturesByDate(date);
    });

  const fixtures = await fetchFromApi(matchDate);
  return fixtures
    .filter((fixture) => fixture.status !== "CANC" && fixture.status !== "ABD")
    .map(mapApiFixtureToSource);
}

const FINISHED_OR_CANCELLED = new Set(["FT", "AET", "PEN", "CANC", "ABD", "AWD", "WO"]);

export function filterAnalyzableFixtures(
  fixtures: SchedulerFixtureSource[]
): SchedulerFixtureSource[] {
  return fixtures.filter((fixture) => !FINISHED_OR_CANCELLED.has(fixture.status));
}
