import { parseOdds } from "../lib/parser/parser";
import { runAnalysisEngine } from "../lib/analysis/analysisEngine";

const sample = `法國 vs 西班牙
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

const match = parseOdds(sample);
const result = runAnalysisEngine(match.marketSelections);

console.log("features", result.features.length);
console.log(
  "interpretations",
  result.interpretations.map((item) => item.kind)
);
console.log("marketAnalysis", result.marketAnalysis);
console.log("combinedAnalysis", result.combinedAnalysis);
console.log(
  "candidates",
  result.candidates.map((item) => ({
    title: item.title,
    side: item.side,
    confidence: item.confidence,
    reasons: item.reason.length,
  }))
);
