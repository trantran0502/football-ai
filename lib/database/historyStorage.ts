import type { BettingHistory, MarketType } from "@/database/bettingHistory";
import type { Recommendation } from "@/lib/analysis/recommendation";
import type { MatchData } from "@/types/match";

const STORAGE_KEY = "football-ai-betting-history";

const MARKET_TYPE_MAP: Record<string, MarketType> = {
  獨贏: "moneyline",
  亞洲讓分: "handicap",
  大小球: "overUnder",
  BTTS: "btts",
};

function mapMarketType(market: string): MarketType {
  return MARKET_TYPE_MAP[market] ?? "other";
}

function findMarketLine(match: MatchData, market: string): string {
  switch (market) {
    case "獨贏":
      return match.moneyline[0] ?? "";
    case "亞洲讓分":
      return match.handicap[0]
        ? `${match.handicap[0].raw}  主 ${match.handicap[0].home}  客 ${match.handicap[0].away}`
        : "";
    case "大小球":
      return match.overUnder[0]
        ? `${match.overUnder[0].raw}  大 ${match.overUnder[0].over}  小 ${match.overUnder[0].under}`
        : "";
    case "BTTS":
      return match.btts[0]
        ? `是 ${match.btts[0].yes}  否 ${match.btts[0].no}`
        : "";
    default:
      return "";
  }
}

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 從分析結果建立 BettingHistory 紀錄。
 */
export function buildBettingHistory(
  match: MatchData,
  recommendation: Recommendation
): BettingHistory {
  const now = new Date();

  return {
    id: generateId(),
    match: {
      date: now.toISOString().split("T")[0],
      league: match.league,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
    },
    odds: {
      marketType: mapMarketType(recommendation.market),
      line: findMarketLine(match, recommendation.market),
      waterLevel: Math.max(0, recommendation.odds - 1),
      odds: recommendation.odds,
    },
    analysis: {
      recommendation: {
        market: recommendation.market,
        selection: recommendation.selection,
        odds: recommendation.odds,
      },
      score: recommendation.score,
    },
    outcome: {
      isWin: false,
      actualResult: "",
      profitLoss: 0,
    },
    reasons: {
      winReason: "",
      lossReason: "",
    },
    createdAt: now.toISOString(),
  };
}

/**
 * 將分析紀錄保存到 localStorage。
 */
export function saveHistory(data: BettingHistory): void {
  if (typeof window === "undefined") {
    return;
  }

  const history = getHistory();
  history.unshift(data);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

/**
 * 取得所有歷史分析紀錄。
 */
export function getHistory(): BettingHistory[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as BettingHistory[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
