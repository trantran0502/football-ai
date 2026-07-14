import { analyzeMatch } from "../lib/analysis/analyzeMatch";
import { explainAnalysis } from "../lib/explain";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const conflictSample = `法國 vs 西班牙
獨贏
主 1.55
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

const balancedSample = `德國 vs 意大利
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

const conflictReport = explainAnalysis(analyzeMatch(conflictSample));
assert(conflictReport.summary.length >= 2, "summary should have at least 2 points");
assert(conflictReport.marketReasons.length >= 4, "expected 4 market reasons");
assert(
  conflictReport.marketReasons.some((item) => item.label === "Moneyline"),
  "missing moneyline reason"
);
assert(
  conflictReport.ruleReasons.length === 3,
  "expected 3 rule reasons"
);
assert(
  conflictReport.ruleReasons[0].status === "FAIL",
  "rule #1 should be fail"
);
assert(conflictReport.conflicts.length >= 1, "expected at least one conflict");
assert(
  conflictReport.conflicts[0].message.includes("Moneyline"),
  "conflict message should mention Moneyline"
);
assert(
  conflictReport.confidenceReason.length > 0,
  "confidence reason required"
);

const balancedReport = explainAnalysis(analyzeMatch(balancedSample));
assert(
  balancedReport.conflicts.length === 0,
  "balanced sample should have no conflicts"
);
assert(
  balancedReport.ruleReasons.every((item) => item.status !== "FAIL"),
  "balanced sample rules should not fail"
);
assert(balancedReport.summary.length >= 2, "balanced summary required");

console.log("Conflict summary:", conflictReport.summary);
console.log("Rule reasons:", conflictReport.ruleReasons.map((r) => `${r.displayName}:${r.status}`));
console.log("All explain engine tests passed.");
