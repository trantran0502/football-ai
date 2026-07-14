import { buildMatchResult } from "@/lib/database/matchSchema";
import { getSignedHandicap, parseAsianMarketLine } from "@/lib/parser/asianRules";
import type { BacktestMatch, SettlementTestCase } from "@/lib/backtest/types";
import type { MatchResult } from "@/lib/database/matchSchema";
import type { MarketSelection } from "@/types/match";
import { parseOdds } from "@/lib/parser/parser";

function makeResult(
  fullTimeHomeGoals: number,
  fullTimeAwayGoals: number,
  halfTimeHomeGoals = 0,
  halfTimeAwayGoals = 0
): MatchResult {
  return buildMatchResult({
    fullTimeHomeGoals,
    fullTimeAwayGoals,
    halfTimeHomeGoals,
    halfTimeAwayGoals,
  });
}

function buildHandicapSelection(
  side: "home" | "away",
  token: string,
  odds: number,
  anchor: "home" | "away" = "home",
  title = "全場讓分",
  period: MarketSelection["period"] = "full"
): MarketSelection {
  const asianLine = parseAsianMarketLine(token);
  if (!asianLine) {
    throw new Error(`invalid handicap token: ${token}`);
  }

  return {
    marketType: "handicap",
    marketFamily: "asianHandicap",
    title,
    period,
    side,
    rawLine: asianLine.raw,
    line: asianLine.line,
    modifier: asianLine.modifier,
    odds,
    handicap: getSignedHandicap(side, anchor, asianLine),
  };
}

function buildOverUnderSelection(
  side: "over" | "under",
  token: string,
  odds: number,
  title = "全場大小",
  period: MarketSelection["period"] = "full"
): MarketSelection {
  const asianLine = parseAsianMarketLine(token);
  if (!asianLine) {
    throw new Error(`invalid over/under token: ${token}`);
  }

  return {
    marketType: "totalGoals",
    marketFamily: "asianOverUnder",
    title,
    period,
    side,
    rawLine: asianLine.raw,
    line: asianLine.line,
    modifier: asianLine.modifier,
    odds,
  };
}

function buildMoneylineSelection(
  side: "home" | "draw" | "away",
  odds: number
): MarketSelection {
  return {
    marketType: "moneyline",
    marketFamily: "moneyline",
    title: "獨贏",
    period: "full",
    side,
    rawLine: null,
    line: null,
    modifier: null,
    odds,
  };
}

function buildBttsSelection(side: "yes" | "no", odds: number): MarketSelection {
  return {
    marketType: "btts",
    marketFamily: "btts",
    title: "雙方進球",
    period: "full",
    side,
    rawLine: null,
    line: null,
    modifier: null,
    odds,
  };
}

