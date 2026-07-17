import { buildEvidenceLearningInsights } from "@/lib/evidence/evidenceLearningIntegration";
import { buildEvidenceWeightOptimizerReport } from "@/lib/evidence/evidenceWeightOptimizer";
import type { EvidencePerformanceStats } from "@/lib/evidence/evidenceValidation";
import {
  buildAiLearningReport,
  buildImprovementCandidates,
  computeAiLearningConfidence,
} from "@/lib/learning/aiLearningEngine";
import type { LearningEngineRankings, RulePerformanceStats } from "@/lib/learning/learningTypes";
import type { ValidationMetricBucket } from "@/lib/validation/validationTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function buildRule(overrides: Partial<RulePerformanceStats> & Pick<RulePerformanceStats, "rule">): RulePerformanceStats {
  return {
    usageCount: 50,
    hitRate: 0.62,
    roi: 0.12,
    ...overrides,
  };
}

function buildEvidenceStats(
  overrides: Partial<EvidencePerformanceStats> & Pick<EvidencePerformanceStats, "category">
): EvidencePerformanceStats {
  return {
    label: overrides.category,
    usageCount: 120,
    hitCount: 72,
    hitRate: 0.6,
    averageImpactScore: 8,
    averageConfidence: 0.72,
    roi: 0.15,
    totalProfit: 18,
    totalStake: 120,
    ...overrides,
  };
}

function buildMarketBucket(overrides: Partial<ValidationMetricBucket>): ValidationMetricBucket {
  return {
    sampleSize: 40,
    wins: 24,
    losses: 16,
    pushes: 0,
    halfWins: 0,
    halfLoses: 0,
    hitRate: 0.6,
    roi: 0.1,
    averageOdds: 1.95,
    averageConfidence: 2,
    totalProfit: 4,
    ...overrides,
  };
}

function buildRankings(): LearningEngineRankings {
  return {
    topFeatures: [],
    worstFeatures: [],
    topRules: [],
    worstRules: [],
    leagueRoiRanking: [
      { key: "Premier League", usageCount: 30, hitRate: 0.65, roi: 0.18 },
      { key: "Serie A", usageCount: 20, hitRate: 0.35, roi: -0.12 },
    ],
    marketRoiRanking: [
      { key: "1X2", usageCount: 35, hitRate: 0.58, roi: 0.08 },
      { key: "O/U", usageCount: 25, hitRate: 0.42, roi: -0.06 },
    ],
    evidenceByAccuracy: [],
    evidenceByConfidence: [],
    evidenceByUsage: [],
    evidenceOverallRanking: [],
  };
}

function testLearningReport(): void {
  const evidencePerformance = {
    generatedAt: "2026-07-17T00:00:00.000Z",
    sampleSize: 80,
    providers: [
      buildEvidenceStats({ category: "h2h", hitRate: 0.7, roi: 0.2 }),
      buildEvidenceStats({ category: "xg", hitRate: 0.35, roi: -0.15, usageCount: 150 }),
    ],
    byAccuracy: [],
    byConfidence: [],
    byUsage: [],
  };

  const report = buildAiLearningReport({
    recommendationHistory: [],
    validationResults: [],
    evidenceLearning: buildEvidenceLearningInsights(evidencePerformance),
    weightOptimizerReport: buildEvidenceWeightOptimizerReport(evidencePerformance),
    rules: [
      buildRule({ rule: "rule:strong", hitRate: 0.68, roi: 0.15 }),
      buildRule({ rule: "rule:weak", hitRate: 0.32, roi: -0.18 }),
    ],
    byLeague: {
      "Premier League": buildMarketBucket({ hitRate: 0.65, roi: 0.18 }),
      "Serie A": buildMarketBucket({ hitRate: 0.35, roi: -0.12 }),
    },
    byMarket: {
      "1X2": buildMarketBucket({ hitRate: 0.58, roi: 0.08 }),
      "O/U": buildMarketBucket({ hitRate: 0.38, roi: -0.1 }),
    },
    rankings: buildRankings(),
    sampleSize: {
      validationEntries: 80,
      verifiedMatches: 40,
      recommendationHistory: 40,
      featureHistory: 40,
      decisionHistory: 40,
    },
  });

  assert(report.optimizerMode === "analysis", "report should stay analysis-only");
  assert(report.weightsApplied === false, "weights should not be applied");
  assert(report.sampleSize === 40, "sample size should come from verified matches");
  assert(report.suggestions.ruleSuggestions.length >= 2, "rule suggestions should be generated");
  assert(report.suggestions.marketSuggestions.length >= 2, "market suggestions should be generated");
  assert(report.suggestions.leagueSuggestions.length >= 2, "league suggestions should be generated");
  assert(report.suggestions.evidenceSuggestions.length > 0, "evidence suggestions should be generated");
}

