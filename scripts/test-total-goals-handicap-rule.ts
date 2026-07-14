import { getSignedHandicap, parseAsianMarketLine } from "@/lib/parser/asianRules";
import { totalGoalsHandicapRule } from "../lib/analysis/rules/totalGoalsHandicapRule";
import type { MarketSelection } from "../types/match";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function buildHomeHandicap(token: string): MarketSelection[] {
  const asianLine = parseAsianMarketLine(token);
  if (!asianLine) {
    throw new Error(`invalid token ${token}`);
  }

  return [
    {
      marketType: "handicap",
      marketFamily: "asianHandicap",
      title: "全場讓分",
      period: "full",
      side: "home",
      rawLine: asianLine.raw,
      line: asianLine.line,
      modifier: asianLine.modifier,
      odds: 0.9,
      handicap: getSignedHandicap("home", "home", asianLine),
    },
  ];
}

function buildTotalGoals(line: number): MarketSelection[] {
  return [
    {
      marketType: "totalGoals",
      marketFamily: "asianOverUnder",
      title: "全場大小",
      period: "full",
      side: "over",
      rawLine: String(line),
      line,
      modifier: line % 1 === 0 ? "plain" : "half",
      odds: 0.88,
    },
    {
      marketType: "totalGoals",
      marketFamily: "asianOverUnder",
      title: "全場大小",
      period: "full",
      side: "under",
      rawLine: String(line),
      line,
      modifier: line % 1 === 0 ? "plain" : "half",
      odds: 0.98,
    },
  ];
}

function testDeepHandicapLowTotalConflict(): void {
  const result = totalGoalsHandicapRule({
    handicap: buildHomeHandicap("1.5"),
    totalGoals: buildTotalGoals(2),
  });

  assertEqual(result.consistent, false, "deep handicap conflict");
  assertEqual(result.strength, "conflict", "deep handicap strength");
  assertEqual(result.reason, "讓分深，但總進球預期偏低。", "deep handicap reason");
}

function testHandicapOneTotalThreeStrong(): void {
  const result = totalGoalsHandicapRule({
    handicap: buildHomeHandicap("1"),
    totalGoals: buildTotalGoals(3),
  });

  assertEqual(result.consistent, true, "handicap 1 strong");
  assertEqual(result.strength, "strong", "handicap 1 strength");
}

function testLevelZeroTotalTwoMedium(): void {
  const result = totalGoalsHandicapRule({
    handicap: buildHomeHandicap("0"),
    totalGoals: buildTotalGoals(2),
  });

  assertEqual(result.consistent, true, "level zero medium");
  assertEqual(result.strength, "medium", "level zero strength");
}

function testLevelZeroTotalFourConflict(): void {
  const result = totalGoalsHandicapRule({
    handicap: buildHomeHandicap("0"),
    totalGoals: buildTotalGoals(4),
  });

  assertEqual(result.consistent, false, "level zero high total conflict");
  assertEqual(result.strength, "conflict", "level zero high total strength");
}

testDeepHandicapLowTotalConflict();
testHandicapOneTotalThreeStrong();
testLevelZeroTotalTwoMedium();
testLevelZeroTotalFourConflict();
console.log("All totalGoalsHandicapRule tests passed.");
