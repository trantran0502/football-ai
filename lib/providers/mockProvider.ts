import { buildMatchResult } from "@/lib/database/matchSchema";
import type {
  FootballDataProvider,
  HistoricalMatchesQuery,
  OddsData,
  OddsQuery,
  ProviderHistoricalMatch,
  ProviderId,
  ProviderMatchId,
  ProviderOptions,
  ResultData,
  ResultQuery,
  UpcomingMatch,
  UpcomingMatchesQuery,
} from "@/lib/providers/providerTypes";
import { parseOdds } from "@/lib/parser/parser";
import type { MarketSelection } from "@/types/match";

interface MockMatchRecord {
  id: ProviderMatchId;
  date: string;
  kickoffTime?: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  status: "scheduled" | "finished";
  oddsRaw: string;
  result?: ReturnType<typeof buildMatchResult>;
}

const MOCK_FIXTURE_FRANCE_SPAIN = `法國 vs 西班牙
獨贏
主 2.1
和 3.2
客 3.5
全場讓分
主0 0.9
客0 0.95
全場大小
大(2.5) 0.88
小 0.98
雙方進球
是 0.75
否 1.05`;

const MOCK_FIXTURE_GERMANY_ITALY = `德國 vs 意大利
獨贏
主 1.95
和 3.4
客 4.2
全場讓分
主0-50 0.82
客0+50 1.02
全場大小
大(2) 0.9
小 0.9
雙方進球
是 1.8
否 2.0`;

const MOCK_FIXTURE_BRAZIL_ARGENTINA = `巴西 vs 阿根廷
獨贏
主 2.4
和 3.1
客 2.9
全場讓分
主0.5 0.88
客0.5 0.96
全場大小
大(2.5) 0.92
小 0.92
雙方進球
是 1.7
否 2.1`;

const MOCK_FIXTURE_ENGLAND_PORTUGAL = `英格蘭 vs 葡萄牙
獨贏
主 2.05
和 3.3
客 3.6
全場讓分
主0+50 0.84
客0-50 1.0
全場大小
大(2.5) 0.9
小 0.9
雙方進球
是 1.65
否 2.2`;

const MOCK_FIXTURE_NETHERLANDS_BELGIUM = `荷蘭 vs 比利時
獨贏
主 2.3
和 3.15
客 3.0
全場讓分
主0 0.86
客0 0.98
全場大小
大(2.5) 0.87
小 0.95
雙方進球
是 1.72
否 2.05`;

const MOCK_RECORDS: MockMatchRecord[] = [
  {
    id: "mock-upcoming-1",
    date: "2026-07-20",
    kickoffTime: "2026-07-20T19:00:00Z",
    league: "International Friendly",
    homeTeam: "英格蘭",
    awayTeam: "葡萄牙",
    status: "scheduled",
    oddsRaw: MOCK_FIXTURE_ENGLAND_PORTUGAL,
  },
  {
    id: "mock-upcoming-2",
    date: "2026-07-21",
    kickoffTime: "2026-07-21T20:00:00Z",
    league: "International Friendly",
    homeTeam: "荷蘭",
    awayTeam: "比利時",
    status: "scheduled",
    oddsRaw: MOCK_FIXTURE_NETHERLANDS_BELGIUM,
  },
  {
    id: "mock-historical-1",
    date: "2026-07-10",
    league: "International",
    homeTeam: "法國",
    awayTeam: "西班牙",
    status: "finished",
    oddsRaw: MOCK_FIXTURE_FRANCE_SPAIN,
    result: buildMatchResult({
      fullTimeHomeGoals: 2,
      fullTimeAwayGoals: 1,
      halfTimeHomeGoals: 1,
      halfTimeAwayGoals: 0,
    }),
  },
  {
    id: "mock-historical-2",
    date: "2026-07-11",
    league: "International",
    homeTeam: "德國",
    awayTeam: "意大利",
    status: "finished",
    oddsRaw: MOCK_FIXTURE_GERMANY_ITALY,
    result: buildMatchResult({
      fullTimeHomeGoals: 1,
      fullTimeAwayGoals: 1,
      halfTimeHomeGoals: 0,
      halfTimeAwayGoals: 1,
    }),
  },
  {
    id: "mock-historical-3",
    date: "2026-07-12",
    league: "International",
    homeTeam: "巴西",
    awayTeam: "阿根廷",
    status: "finished",
    oddsRaw: MOCK_FIXTURE_BRAZIL_ARGENTINA,
    result: buildMatchResult({
      fullTimeHomeGoals: 0,
      fullTimeAwayGoals: 2,
      halfTimeHomeGoals: 0,
      halfTimeAwayGoals: 1,
    }),
  },
];

