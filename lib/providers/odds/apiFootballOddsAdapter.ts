import {
  ApiFootballClient,
  getApiFootballClient,
} from "@/lib/providers/apiFootball/apiFootballClient";
import { selectApiFootballBookmaker } from "@/lib/providers/apiFootball/apiFootballOddsBookmakerSelector";
import { mapApiFootballBetsToMarketSelections } from "@/lib/providers/apiFootball/apiFootballOddsMapper";
import { InvalidApiFootballOddsQueryError } from "@/lib/providers/apiFootball/apiFootballOddsQuery";
import type { ApiFootballOddsBookmaker, ApiFootballOddsRecord } from "@/lib/providers/apiFootball/apiFootballOddsTypes";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import type { OddsData, OddsProvider, OddsQuery } from "@/lib/providers/providerTypes";

export interface ApiFootballOddsAdapterClient {
  getOdds(query: OddsQuery): Promise<{ items: ApiFootballOddsRecord[] }>;
  getFixturesByDate(date: string): Promise<ApiFootballFixtureRecord[]>;
  getFixtureById(fixtureId: number): Promise<ApiFootballFixtureRecord | null>;
  getFixturesByIds(fixtureIds: number[]): Promise<ApiFootballFixtureRecord[]>;
}

interface FixtureTeamContext {
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
}

function buildMatchId(fixtureId: number): string {
  return `api-football:${fixtureId}`;
}

function extractMatchDate(record: ApiFootballOddsRecord): string {
  return String(record.fixture.date).split("T")[0] ?? "";
}

function mapFixtureToTeamContext(
  fixture: ApiFootballFixtureRecord
): FixtureTeamContext {
  return {
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
  };
}

async function resolveFixtureTeamsMap(
  client: ApiFootballOddsAdapterClient,
  query: OddsQuery,
  fixtureIds: number[]
): Promise<Map<number, FixtureTeamContext>> {
  const teamsByFixtureId = new Map<number, FixtureTeamContext>();

  if (query.date?.trim()) {
    const fixtures = await client.getFixturesByDate(query.date.trim());
    for (const fixture of fixtures) {
      teamsByFixtureId.set(fixture.fixtureId, mapFixtureToTeamContext(fixture));
    }
    return teamsByFixtureId;
  }

  if (query.fixtureId !== undefined) {
    const fixture = await client.getFixtureById(query.fixtureId);
    if (fixture) {
      teamsByFixtureId.set(fixture.fixtureId, mapFixtureToTeamContext(fixture));
    }
    return teamsByFixtureId;
  }

  const uniqueFixtureIds = [...new Set(fixtureIds)];
  const fixtures = await client.getFixturesByIds(uniqueFixtureIds);
  for (const fixture of fixtures) {
    teamsByFixtureId.set(fixture.fixtureId, mapFixtureToTeamContext(fixture));
  }

  return teamsByFixtureId;
}

export function mapApiFootballOddsRecordToOddsData(input: {
  record: ApiFootballOddsRecord;
  teams: FixtureTeamContext;
  bookmaker: ApiFootballOddsBookmaker;
  capturedAt: string;
}): OddsData | null {
  const marketSelections = mapApiFootballBetsToMarketSelections(input.bookmaker.bets);

  if (marketSelections.length === 0) {
    return null;
  }

  return {
    matchId: buildMatchId(input.record.fixture.id),
    fixtureId: input.record.fixture.id,
    date: extractMatchDate(input.record),
    league: input.record.league.name,
    homeTeam: input.teams.homeTeam,
    awayTeam: input.teams.awayTeam,
    marketSelections,
    capturedAt: input.capturedAt,
    source: "api-football",
    bookmakerId: String(input.bookmaker.id),
  };
}

/**
 * API-Football 賠率 Adapter。
 * 輸出 OddsData[]，不輸出 rawOdds，不做 Scheduler fallback。
 */
export class ApiFootballOddsAdapter implements OddsProvider {
  private readonly client: ApiFootballOddsAdapterClient;

  constructor(client: ApiFootballOddsAdapterClient = getApiFootballClient()) {
    this.client = client;
  }

  async fetchOdds(query: OddsQuery): Promise<OddsData[]> {
    let response: { items: ApiFootballOddsRecord[] };
    try {
      response = await this.client.getOdds(query);
    } catch (error) {
      if (error instanceof InvalidApiFootballOddsQueryError) {
        return [];
      }
      throw error;
    }

    const teamsByFixtureId = await resolveFixtureTeamsMap(
      this.client,
      query,
      response.items.map((item) => item.fixture.id)
    );

    const results: OddsData[] = [];

    for (const record of response.items) {
      const bookmaker = selectApiFootballBookmaker(record.bookmakers, {
        preferredBookmakerId: query.bookmakerId,
      });
      if (!bookmaker) {
        continue;
      }

      const teams = teamsByFixtureId.get(record.fixture.id);
      if (!teams) {
        continue;
      }

      const oddsData = mapApiFootballOddsRecordToOddsData({
        record,
        teams,
        bookmaker,
        capturedAt: record.update || new Date().toISOString(),
      });

      if (oddsData) {
        results.push(oddsData);
      }
    }

    return results;
  }
}

export type { ApiFootballClient };
