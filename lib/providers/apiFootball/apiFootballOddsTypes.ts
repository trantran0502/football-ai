export interface ApiFootballOddsPaging {
  current: number;
  total: number;
}

export interface ApiFootballOddsBetValue {
  value: string;
  odd: string;
}

export interface ApiFootballOddsBet {
  id: number;
  name: string;
  values: ApiFootballOddsBetValue[];
}

export interface ApiFootballOddsBookmaker {
  id: number;
  name: string;
  bets: ApiFootballOddsBet[];
}

export interface ApiFootballOddsFixtureRef {
  id: number;
  timezone?: string | null;
  date: string;
  timestamp?: number | null;
}

export interface ApiFootballOddsLeagueRef {
  id: number;
  name: string;
  country?: string | null;
  logo?: string | null;
  flag?: string | null;
  season: number;
}

export interface ApiFootballOddsRecord {
  league: ApiFootballOddsLeagueRef;
  fixture: ApiFootballOddsFixtureRef;
  update: string;
  bookmakers: ApiFootballOddsBookmaker[];
}

export interface ApiFootballOddsResponse {
  items: ApiFootballOddsRecord[];
  paging: ApiFootballOddsPaging;
  pagesFetched: number;
}

export interface ApiFootballOddsPageEnvelope<T> {
  response: T;
  paging: ApiFootballOddsPaging | null;
}
