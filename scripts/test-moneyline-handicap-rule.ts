import { getSignedHandicap, parseAsianMarketLine } from "@/lib/parser/asianRules";
import { moneylineHandicapRule } from "../lib/analysis/rules/moneylineHandicapRule";
import { analyzeMatch } from "../lib/analysis/analyzeMatch";
import type { MarketSelection } from "../types/match";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function buildMoneyline(home: number, draw: number, away: number): MarketSelection[] {
  return [
    {
      marketType: "moneyline",
      marketFamily: "moneyline",
      title: "獨贏",
      period: "full",
      side: "home",
      rawLine: null,
      line: null,
      modifier: null,
      odds: home,
    },
    {
      marketType: "moneyline",
      marketFamily: "moneyline",
      title: "獨贏",
      period: "full",
      side: "draw",
      rawLine: null,
      line: null,
      modifier: null,
      odds: draw,
    },
    {
      marketType: "moneyline",
      marketFamily: "moneyline",
      title: "獨贏",
      period: "full",
      side: "away",
      rawLine: null,
      line: null,
      modifier: null,
      odds: away,
    },
  ];
}

function buildHomeHandicap(token: string, odds = 0.9): MarketSelection[] {
  const asianLine = parseAsianMarketLine(token);
  if (!asianLine) {
    throw new Error(`invalid token ${token}`);
  }

  const home: MarketSelection = {
    marketType: "handicap",
    marketFamily: "asianHandicap",
    title: "全場讓分",
    period: "full",
    side: "home",
    rawLine: asianLine.raw,
    line: asianLine.line,
    modifier: asianLine.modifier,
    odds,
    handicap: getSignedHandicap("home", "home", asianLine),
  };

  return [home];
}

function testConflictOnLevelZero(): void {
  const result = moneylineHandicapRule({
    moneyline: buildMoneyline(1.55, 3.2, 3.5),
    handicap: buildHomeHandicap("0"),
  });

  assertEqual(result.consistent, false, "conflict consistent");
  assertEqual(result.strength, "conflict", "conflict strength");
  assertEqual(
    result.reason,
    "Moneyline 顯示主隊明顯熱門，但亞洲讓分未反映相同強度。",
    "conflict reason"
  );
}

function testMediumOnHalfLine(): void {
  const result = moneylineHandicapRule({
    moneyline: buildMoneyline(1.95, 3.2, 3.5),
    handicap: buildHomeHandicap("0.5"),
  });

  assertEqual(result.consistent, true, "medium consistent");
  assertEqual(result.strength, "medium", "medium strength");
}

function testStrongOnOneOrMore(): void {
  const result = moneylineHandicapRule({
    moneyline: buildMoneyline(1.35, 3.2, 3.5),
    handicap: buildHomeHandicap("1"),
  });

  assertEqual(result.consistent, true, "strong consistent");
  assertEqual(result.strength, "strong", "strong strength");
}

function testIntegrationWithAnalyzeMatch(): void {
  const sample = `法國 vs 西班牙
獨贏
主 1.55
和 3.2
客 3.5
全場讓分
主0 0.9
客0 0.95`;

  const report = analyzeMatch(sample);
  const result = report.crossMarketValidation.moneylineHandicap;

  assertEqual(result.status, "FAIL", "integration fail");
}

testConflictOnLevelZero();
testMediumOnHalfLine();
testStrongOnOneOrMore();
testIntegrationWithAnalyzeMatch();
console.log("All moneylineHandicapRule tests passed.");
