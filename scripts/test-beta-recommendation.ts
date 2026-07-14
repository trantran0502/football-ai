import { analyzeMatch } from "../lib/analysis/analyzeMatch";
import { generateBetaCandidates } from "../lib/beta/betaCandidateGenerator";
import { BETA_EMPTY_MESSAGE } from "../lib/beta/config";
import { computeBetaDashboardStats } from "../lib/beta/betaStatistics";
import { buildRollingEvaluationReport } from "../lib/beta/rollingEvaluation";
import { getSampleWarning } from "../lib/beta/sampleWarning";
import { validateCrossMarkets } from "../lib/analysis/crossMarketValidator";
import { parseOdds } from "../lib/parser/parser";
import { normalizeMarketSelections } from "../lib/parser/normalizeMarketSelections";

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

process.env.BETA_RECOMMENDATION_MODE = "true";

const report = analyzeMatch(sample);

if (!report.betaRecommendation.enabled) {
  throw new Error("expected beta recommendation enabled");
}

if (report.betaRecommendation.message !== BETA_EMPTY_MESSAGE) {
  throw new Error(
    `expected empty beta message for major conflict sample, got ${report.betaRecommendation.message}`
  );
}

if (report.betaRecommendation.candidates.length !== 0) {
  throw new Error("expected no beta candidates when Rule #1 FAIL");
}

const balancedSample = `曼城 vs 利物浦
獨贏
主 2.1
和 3.4
客 3.2
全場讓分
主-0.5 0.95
客+0.5 0.93
全場大小
大(2.5) 0.9
小 0.92
雙方進球
是 0.8
否 0.95`;

const balancedMatch = parseOdds(balancedSample);
const balancedMarkets = normalizeMarketSelections(balancedMatch.marketSelections);
const balancedValidation = validateCrossMarkets(balancedMarkets);
const balancedBeta = generateBetaCandidates(balancedMarkets, balancedValidation);

if (balancedBeta.candidates.length === 0) {
  console.log("Balanced sample produced no candidates (gate not met):", balancedBeta.message);
} else {
  const candidate = balancedBeta.candidates[0];
  if (candidate.supportingEvidence.length < 2) {
    throw new Error("candidate must have at least 2 supporting evidence");
  }
  if (candidate.supportingEvidence.length <= candidate.opposingEvidence.length) {
    throw new Error("supporting evidence must exceed opposing evidence");
  }
  if (candidate.rulesUsed.length < 1) {
    throw new Error("candidate must use at least one rule");
  }
  if (!["low", "medium", "high"].includes(candidate.confidenceLevel)) {
    throw new Error("invalid confidence level");
  }
  if (!candidate.modelVersion.startsWith("beta-")) {
    throw new Error("candidate must include modelVersion");
  }
}

const stats = computeBetaDashboardStats();
if (stats.sampleWarning !== getSampleWarning(stats.verifiedCount)) {
  throw new Error("sample warning mismatch");
}

const rolling = buildRollingEvaluationReport();
if (rolling !== null) {
  throw new Error("rolling report should be null with insufficient verified samples");
}

console.log("Beta recommendation tests passed.");