/** 至少 24 筆亞洲盤結算測試案例 */
export const SETTLEMENT_TEST_CASES: SettlementTestCase[] = [
  {
    name: "讓分 主0 平手 → PUSH",
    selection: buildHandicapSelection("home", "0", 0.9),
    result: makeResult(1, 1),
    expected: "PUSH",
  },
  {
    name: "讓分 主0 主勝 → WIN",
    selection: buildHandicapSelection("home", "0", 0.9),
    result: makeResult(2, 1),
    expected: "WIN",
  },
  {
    name: "讓分 主0 客勝 → LOSE",
    selection: buildHandicapSelection("home", "0", 0.9),
    result: makeResult(0, 1),
    expected: "LOSE",
  },
  {
    name: "讓分 主0.5 主勝1球 → WIN",
    selection: buildHandicapSelection("home", "0.5", 0.85),
    result: makeResult(1, 0),
    expected: "WIN",
  },
  {
    name: "讓分 主0.5 和局 → LOSE",
    selection: buildHandicapSelection("home", "0.5", 0.85),
    result: makeResult(1, 1),
    expected: "LOSE",
  },
  {
    name: "讓分 主0-50 和局 → HALF_LOSE",
    selection: buildHandicapSelection("home", "0-50", 0.88),
    result: makeResult(1, 1),
    expected: "HALF_LOSE",
  },
  {
    name: "讓分 主0-50 主勝1球 → WIN",
    selection: buildHandicapSelection("home", "0-50", 0.88),
    result: makeResult(2, 1),
    expected: "WIN",
  },
  {
    name: "讓分 主0-50 客勝1球 → LOSE",
    selection: buildHandicapSelection("home", "0-50", 0.88),
    result: makeResult(0, 1),
    expected: "LOSE",
  },
  {
    name: "讓分 主0+50 和局 → HALF_WIN",
    selection: buildHandicapSelection("home", "0+50", 0.92),
    result: makeResult(0, 0),
    expected: "HALF_WIN",
  },
  {
    name: "讓分 主0+50 主勝1球 → WIN",
    selection: buildHandicapSelection("home", "0+50", 0.92),
    result: makeResult(1, 0),
    expected: "WIN",
  },
  {
    name: "讓分 主1 淨勝1球 → PUSH",
    selection: buildHandicapSelection("home", "1", 0.95),
    result: makeResult(2, 1),
    expected: "PUSH",
  },
  {
    name: "讓分 主1 淨勝2球 → WIN",
    selection: buildHandicapSelection("home", "1", 0.95),
    result: makeResult(3, 1),
    expected: "WIN",
  },
  {
    name: "讓分 主1-50 淨勝1球 → HALF_LOSE",
    selection: buildHandicapSelection("home", "1-50", 0.9),
    result: makeResult(2, 1),
    expected: "HALF_LOSE",
  },
  {
    name: "讓分 主1+50 淨勝1球 → HALF_WIN",
    selection: buildHandicapSelection("home", "1+50", 0.93),
    result: makeResult(2, 1),
    expected: "HALF_WIN",
  },
  {
    name: "讓分 主1.5 和局 → LOSE",
    selection: buildHandicapSelection("home", "1.5", 0.87),
    result: makeResult(1, 1),
    expected: "LOSE",
  },
  {
    name: "讓分 客0 客勝 → WIN",
    selection: buildHandicapSelection("away", "0", 0.95),
    result: makeResult(0, 1),
    expected: "WIN",
  },
  {
    name: "大小 2 剛好2球 → PUSH",
    selection: buildOverUnderSelection("over", "2", 0.9),
    result: makeResult(1, 1),
    expected: "PUSH",
  },
  {
    name: "大小 小2 剛好2球 → PUSH",
    selection: buildOverUnderSelection("under", "2", 0.9),
    result: makeResult(1, 1),
    expected: "PUSH",
  },
  {
    name: "大小 大2.5 共3球 → WIN",
    selection: buildOverUnderSelection("over", "2.5", 0.88),
    result: makeResult(2, 1),
    expected: "WIN",
  },
  {
    name: "大小 大2.5 共2球 → LOSE",
    selection: buildOverUnderSelection("over", "2.5", 0.88),
    result: makeResult(1, 1),
    expected: "LOSE",
  },
  {
    name: "大小 大2-50 剛好2球 → HALF_LOSE",
    selection: buildOverUnderSelection("over", "2-50", 0.86),
    result: makeResult(1, 1),
    expected: "HALF_LOSE",
  },
  {
    name: "大小 大2+50 剛好2球 → HALF_WIN",
    selection: buildOverUnderSelection("over", "2+50", 0.91),
    result: makeResult(2, 0),
    expected: "HALF_WIN",
  },
  {
    name: "大小 小2-50 剛好2球 → HALF_WIN",
    selection: buildOverUnderSelection("under", "2-50", 0.89),
    result: makeResult(0, 2),
    expected: "HALF_WIN",
  },
  {
    name: "大小 小2+50 剛好2球 → HALF_LOSE",
    selection: buildOverUnderSelection("under", "2+50", 0.9),
    result: makeResult(1, 1),
    expected: "HALF_LOSE",
  },
  {
    name: "獨贏 主勝 → WIN",
    selection: buildMoneylineSelection("home", 2.1),
    result: makeResult(2, 0),
    expected: "WIN",
  },
  {
    name: "獨贏 和局選項 → WIN",
    selection: buildMoneylineSelection("draw", 3.2),
    result: makeResult(1, 1),
    expected: "WIN",
  },
  {
    name: "BTTS 是 → WIN",
    selection: buildBttsSelection("yes", 1.75),
    result: makeResult(2, 1),
    expected: "WIN",
  },
  {
    name: "BTTS 否 → WIN",
    selection: buildBttsSelection("no", 2.0),
    result: makeResult(1, 0),
    expected: "WIN",
  },
  {
    name: "半場讓分 主0 半場和 → PUSH",
    selection: buildHandicapSelection("home", "0", 0.8, "home", "上半場讓分", "half"),
    result: makeResult(2, 1, 0, 0),
    expected: "PUSH",
  },
  {
    name: "半場大小 大1.5 半場2球 → WIN",
    selection: buildOverUnderSelection("over", "1.5", 0.85, "上半場大小", "half"),
    result: makeResult(3, 2, 2, 0),
    expected: "WIN",
  },
];

const MOCK_FIXTURE_A = `法國 vs 西班牙
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

const MOCK_FIXTURE_B = `德國 vs 意大利
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

const MOCK_FIXTURE_C = `巴西 vs 阿根廷
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

export function createMockBacktestMatches(): BacktestMatch[] {
  const parsedA = parseOdds(MOCK_FIXTURE_A);
  const parsedB = parseOdds(MOCK_FIXTURE_B);
  const parsedC = parseOdds(MOCK_FIXTURE_C);

  return [
    {
      id: "mock-match-1",
      date: "2026-07-10",
      league: "International",
      homeTeam: parsedA.homeTeam,
      awayTeam: parsedA.awayTeam,
      marketSelections: parsedA.marketSelections,
      result: makeResult(2, 1, 1, 0),
    },
    {
      id: "mock-match-2",
      date: "2026-07-11",
      league: "International",
      homeTeam: parsedB.homeTeam,
      awayTeam: parsedB.awayTeam,
      marketSelections: parsedB.marketSelections,
      result: makeResult(1, 1, 0, 1),
    },
    {
      id: "mock-match-3",
      date: "2026-07-12",
      league: "International",
      homeTeam: parsedC.homeTeam,
      awayTeam: parsedC.awayTeam,
      marketSelections: parsedC.marketSelections,
      result: makeResult(0, 2, 0, 1),
    },
  ];
}

export {
  buildBttsSelection,
  buildHandicapSelection,
  buildMoneylineSelection,
  buildOverUnderSelection,
  makeResult,
};
