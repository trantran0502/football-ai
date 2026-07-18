import type { OddsQuery } from "@/lib/providers/providerTypes";

export class InvalidApiFootballOddsQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidApiFootballOddsQueryError";
  }
}

export function validateApiFootballOddsQuery(query: OddsQuery): void {
  const hasFixture = query.fixtureId !== undefined;
  const hasDate = Boolean(query.date?.trim());
  const hasLeague = query.leagueId !== undefined;
  const hasSeason = query.season !== undefined;

  if (!hasFixture && !hasDate && !(hasLeague && hasSeason)) {
    throw new InvalidApiFootballOddsQueryError(
      "Odds query requires fixtureId, date, or leagueId+season."
    );
  }

  if (hasLeague !== hasSeason) {
    throw new InvalidApiFootballOddsQueryError(
      "Odds query requires both leagueId and season."
    );
  }
}

export function buildApiFootballOddsPath(query: OddsQuery, page = 1): string {
  validateApiFootballOddsQuery(query);

  const params = new URLSearchParams();
  if (query.fixtureId !== undefined) {
    params.set("fixture", String(query.fixtureId));
  }
  if (query.date?.trim()) {
    params.set("date", query.date.trim());
  }
  if (query.leagueId !== undefined) {
    params.set("league", String(query.leagueId));
  }
  if (query.season !== undefined) {
    params.set("season", String(query.season));
  }
  if (query.bookmakerId?.trim()) {
    params.set("bookmaker", query.bookmakerId.trim());
  }
  if (page > 1) {
    params.set("page", String(page));
  }

  return `/odds?${params.toString()}`;
}
