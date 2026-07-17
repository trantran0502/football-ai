import type { EvidencePerformanceStats } from "@/lib/evidence/evidenceValidation";
import {
  buildEvidenceLearningInsights,
  computeEvidenceOverallScore,
  computeEvidenceReliabilityScore,
  isEvidenceDisableCandidate,
  resolveEvidenceHealthStatus,
} from "@/lib/evidence/evidenceLearningIntegration";
import { buildEvidenceWeightOptimizerReport } from "@/lib/evidence/evidenceWeightOptimizer";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function buildStats(
  overrides: Partial<EvidencePerformanceStats> &
    Pick<EvidencePerformanceStats, "category">
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

function testEvidenceRanking(): void {
  const insights = buildEvidenceLearningInsights({
    generatedAt: "2026-07-17T00:00:00.000Z",
    sampleSize: 200,
    providers: [
      buildStats({ category: "h2h", hitRate: 0.7, roi: 0.2, usageCount: 150 }),
      buildStats({ category: "xg", hitRate: 0.4, roi: -0.1, usageCount: 140 }),
      buildStats({ category: "xga", hitRate: 0.55, roi: 0.05, usageCount: 130 }),
    ],
    byAccuracy: [],
    byConfidence: [],
    byUsage: [],
  });

  assert(insights.overallRanking.length === 3, "overall ranking should include active providers");
  assert(insights.overallRanking[0]!.category === "h2h", "best provider should rank first");
  assert(
    insights.overallRanking[0]!.overallScore >= insights.overallRanking[1]!.overallScore,
    "overall ranking should be descending by score"
  );
  assert(
    computeEvidenceOverallScore(buildStats({ category: "h2h" })) >
      computeEvidenceOverallScore(buildStats({ category: "xg", hitRate: 0.3, roi: -0.2 })),
    "overall score should reflect stronger performance"
  );
}

function testReliabilityScore(): void {
  const strong = buildStats({
    category: "recent10Matches",
    usageCount: 300,
    hitRate: 0.8,
    roi: 0.25,
    averageConfidence: 0.85,
  });
  const weak = buildStats({
    category: "matchContext",
    usageCount: 20,
    hitRate: 0.35,
    roi: -0.3,
    averageConfidence: 0.4,
  });

  const strongScore = computeEvidenceReliabilityScore(strong);
  const weakScore = computeEvidenceReliabilityScore(weak);

  assert(strongScore >= 0 && strongScore <= 100, "reliability score should stay within 0-100");
  assert(weakScore >= 0 && weakScore <= 100, "reliability score should stay within 0-100");
  assert(strongScore > weakScore, "stronger provider should have higher reliability score");
  assert(computeEvidenceReliabilityScore(buildStats({ category: "h2h", usageCount: 0 })) === 0, "zero usage should score 0");
}

function testDisableCandidate(): void {
  const candidate = buildStats({
    category: "leagueStrength",
    usageCount: 150,
    hitRate: 0.4,
    roi: -0.12,
  });
  const safe = buildStats({
    category: "squadAvailability",
    usageCount: 150,
    hitRate: 0.4,
    roi: 0.05,
  });

  assert(isEvidenceDisableCandidate(candidate), "candidate should match disable criteria");
  assert(!isEvidenceDisableCandidate(safe), "positive ROI should not be disable candidate");

  const report = buildEvidenceWeightOptimizerReport({
    generatedAt: "2026-07-17T00:00:00.000Z",
    sampleSize: 150,
    providers: [candidate, safe],
    byAccuracy: [],
    byConfidence: [],
    byUsage: [],
  });

  const candidateSuggestion = report.suggestions.find(
    (suggestion) => suggestion.category === "leagueStrength"
  );
  assert(candidateSuggestion?.disableCandidate === true, "optimizer should mark disable candidate");
  assert(report.recommendedDisable.length === 1, "recommendedDisable should include one provider");
}

function testDashboardStatistics(): void {
  const insights = buildEvidenceLearningInsights({
    generatedAt: "2026-07-17T00:00:00.000Z",
    sampleSize: 300,
    providers: [
      buildStats({ category: "h2h", hitRate: 0.75, roi: 0.2, usageCount: 200 }),
      buildStats({ category: "xg", hitRate: 0.38, roi: -0.15, usageCount: 150 }),
      buildStats({ category: "xga", hitRate: 0.52, roi: -0.02, usageCount: 120 }),
    ],
    byAccuracy: [],
    byConfidence: [],
    byUsage: [],
  });

  assert(insights.topPerforming.length > 0, "top performing list should not be empty");
  assert(insights.worstPerforming.length > 0, "worst performing list should not be empty");
  assert(insights.mostUsed.length > 0, "most used list should not be empty");
  assert(insights.leastReliable.length > 0, "least reliable list should not be empty");
  assert(
    insights.health.healthy + insights.health.warning + insights.health.critical ===
      insights.health.entries.length,
    "health counts should match provider entries"
  );

  const criticalEntry = insights.health.entries.find((entry) => entry.category === "xg");
  assert(criticalEntry?.health === "critical", "poor provider should be critical");

  const health = resolveEvidenceHealthStatus({
    stats: buildStats({ category: "h2h", hitRate: 0.75, roi: 0.2, usageCount: 200 }),
    reliabilityScore: 80,
    disableCandidate: false,
  });
  assert(health === "healthy", "strong provider should be healthy");
}

export function runEvidenceLearningIntegrationTests(): void {
  testEvidenceRanking();
  testReliabilityScore();
  testDisableCandidate();
  testDashboardStatistics();
  console.log("Evidence learning integration tests passed.");
}

runEvidenceLearningIntegrationTests();
