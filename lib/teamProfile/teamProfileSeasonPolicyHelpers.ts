import type { ApiFootballPlanSeasonRange } from "@/lib/providers/apiFootball/apiFootballPlanErrors";

export function buildSeasonQueryOrder(input: {
  requestedSeason: number | null;
  planRange: ApiFootballPlanSeasonRange | null;
}): number[] {
  const order: number[] = [];
  const add = (season: number) => {
    if (!order.includes(season)) {
      order.push(season);
    }
  };

  if (input.requestedSeason !== null) {
    add(input.requestedSeason);
  }

  if (input.planRange) {
    add(input.planRange.maxSeason);
    return order;
  }

  if (input.requestedSeason !== null) {
    add(input.requestedSeason - 1);
  }

  return order;
}

export function computeStalenessYears(
  requestedSeason: number | null,
  dataSeason: number | null
): number | null {
  if (requestedSeason === null || dataSeason === null) {
    return null;
  }
  const delta = requestedSeason - dataSeason;
  return delta > 0 ? delta : 0;
}

export function buildHistoricalBaselineWarning(
  dataSeason: number,
  requestedSeason: number
): string {
  return `Using ${dataSeason} historical baseline because free plan cannot access ${requestedSeason}.`;
}

export function extractMatchSeasonYear(date: string): number {
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) ? year : 0;
}

export function filterVerifiedMatchesNewerThanSeason<T extends { date: string }>(
  matches: T[],
  dataSeason: number | null
): T[] {
  if (dataSeason === null) {
    return matches;
  }
  return matches.filter((match) => extractMatchSeasonYear(match.date) > dataSeason);
}
