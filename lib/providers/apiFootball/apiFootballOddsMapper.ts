import type { AsianModifier } from "@/lib/parser/asianRules";
import { normalizeMarketSelections } from "@/lib/parser/normalizeMarketSelections";
import { inferMarketPeriod, resolveMarketFamily } from "@/lib/parser/marketMeta";
import type {
  ApiFootballOddsBet,
  ApiFootballOddsBetValue,
} from "@/lib/providers/apiFootball/apiFootballOddsTypes";
import type { MarketSelection } from "@/types/match";

export const API_FOOTBALL_BET_MATCH_WINNER = 1;
export const API_FOOTBALL_BET_ASIAN_HANDICAP = 4;
export const API_FOOTBALL_BET_GOALS_OVER_UNDER = 5;
export const API_FOOTBALL_BET_BOTH_TEAMS_SCORE = 8;

export const SCHEDULER_ODDS_TITLE_MONEYLINE = "獨贏";
export const SCHEDULER_ODDS_TITLE_HANDICAP = "全場讓分";
export const SCHEDULER_ODDS_TITLE_TOTAL_GOALS = "全場大小";
export const SCHEDULER_ODDS_TITLE_BTTS = "雙方進球";

function parseDecimalLineToken(
  token: string
): { line: number; rawLine: string; modifier: AsianModifier | null } | null {
  const rawLine = token.trim();
  const parsed = Number(rawLine);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const fractional = Math.abs(parsed % 1);
  const modifier: AsianModifier | null =
    Math.abs(fractional - 0.5) < 1e-9 ? "half" : null;

  return {
    line: parsed,
    rawLine,
    modifier,
  };
}

