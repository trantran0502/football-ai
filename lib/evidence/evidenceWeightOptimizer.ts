import type { EvidencePerformanceReport, EvidencePerformanceStats } from "@/lib/evidence/evidenceValidation";
import {
  EVIDENCE_PROVIDER_LABELS,
  TRACKED_EVIDENCE_CATEGORIES,
} from "@/lib/evidence/evidenceValidation";
import {
  DEFAULT_EVIDENCE_WEIGHTS,
  type TrackedEvidenceCategory,
} from "@/lib/evidence/evidenceWeights";
import {
  EVIDENCE_MAX_WEIGHT_CHANGE,
  EVIDENCE_MIN_SAMPLE_FOR_INCREASE,
  type EvidenceWeightOptimizerReport,
  type EvidenceWeightSuggestion,
} from "@/lib/evidence/evidenceWeightOptimizerTypes";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatRate(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function computeSampleReliability(sampleSize: number): number {
  if (sampleSize <= 0) {
    return 0;
  }
  if (sampleSize < 100) {
    return sampleSize / 100;
  }
  if (sampleSize < 300) {
    return 0.5 + (sampleSize - 100) / 400;
  }
  return Math.min(1, 0.85 + (sampleSize - 300) / 700);
}

function normalizeCategoryWeights(
  weights: Map<TrackedEvidenceCategory, number>
): Map<TrackedEvidenceCategory, number> {
  const total = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    return new Map(
      TRACKED_EVIDENCE_CATEGORIES.map((category) => [
        category,
        DEFAULT_EVIDENCE_WEIGHTS[category],
      ])
    );
  }

  return new Map(
    TRACKED_EVIDENCE_CATEGORIES.map((category) => [
      category,
      Math.max(0, weights.get(category) ?? 0) / total,
    ])
  );
}

function applyMaxChangeAndNormalize(input: {
  currentWeights: Map<TrackedEvidenceCategory, number>;
  suggestedWeights: Map<TrackedEvidenceCategory, number>;
  maxChange: number;
}): Map<TrackedEvidenceCategory, number> {
  let adjusted = normalizeCategoryWeights(input.suggestedWeights);

  for (let iteration = 0; iteration < 8; iteration += 1) {
    let changed = false;

    for (const category of TRACKED_EVIDENCE_CATEGORIES) {
      const current = input.currentWeights.get(category) ?? 0;
      const suggested = adjusted.get(category) ?? 0;
      const diff = suggested - current;

      if (Math.abs(diff) > input.maxChange + 1e-9) {
        adjusted.set(category, current + Math.sign(diff) * input.maxChange);
        changed = true;
      }
    }

    adjusted = normalizeCategoryWeights(adjusted);
    if (!changed) {
      break;
    }
  }

  return adjusted;
}

function computeRawDelta(
  stats: EvidencePerformanceStats,
  reliability: number
): { delta: number; reason: string } {
  const hitEdge = stats.hitRate - 0.5;
  const performanceSignal =
    hitEdge * 0.15 +
    stats.roi * 0.12 +
    (stats.averageConfidence - 0.5) * 0.05;

  if (stats.usageCount === 0) {
    return { delta: 0, reason: "缺少資料，維持原權重" };
  }

  if (stats.roi < 0) {
    const delta = clamp(Math.min(0, performanceSignal * 0.5) * reliability, -EVIDENCE_MAX_WEIGHT_CHANGE, 0);
    return {
      delta,
      reason: `ROI 為負 (${formatRate(stats.roi)})，不得提高權重`,
    };
  }

  if (stats.usageCount < EVIDENCE_MIN_SAMPLE_FOR_INCREASE) {
    const delta = clamp(Math.min(0, performanceSignal * 0.3) * reliability, -EVIDENCE_MAX_WEIGHT_CHANGE, 0);
    return {
      delta,
      reason: `樣本不足 (${stats.usageCount})，不得提高權重`,
    };
  }

  if (stats.hitRate >= 0.55 && stats.roi > 0) {
    const delta = clamp(
      Math.max(0, performanceSignal * 0.6) * reliability,
      0,
      EVIDENCE_MAX_WEIGHT_CHANGE
    );
    return {
      delta,
      reason: `命中率 ${formatRate(stats.hitRate)}、ROI ${formatRate(stats.roi)} 表現佳，建議升權`,
    };
  }

  if (stats.hitRate <= 0.45 || stats.roi < 0.01) {
    const delta = clamp(
      Math.min(0, performanceSignal * 0.6) * reliability,
      -EVIDENCE_MAX_WEIGHT_CHANGE,
      0
    );
    return {
      delta,
      reason: `命中率 ${formatRate(stats.hitRate)} 或 ROI ${formatRate(stats.roi)} 偏弱，建議降權`,
    };
  }

  return {
    delta: clamp(performanceSignal * 0.2 * reliability, -EVIDENCE_MAX_WEIGHT_CHANGE, EVIDENCE_MAX_WEIGHT_CHANGE),
    reason: "表現接近平均，維持原權重",
  };
}