function testCandidateGeneration(): void {
  const suggestions = {
    ruleSuggestions: [
      {
        target: "rule:weak",
        targetType: "rule" as const,
        action: "disable" as const,
        reason: "weak rule",
        confidence: 0.8,
        sampleSize: 60,
        currentHitRate: 0.3,
        currentRoi: -0.2,
      },
    ],
    marketSuggestions: [],
    leagueSuggestions: [],
    evidenceSuggestions: [],
  };

  const candidates = buildImprovementCandidates(suggestions);
  assert(candidates.length === 1, "should create one improvement candidate");
  assert(candidates[0]!.target === "rule:weak", "candidate target should match");
  assert(candidates[0]!.expectedImprovement > 0, "candidate should estimate improvement");
}

function testConfidenceCalculation(): void {
  const low = computeAiLearningConfidence({ sampleSize: 3, hitRate: 0.5 });
  const high = computeAiLearningConfidence({ sampleSize: 120, hitRate: 0.75 });

  assert(low >= 0 && low <= 1, "confidence should stay normalized");
  assert(high > low, "stronger sample and hit rate should increase confidence");
  assert(high >= 0.5, "large strong sample should produce meaningful confidence");
}

function testDashboardStatistics(): void {
  const evidencePerformance = {
    generatedAt: "2026-07-17T00:00:00.000Z",
    sampleSize: 100,
    providers: [buildEvidenceStats({ category: "h2h" })],
    byAccuracy: [],
    byConfidence: [],
    byUsage: [],
  };

  const report = buildAiLearningReport({
    recommendationHistory: [],
    validationResults: [],
    evidenceLearning: buildEvidenceLearningInsights(evidencePerformance),
    weightOptimizerReport: buildEvidenceWeightOptimizerReport(evidencePerformance),
    rules: [
      buildRule({ rule: "rule:best", hitRate: 0.72, roi: 0.2 }),
      buildRule({ rule: "rule:worst", hitRate: 0.28, roi: -0.22 }),
    ],
    byLeague: {
      "Premier League": buildMarketBucket({ hitRate: 0.65, roi: 0.18 }),
    },
    byMarket: {
      "1X2": buildMarketBucket({ hitRate: 0.58, roi: 0.08 }),
    },
    rankings: buildRankings(),
    sampleSize: {
      validationEntries: 100,
      verifiedMatches: 50,
      recommendationHistory: 50,
      featureHistory: 50,
      decisionHistory: 50,
    },
  });

  assert(report.dashboard.bestRules[0]!.rule === "rule:best", "best rules should be ranked");
  assert(report.dashboard.worstRules[0]!.rule === "rule:worst", "worst rules should be ranked");
  assert(report.dashboard.leagueRanking.length > 0, "league ranking should be exposed");
  assert(report.dashboard.marketRanking.length > 0, "market ranking should be exposed");
  assert(report.dashboard.suggestedChanges.length > 0, "suggested changes should be populated");
  assert(report.dashboard.topImprovements.length > 0, "top improvements should be populated");
}

export function runAiLearningEngineTests(): void {
  testLearningReport();
  testCandidateGeneration();
  testConfidenceCalculation();
  testDashboardStatistics();
  console.log("AI learning engine tests passed.");
}

runAiLearningEngineTests();
