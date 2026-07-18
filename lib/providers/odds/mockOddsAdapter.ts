import { MockFootballProvider } from "@/lib/providers/mockProvider";
import type { OddsData, OddsProvider, OddsQuery } from "@/lib/providers/providerTypes";

interface MockOddsIndexEntry {
  matchId: string;
  fixtureId: number;
  leagueId: number;
  season: number;
  date: string;
  bookmakerId: string;
}

const MOCK_ODDS_INDEX: MockOddsIndexEntry[] = [
  {
    matchId: "mock-upcoming-1",
    fixtureId: 9001,
    leagueId: 999,
    season: 2026,
    date: "2026-07-20",
    bookmakerId: "mock-default",
  },
  {
    matchId: "mock-upcoming-2",
    fixtureId: 9002,
    leagueId: 999,
    season: 2026,
    date: "2026-07-21",
    bookmakerId: "mock-default",
  },
  {
    matchId: "mock-historical-1",
    fixtureId: 8001,
    leagueId: 998,
    season: 2026,
    date: "2026-07-10",
    bookmakerId: "mock-default",
  },
  {
    matchId: "mock-historical-2",
    fixtureId: 8002,
    leagueId: 998,
    season: 2026,
    date: "2026-07-11",
    bookmakerId: "mock-default",
  },
  {
    matchId: "mock-historical-3",
    fixtureId: 8003,
    leagueId: 998,
    season: 2026,
    date: "2026-07-12",
    bookmakerId: "mock-default",
  },
];

function filterMockOddsIndex(query: OddsQuery): MockOddsIndexEntry[] {
  return MOCK_ODDS_INDEX.filter((entry) => {
    if (query.matchId && entry.matchId !== query.matchId) {
      return false;
    }
    if (query.fixtureId !== undefined && entry.fixtureId !== query.fixtureId) {
      return false;
    }
    if (query.date && entry.date !== query.date) {
      return false;
    }
    if (query.leagueId !== undefined && entry.leagueId !== query.leagueId) {
      return false;
    }
    if (query.season !== undefined && entry.season !== query.season) {
      return false;
    }
    if (query.bookmakerId && entry.bookmakerId !== query.bookmakerId) {
      return false;
    }
    return true;
  });
}

/**
 * Mock 賠率 Adapter。
 * 輸出 OddsData[]，不直接輸出 rawOdds。
 */
export class MockOddsAdapter implements OddsProvider {
  private readonly footballProvider = new MockFootballProvider();

  async fetchOdds(query: OddsQuery): Promise<OddsData[]> {
    const entries = filterMockOddsIndex(query);
    const results: OddsData[] = [];

    for (const entry of entries) {
      const odds = await this.footballProvider.getOdds({ matchId: entry.matchId });
      if (!odds) {
        continue;
      }

      results.push({
        ...odds,
        fixtureId: entry.fixtureId,
        bookmakerId: entry.bookmakerId,
      });
    }

    return results;
  }
}

export function listMockOddsIndexForTests(): readonly MockOddsIndexEntry[] {
  return MOCK_ODDS_INDEX;
}
