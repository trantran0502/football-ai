/**
 * Rules Engine 驗證函式（開發 / 測試用）。
 */
import {
  getHandicapSettlementAtBoundary,
  getOppositeAsianLine,
  getTotalSettlementAtBoundary,
  getSignedHandicap,
  parseAsianMarketLine,
} from "@/lib/parser/asianRules";

export interface ValidationResult {
  name: string;
  passed: boolean;
  detail?: string;
}

export function validateAsianLineParsing(): ValidationResult[] {
  const cases: Array<{ raw: string; line: number; modifier: string }> = [
    { raw: "0", line: 0, modifier: "plain" },
    { raw: "0平", line: 0, modifier: "plain" },
    { raw: "0-50", line: 0, modifier: "minus50" },
    { raw: "0+50", line: 0, modifier: "plus50" },
    { raw: "0.5", line: 0.5, modifier: "half" },
    { raw: "2-50", line: 2, modifier: "minus50" },
    { raw: "2.5", line: 2.5, modifier: "half" },
  ];

  return cases.map((item) => {
    const parsed = parseAsianMarketLine(item.raw);
    const passed =
      parsed?.line === item.line && parsed?.modifier === item.modifier;
    return {
      name: `parseAsianMarketLine(${item.raw})`,
      passed: !!passed,
      detail: passed
        ? undefined
        : `expected line=${item.line} modifier=${item.modifier}, got ${JSON.stringify(parsed)}`,
    };
  });
}

export function validateOppositeLines(): ValidationResult[] {
  const pairs: Array<[string, string]> = [
    ["0-50", "0+50"],
    ["1-50", "1+50"],
    ["2-50", "2+50"],
    ["0平", "0平"],
    ["2", "2"],
    ["0.5", "0.5"],
    ["1.5", "1.5"],
  ];

  return pairs.map(([left, right]) => {
    const opposite = getOppositeAsianLine(left);
    const passed = opposite === right;
    return {
      name: `getOppositeAsianLine(${left})`,
      passed,
      detail: passed ? undefined : `expected ${right}, got ${opposite}`,
    };
  });
}

export function validateTotalSettlementRules(): ValidationResult[] {
  const cases: Array<{
    side: "over" | "under";
    modifier: "plain" | "minus50" | "plus50" | "half";
    expected: string;
  }> = [
    { side: "over", modifier: "plain", expected: "push" },
    { side: "under", modifier: "plain", expected: "push" },
    { side: "over", modifier: "minus50", expected: "halfLose" },
    { side: "under", modifier: "plus50", expected: "halfWin" },
    { side: "over", modifier: "plus50", expected: "halfWin" },
    { side: "under", modifier: "minus50", expected: "halfLose" },
    { side: "over", modifier: "half", expected: "fullResult" },
  ];

  return cases.map((item) => {
    const result = getTotalSettlementAtBoundary(item.side, item.modifier);
    const passed = result === item.expected;
    return {
      name: `total ${item.side} ${item.modifier}`,
      passed,
      detail: passed ? undefined : `expected ${item.expected}, got ${result}`,
    };
  });
}

export function validateHandicapSettlementRules(): ValidationResult[] {
  const cases: Array<{
    side: "home" | "away";
    modifier: "plain" | "minus50" | "plus50" | "half";
    expected: string;
  }> = [
    { side: "home", modifier: "plain", expected: "push" },
    { side: "away", modifier: "plain", expected: "push" },
    { side: "home", modifier: "minus50", expected: "halfLose" },
    { side: "home", modifier: "plus50", expected: "halfWin" },
    { side: "away", modifier: "plus50", expected: "halfWin" },
    { side: "away", modifier: "minus50", expected: "halfLose" },
    { side: "home", modifier: "half", expected: "fullResult" },
  ];

  return cases.map((item) => {
    const result = getHandicapSettlementAtBoundary(item.side, item.modifier);
    const passed = result === item.expected;
    return {
      name: `handicap ${item.side} ${item.modifier}`,
      passed,
      detail: passed ? undefined : `expected ${item.expected}, got ${result}`,
    };
  });
}

export function validateSignedHandicap(): ValidationResult[] {
  const line = parseAsianMarketLine("0.5");
  if (!line) {
    return [{ name: "signed handicap", passed: false, detail: "parse failed" }];
  }

  const home = getSignedHandicap("home", "home", line);
  const away = getSignedHandicap("away", "home", line);
  return [
    {
      name: "主(0.5) home handicap",
      passed: home === -0.5,
      detail: home === -0.5 ? undefined : `expected -0.5, got ${home}`,
    },
    {
      name: "主(0.5) away handicap",
      passed: away === 0.5,
      detail: away === 0.5 ? undefined : `expected 0.5, got ${away}`,
    },
  ];
}

export function runAsianRulesValidation(): ValidationResult[] {
  return [
    ...validateAsianLineParsing(),
    ...validateOppositeLines(),
    ...validateTotalSettlementRules(),
    ...validateHandicapSettlementRules(),
    ...validateSignedHandicap(),
  ];
}

export function assertAsianRulesValidation(): void {
  const failures = runAsianRulesValidation().filter((item) => !item.passed);
  if (failures.length > 0) {
    throw new Error(
      `Asian rules validation failed:\n${failures
        .map((item) => `- ${item.name}: ${item.detail}`)
        .join("\n")}`
    );
  }
}