function parseDecimalOdd(value: string | undefined): number | null {
  if (!value?.trim()) {
    return null;
  }
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeBetName(name: string): string {
  return name.trim().toLowerCase();
}

function isMatchWinnerBet(bet: ApiFootballOddsBet): boolean {
  return (
    bet.id === API_FOOTBALL_BET_MATCH_WINNER ||
    normalizeBetName(bet.name) === "match winner"
  );
}

function isAsianHandicapBet(bet: ApiFootballOddsBet): boolean {
  return (
    bet.id === API_FOOTBALL_BET_ASIAN_HANDICAP ||
    normalizeBetName(bet.name) === "asian handicap"
  );
}

function isGoalsOverUnderBet(bet: ApiFootballOddsBet): boolean {
  const normalized = normalizeBetName(bet.name);
  return (
    bet.id === API_FOOTBALL_BET_GOALS_OVER_UNDER ||
    normalized === "goals over/under" ||
    normalized === "goal line" ||
    normalized === "over/under"
  );
}

function isBothTeamsScoreBet(bet: ApiFootballOddsBet): boolean {
  const normalized = normalizeBetName(bet.name);
  return (
    bet.id === API_FOOTBALL_BET_BOTH_TEAMS_SCORE ||
    normalized === "both teams score" ||
    normalized === "both teams to score"
  );
}

function mapMatchWinnerValue(value: ApiFootballOddsBetValue): MarketSelection | null {
  const odds = parseDecimalOdd(value.odd);
  if (odds === null) {
    return null;
  }

  const label = value.value.trim().toLowerCase();
  let side: MarketSelection["side"] | null = null;
  if (label === "home") {
    side = "home";
  } else if (label === "draw") {
    side = "draw";
  } else if (label === "away") {
    side = "away";
  }
  if (!side) {
    return null;
  }

  return {
    marketType: "moneyline",
    marketFamily: resolveMarketFamily("moneyline", SCHEDULER_ODDS_TITLE_MONEYLINE),
    title: SCHEDULER_ODDS_TITLE_MONEYLINE,
    period: inferMarketPeriod(SCHEDULER_ODDS_TITLE_MONEYLINE),
    side,
    rawLine: null,
    line: null,
    modifier: null,
    odds,
  };
}

function parseHandicapSideAndLine(
  value: string
): { side: "home" | "away"; lineToken: string } | null {
  const match = value.trim().match(/^(Home|Away)\s+([+-]?\d+(?:\.\d+)?)$/i);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  return {
    side: match[1].toLowerCase() === "home" ? "home" : "away",
    lineToken: match[2],
  };
}

function mapAsianHandicapValue(value: ApiFootballOddsBetValue): MarketSelection | null {
  const odds = parseDecimalOdd(value.odd);
  if (odds === null) {
    return null;
  }

  const parsedSide = parseHandicapSideAndLine(value.value);
  if (!parsedSide) {
    return null;
  }

  const asianLine = parseDecimalLineToken(parsedSide.lineToken);
  if (!asianLine) {
    return null;
  }

  return {
    marketType: "handicap",
    marketFamily: resolveMarketFamily("handicap", SCHEDULER_ODDS_TITLE_HANDICAP),
    title: SCHEDULER_ODDS_TITLE_HANDICAP,
    period: inferMarketPeriod(SCHEDULER_ODDS_TITLE_HANDICAP),
    side: parsedSide.side,
    rawLine: asianLine.rawLine,
    line: asianLine.line,
    modifier: asianLine.modifier,
    handicap: asianLine.line,
    odds,
  };
}

function parseTotalSideAndLine(
  value: string
): { side: "over" | "under"; lineToken: string } | null {
  const match = value.trim().match(/^(Over|Under)\s+(\d+(?:\.\d+)?)$/i);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  return {
    side: match[1].toLowerCase() === "over" ? "over" : "under",
    lineToken: match[2],
  };
}

function mapGoalsOverUnderValue(value: ApiFootballOddsBetValue): MarketSelection | null {
  const odds = parseDecimalOdd(value.odd);
  if (odds === null) {
    return null;
  }

  const parsedSide = parseTotalSideAndLine(value.value);
  if (!parsedSide) {
    return null;
  }

  const totalLine = parseDecimalLineToken(parsedSide.lineToken);
  if (!totalLine) {
    return null;
  }

  return {
    marketType: "totalGoals",
    marketFamily: resolveMarketFamily("totalGoals", SCHEDULER_ODDS_TITLE_TOTAL_GOALS),
    title: SCHEDULER_ODDS_TITLE_TOTAL_GOALS,
    period: inferMarketPeriod(SCHEDULER_ODDS_TITLE_TOTAL_GOALS),
    side: parsedSide.side,
    rawLine: totalLine.rawLine,
    line: Math.abs(totalLine.line),
    modifier: totalLine.modifier,
    odds,
  };
}

function mapBothTeamsScoreValue(value: ApiFootballOddsBetValue): MarketSelection | null {
  const odds = parseDecimalOdd(value.odd);
  if (odds === null) {
    return null;
  }

  const label = value.value.trim().toLowerCase();
  let side: MarketSelection["side"] | null = null;
  if (label === "yes") {
    side = "yes";
  } else if (label === "no") {
    side = "no";
  }
  if (!side) {
    return null;
  }

  return {
    marketType: "btts",
    marketFamily: resolveMarketFamily("btts", SCHEDULER_ODDS_TITLE_BTTS),
    title: SCHEDULER_ODDS_TITLE_BTTS,
    period: inferMarketPeriod(SCHEDULER_ODDS_TITLE_BTTS),
    side,
    rawLine: null,
    line: null,
    modifier: null,
    odds,
  };
}

function mapBetValue(
  bet: ApiFootballOddsBet,
  value: ApiFootballOddsBetValue
): MarketSelection | null {
  if (isMatchWinnerBet(bet)) {
    return mapMatchWinnerValue(value);
  }
  if (isAsianHandicapBet(bet)) {
    return mapAsianHandicapValue(value);
  }
  if (isGoalsOverUnderBet(bet)) {
    return mapGoalsOverUnderValue(value);
  }
  if (isBothTeamsScoreBet(bet)) {
    return mapBothTeamsScoreValue(value);
  }
  return null;
}

export function mapApiFootballBetsToMarketSelections(
  bets: ApiFootballOddsBet[]
): MarketSelection[] {
  const selections: MarketSelection[] = [];

  for (const bet of bets) {
    for (const value of bet.values ?? []) {
      const mapped = mapBetValue(bet, value);
      if (mapped) {
        selections.push(mapped);
      }
    }
  }

  return normalizeMarketSelections(selections);
}

export function summarizeMappedMarketCoverage(
  selections: MarketSelection[]
): Record<string, number> {
  const coverage: Record<string, number> = {
    moneyline: 0,
    handicap: 0,
    totalGoals: 0,
    btts: 0,
  };

  for (const selection of selections) {
    if (selection.marketType in coverage) {
      coverage[selection.marketType] += 1;
    }
  }

  return coverage;
}
