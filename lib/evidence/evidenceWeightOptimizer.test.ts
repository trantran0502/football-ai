import type { EvidencePerformanceReport, EvidencePerformanceStats } from "@/lib/evidence/evidenceValidation";
import { TRACKED_EVIDENCE_CATEGORIES } from "@/lib/evidence/evidenceValidation";
import { DEFAULT_EVIDENCE_WEIGHTS } from "@/lib/evidence/evidenceWeights";
import { buildEvidenceWeightOptimizerReport } from "@/lib/evidence/evidenceWeightOptimizer";
import {
  EVIDENCE_MAX_WEIGHT_CHANGE,
  EVIDENCE_MIN_SAMPLE_FOR_INCREASE,
} from "@/lib/evidence/evidenceWeightOptimizerTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNear(actual: number, expected: number, message: string, tolerance = 1e-4): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ~${expected}, got ${actual}`);
  }
}

function buildStats(
  overrides: Partial<EvidencePerformanceStats> &
    Pick<EvidencePerformanceStats, "category">
): EvidencePerformanceStats {
  return {
    label: overrides.category,
    usageCount: 50,
    hitCount: 30,
    hitRate: 0.6,
    averageImpactScore: 8,
    averageConfidence: 0.7,
    roi: 0.12,
    totalProfit: 6,
    totalStake: 50,
    ...overrides,
  };
}

function buildReport(providers: EvidencePerformanceStats[]): EvidencePerformanceReport {
  return {
    generatedAt: "2026-07-17T00:00:00.000Z",
    sampleSize: 100,
    providers,
    byAccuracy: [...providers].sort((left, right) => right.hitRate - left.hitRate),
    byConfidence: [...providers].sort(
      (left, right) => right.averageConfidence - left.averageConfidence
    ),
    byUsage: [...providers].sort((left, right) => right.usageCount - left.usageCount),
  };
}

function getSuggestion(
  report: ReturnType<typeof buildEvidenceWeightOptimizerReport>,
  category: EvidencePerformanceStats["category"]
) {
  const suggestion = report.suggestions.find((entry) => entry.category === category);
  assert(suggestion !== undefined, `missing suggestion for ${category}`);
  return suggestion!;
}

function testInsufficientSampleCannotIncrease(): void {
  const report = buildEvidenceWeightOptimizerReport(
    buildReport([
      buildStats({
        category: "h2h",
        usageCount: EVIDENCE_MIN_SAMPLE_FOR_INCREASE - 1,
        hitRate: 0.9,
        roi: 0.3,
      }),
    ])
  );

  const h2h = getSuggestion(report, "h2h");
  assert(h2h.weightChange <= 0, "insufficient sample should not increase weight");
  assert(h2h.reason.includes("樣本不足"), "reason should mention insufficient sample");
}

function testNegativeRoiCannotIncrease(): void {
  const report = buildEvidenceWeightOptimizerReport(
    buildReport([
      buildStats({
        category: "xg",
        usageCount: 120,
        hitRate: 0.8,
        roi: -0.15,
      }),
    ])
  );

  const xg = getSuggestion(report, "xg");
  assert(xg.weightChange <= 0, "negative ROI should not increase weight");
  assert(xg.reason.includes("ROI 為負"), "reason should mention negative ROI");
}

function testHighHitRateCanIncrease(): void {
  const report = buildEvidenceWeightOptimizerReport(
    buildReport([
      buildStats({
        category: "recent10Matches",
        usageCount: 150,
        hitRate: 0.72,
        roi: 0.18,
        averageConfidence: 0.8,
      }),
    ])
  );

  const recent = getSuggestion(report, "recent10Matches");
  assert(recent.weightChange > 0, "strong evidence provider should suggest higher weight");
  assert(recent.reason.includes("建議升權"), "reason should mention weight increase");
}

function testWeightsNormalizeToOne(): void {
  const report = buildEvidenceWeightOptimizerReport(
    buildReport(
      TRACKED_EVIDENCE_CATEGORIES.map((category, index) =>
        buildStats({
          category,
          usageCount: 80 + index * 10,
          hitRate: 0.45 + index * 0.04,
          roi: -0.05 + index * 0.03,
        })
      )
    )
  );

  assertNear(report.normalizedWeightSum, 1, "suggested weights should sum to 1");
  assert(
    report.suggestions.every((suggestion) => suggestion.suggestedWeight >= 0),
    "suggested weights should not be negative"
  );
}

function testMaxAdjustmentLimit(): void {
  const report = buildEvidenceWeightOptimizerReport(
    buildReport([
      buildStats({
        category: "leagueStrength",
        usageCount: 400,
        hitRate: 0.95,
        roi: 0.8,
        averageConfidence: 0.95,
      }),
      buildStats({
        category: "matchContext",
        usageCount: 400,
        hitRate: 0.05,
        roi: -0.8,
        averageConfidence: 0.2,
      }),
    ])
  );

  for (const suggestion of report.suggestions) {
    assert(
      Math.abs(suggestion.weightChange) <= EVIDENCE_MAX_WEIGHT_CHANGE + 1e-6,
      `${suggestion.category} change should respect max adjustment`
    );
  }
}

function testMissingDataFallback(): void {
  const report = buildEvidenceWeightOptimizerReport(buildReport([]));

  for (const category of TRACKED_EVIDENCE_CATEGORIES) {
    const suggestion = getSuggestion(report, category);
    assertNear(
      suggestion.currentWeight,
      DEFAULT_EVIDENCE_WEIGHTS[category],
      `${category} current weight should match default`
    );
    assertNear(
      suggestion.suggestedWeight,
      DEFAULT_EVIDENCE_WEIGHTS[category],
      `${category} should keep default weight without data`,
      1e-3
    );
    assert(suggestion.reason.includes("缺少資料"), `${category} should mention missing data`);
  }
}

function testAnalysisOnlyMetadata(): void {
  const report = buildEvidenceWeightOptimizerReport(buildReport([]));
  assert(report.optimizerMode === "analysis", "optimizer mode should be analysis");
  assert(report.weightsApplied === false, "weightsApplied should remain false");
}

export function runEvidenceWeightOptimizerTests(): void {
  testInsufficientSampleCannotIncrease();
  testNegativeRoiCannotIncrease();
  testHighHitRateCanIncrease();
  testWeightsNormalizeToOne();
  testMaxAdjustmentLimit();
  testMissingDataFallback();
  testAnalysisOnlyMetadata();
  console.log("Evidence weight optimizer tests passed.");
}

runEvidenceWeightOptimizerTests();
