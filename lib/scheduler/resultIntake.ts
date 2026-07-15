import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { buildResultUpdatesFromFixtures } from "@/lib/production/resultUpdatePipeline";
import type { ProductionResultUpdate } from "@/lib/production/productionTypes";
import type { SchedulerFixtureSource } from "@/lib/scheduler/schedulerTypes";
import { fetchFixturesByDate } from "@/lib/scheduler/fixtureIntake";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";

const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

export function isFinishedFixture(fixture: SchedulerFixtureSource | ApiFootballFixtureRecord): boolean {
  const status = "status" in fixture ? fixture.status : "";
  return FINISHED_STATUSES.has(status);
}

export async function fetchFinishedFixturesByDate(
  matchDate: string,
  options: {
    fetchFromApi?: (date: string) => Promise<ApiFootballFixtureRecord[]>;
  } = {}
): Promise<SchedulerFixtureSource[]> {
  const intake = await fetchFixturesByDate(matchDate, options);
  return intake.fixtures.filter((fixture) => FINISHED_STATUSES.has(fixture.status));
}

export function buildResultUpdatesFromFinishedFixtures(
  pendingRecords: HistoricalMatchRecord[],
  finishedFixtures: Array<
    SchedulerFixtureSource & {
      fullTimeHomeGoals: number;
      fullTimeAwayGoals: number;
      halfTimeHomeGoals: number;
      halfTimeAwayGoals: number;
    }
  >
): ProductionResultUpdate[] {
  return buildResultUpdatesFromFixtures(
    pendingRecords,
    finishedFixtures.map((fixture) => ({
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      matchDate: fixture.matchDate,
      fullTimeHomeGoals: fixture.fullTimeHomeGoals,
      fullTimeAwayGoals: fixture.fullTimeAwayGoals,
      halfTimeHomeGoals: fixture.halfTimeHomeGoals,
      halfTimeAwayGoals: fixture.halfTimeAwayGoals,
    }))
  );
}

export function attachScoresToFinishedFixtures(
  fixtures: SchedulerFixtureSource[],
  apiFixtures: ApiFootballFixtureRecord[]
): Array<
  SchedulerFixtureSource & {
    fullTimeHomeGoals: number;
    fullTimeAwayGoals: number;
    halfTimeHomeGoals: number;
    halfTimeAwayGoals: number;
  }
> {
  const output: Array<
    SchedulerFixtureSource & {
      fullTimeHomeGoals: number;
      fullTimeAwayGoals: number;
      halfTimeHomeGoals: number;
      halfTimeAwayGoals: number;
    }
  > = [];

  for (const fixture of fixtures) {
    const apiFixture =
      apiFixtures.find((item) => item.fixtureId === fixture.fixtureId) ??
      apiFixtures.find(
        (item) =>
          item.date === fixture.matchDate &&
          item.homeTeam === fixture.homeTeam &&
          item.awayTeam === fixture.awayTeam
      );

    if (
      !apiFixture ||
      apiFixture.homeGoals === null ||
      apiFixture.awayGoals === null ||
      apiFixture.halfTimeHome === null ||
      apiFixture.halfTimeAway === null
    ) {
      continue;
    }

    output.push({
      ...fixture,
      fullTimeHomeGoals: apiFixture.homeGoals,
      fullTimeAwayGoals: apiFixture.awayGoals,
      halfTimeHomeGoals: apiFixture.halfTimeHome,
      halfTimeAwayGoals: apiFixture.halfTimeAway,
    });
  }

  return output;
}
