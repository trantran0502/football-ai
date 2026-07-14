import { analyzeMatch } from "../lib/analysis/analyzeMatch";

const sample = `法國 vs 西班牙
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

const report = analyzeMatch(sample);

if (report.match.homeTeam !== "法國") {
  throw new Error("expected home team 法國");
}
if (report.markets.length === 0) {
  throw new Error("expected parsed markets");
}
if (report.interpretations.length === 0) {
  throw new Error("expected interpretations");
}
if (report.crossMarketValidation.moneylineHandicap.status !== "FAIL") {
  throw new Error("expected moneyline × handicap FAIL for France vs Spain");
}
if (report.candidates.length !== 0) {
  throw new Error("expected empty candidates");
}

const moneyline = report.interpretations.find((item) => item.kind === "moneyline");
if (!moneyline || moneyline.kind !== "moneyline") {
  throw new Error("expected moneyline interpretation");
}
if (moneyline.expectedWinner.status !== "unknown") {
  throw new Error("expectedWinner should be unknown");
}

console.log("Match:", report.match.homeTeam, "vs", report.match.awayTeam);
console.log("Markets:", report.markets.length);
console.log("Interpretations:", report.interpretations.length);
console.log(
  "Cross market rule1:",
  report.crossMarketValidation.moneylineHandicap.status
);
console.log(
  "Cross market rule2:",
  report.crossMarketValidation.handicapTotalGoals.status
);
console.log("Candidates:", report.candidates.length);
console.log("All analyzeMatch tests passed.");