function parseMarketSelections(oddsRaw: string): MarketSelection[] {
  return parseOdds(oddsRaw).marketSelections;
}

function matchesLeague(value: string, league?: string): boolean {
  if (!league) {
    return true;
  }
  return value.toLowerCase().includes(league.toLowerCase());
}

function matchesDateRange(
  value: string,
  fromDate?: string,
  toDate?: string
): boolean {
  if (fromDate && value < fromDate) {
    return false;
  }
  if (toDate && value > toDate) {
    return false;
  }
  return true;
}

function applyLimit<T>(items: T[], limit?: number): T[] {
  if (!limit || limit <= 0) {
    return items;
  }
  return items.slice(0, limit);
}

function findRecord(matchId: ProviderMatchId): MockMatchRecord | undefined {
  return MOCK_RECORDS.find((record) => record.id === matchId);
}

/**
 * Mock 足球資料 Provider。
 * 回傳固定假資料，不連接任何外部 API 或網站。
 */
export class MockFootballProvider implements FootballDataProvider {
  readonly id: ProviderId = "mock";
  readonly name = "Mock Football Provider";

  constructor(_options?: ProviderOptions) {}

  async getUpcomingMatches(
    query: UpcomingMatchesQuery = {}
  ): Promise<UpcomingMatch[]> {
    const records = MOCK_RECORDS.filter((record) => record.status === "scheduled")
      .filter((record) => matchesLeague(record.league, query.league))
      .filter((record) =>
        matchesDateRange(record.date, query.fromDate, query.toDate)
      )
      .map((record) => ({
        id: record.id,
        date: record.date,
        kickoffTime: record.kickoffTime,
        league: record.league,
        homeTeam: record.homeTeam,
        awayTeam: record.awayTeam,
        status: "scheduled" as const,
        source: this.id,
      }));

    return applyLimit(records, query.limit);
  }

  async getOdds(query: OddsQuery): Promise<OddsData | null> {
    const record = findRecord(query.matchId);
    if (!record) {
      return null;
    }

    return {
      matchId: record.id,
      date: record.date,
      league: record.league,
      homeTeam: record.homeTeam,
      awayTeam: record.awayTeam,
      marketSelections: parseMarketSelections(record.oddsRaw),
      capturedAt: new Date().toISOString(),
      source: this.id,
    };
  }

  async getResult(query: ResultQuery): Promise<ResultData | null> {
    const record = findRecord(query.matchId);
    if (!record || !record.result) {
      return null;
    }

    return {
      matchId: record.id,
      date: record.date,
      league: record.league,
      homeTeam: record.homeTeam,
      awayTeam: record.awayTeam,
      result: record.result,
      status: "finished",
      source: this.id,
    };
  }

  async getHistoricalMatches(
    query: HistoricalMatchesQuery = {}
  ): Promise<ProviderHistoricalMatch[]> {
    const records = MOCK_RECORDS.filter(
      (record) => record.status === "finished" && record.result
    )
      .filter((record) => matchesLeague(record.league, query.league))
      .filter((record) =>
        matchesDateRange(record.date, query.fromDate, query.toDate)
      )
      .filter((record) =>
        query.homeTeam
          ? record.homeTeam.includes(query.homeTeam)
          : true
      )
      .filter((record) =>
        query.awayTeam
          ? record.awayTeam.includes(query.awayTeam)
          : true
      )
      .map((record) => ({
        id: record.id,
        date: record.date,
        league: record.league,
        homeTeam: record.homeTeam,
        awayTeam: record.awayTeam,
        marketSelections: parseMarketSelections(record.oddsRaw),
        result: record.result!,
        source: this.id,
      }));

    return applyLimit(records, query.limit);
  }
}
