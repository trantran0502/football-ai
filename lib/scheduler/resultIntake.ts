import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  buildResultUpdatesFromFixturesWithDiagnostics,
  type ResultUpdateBuildOutcome,
} from "@/lib/production/resultUpdatePipeline";
import type { ProductionResultUpdate } from "@/lib/production/productionTypes";
import type { SchedulerFixtureSource } from "@/lib/scheduler/schedulerTypes";
import { fetchFixturesByDate } from "@/lib/scheduler/fixtureIntake";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";

const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

export type ScoredFinishedFixture = SchedulerFixtureSource & {
  fullTimeHomeGoals: number;
  fullTimeAwayGoals: number;
  halfTimeHomeGoals: number | null;
  halfTimeAwayGoals: number | null;
};

export interface AttachScoresOutcome {
  fixtures: ScoredFinishedFixture[];
  missingFullTimeScoreCount: number;
  missingHalfTimeScoreCount: number;
}

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

export function buildResultUpdatesFromFinishedFixturesWithDiagnostics(
  pendingRecords: HistoricalMatchRecord[],
  finishedFixtures: ScoredFinishedFixture[]
): ResultUpdateBuildOutcome {
  return buildResultUpdatesFromFixturesWithDiagnostics(
    pendingRecords,
    finishedFixtures.map((fixture) => ({
      fixtureId: fixture.fixtureId,
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

export function buildResultUpdatesFromFinishedFixtures(
  pendingRecords: HistoricalMatchRecord[],
  finishedFixtures: ScoredFinishedFixture[]
): ProductionResultUpdate[] {
  return buildResultUpdatesFromFinishedFixturesWithDiagnostics(
    pendingRecords,
    finishedFixtures
  ).updates;
}

export function attachScoresToFinishedFixtures(
  fixtures: SchedulerFixtureSource[],
  apiFixtures: ApiFootballFixtureRecord[]
): AttachScoresOutcome {
  const output: ScoredFinishedFixture[] = [];
  let missingFullTimeScoreCount = 0;
  let missingHalfTimeScoreCount = 0;

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
      apiFixture.awayGoals === null
    ) {
      missingFullTimeScoreCount += 1;
      continue;
    }

    if (apiFixture.halfTimeHome === null || apiFixture.halfTimeAway === null) {
      missingHalfTimeScoreCount += 1;
    }

    output.push({
      ...fixture,
      fullTimeHomeGoals: apiFixture.homeGoals,
      fullTimeAwayGoals: apiFixture.awayGoals,
      halfTimeHomeGoals: apiFixture.halfTimeHome,
      halfTimeAwayGoals: apiFixture.halfTimeAway,
    });
  }

  return {
    fixtures: output,
    missingFullTimeScoreCount,
    missingHalfTimeScoreCount,
  };
}
