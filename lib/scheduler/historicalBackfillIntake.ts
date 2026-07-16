import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import {
  COMPLETED_FIXTURE_STATUSES,
  EXCLUDED_FIXTURE_STATUSES,
  isFriendlyCompetition,
} from "@/lib/providers/h2h/h2hNormalizer";

export function isEligibleHistoricalBackfillFixture(
  fixture: ApiFootballFixtureRecord
): boolean {
  if (isFriendlyCompetition(fixture.league)) {
    return false;
  }

  if (!fixture.status || EXCLUDED_FIXTURE_STATUSES.has(fixture.status)) {
    return false;
  }

  if (!COMPLETED_FIXTURE_STATUSES.has(fixture.status)) {
    return false;
  }

  if (
    fixture.homeGoals === null ||
    fixture.awayGoals === null ||
    fixture.halfTimeHome === null ||
    fixture.halfTimeAway === null
  ) {
    return false;
  }

  return true;
}

export function filterEligibleHistoricalBackfillFixtures(
  fixtures: ApiFootballFixtureRecord[]
): ApiFootballFixtureRecord[] {
  return fixtures.filter(isEligibleHistoricalBackfillFixture);
}