export function buildEvidenceWeightOptimizerReport(
  performance: EvidencePerformanceReport
): EvidenceWeightOptimizerReport {
  const statsByCategory = new Map(
    performance.providers.map((provider) => [provider.category, provider])
  );
  const currentWeights = new Map(
    TRACKED_EVIDENCE_CATEGORIES.map((category) => [
      category,
      DEFAULT_EVIDENCE_WEIGHTS[category],
    ])
  );

  const tentative = new Map<TrackedEvidenceCategory, number>();
  const meta = new Map<
    TrackedEvidenceCategory,
    {
      reason: string;
      reliability: number;
      sampleSize: number;
      stats: EvidencePerformanceStats | null;
    }
  >();

  for (const category of TRACKED_EVIDENCE_CATEGORIES) {
    const currentWeight = DEFAULT_EVIDENCE_WEIGHTS[category];
    const stats = statsByCategory.get(category) ?? null;

    if (!stats || stats.usageCount === 0) {
      tentative.set(category, currentWeight);
      meta.set(category, {
        reason: "缺少資料，維持原權重",
        reliability: 0,
        sampleSize: 0,
        stats: null,
      });
      continue;
    }

    const reliability = computeSampleReliability(stats.usageCount);
    const { delta, reason } = computeRawDelta(stats, reliability);
    tentative.set(category, Math.max(0, currentWeight + delta));
    meta.set(category, {
      reason,
      reliability,
      sampleSize: stats.usageCount,
      stats,
    });
  }

  const normalized = applyMaxChangeAndNormalize({
    currentWeights,
    suggestedWeights: tentative,
    maxChange: EVIDENCE_MAX_WEIGHT_CHANGE,
  });

  const suggestions: EvidenceWeightSuggestion[] = TRACKED_EVIDENCE_CATEGORIES.map(
    (category) => {
      const currentWeight = DEFAULT_EVIDENCE_WEIGHTS[category];
      const suggestedWeight = normalized.get(category) ?? currentWeight;
      const details = meta.get(category)!;
      const stats = details.stats;

      return {
        category,
        label: EVIDENCE_PROVIDER_LABELS[category],
        usageCount: stats?.usageCount ?? 0,
        hitRate: stats?.hitRate ?? 0,
        roi: stats?.roi ?? 0,
        averageConfidence: stats?.averageConfidence ?? 0,
        averageImpactScore: stats?.averageImpactScore ?? 0,
        currentWeight,
        suggestedWeight,
        weightChange: suggestedWeight - currentWeight,
        sampleSize: details.sampleSize,
        reliability: details.reliability,
        reason: details.reason,
      };
    }
  );

  const normalizedWeightSum = suggestions.reduce(
    (sum, suggestion) => sum + suggestion.suggestedWeight,
    0
  );

  return {
    generatedAt: new Date().toISOString(),
    optimizerMode: "analysis",
    weightsApplied: false,
    totalSampleSize: performance.sampleSize,
    suggestions,
    normalizedWeightSum,
  };
}
