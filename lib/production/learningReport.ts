import type {
  LearningReport,
  ProductionDashboard,
  WeightReport,
} from "@/lib/production/productionTypes";

const MIN_SAMPLE_SIZE = 5;

export function buildLearningReport(
  dashboard: ProductionDashboard,
  weightReport: WeightReport
): LearningReport {
  const increaseWeightFeatures = weightReport.highRoiFeatures.slice(0, 5);
  const decreaseWeightFeatures = weightReport.lowRoiFeatures.slice(0, 5);
  const disableRules = weightReport.invalidRules;
  const suggestedNewRules = buildSuggestedNewRules(dashboard);

  return {
    increaseWeightFeatures,
    decreaseWeightFeatures,
    disableRules,
    suggestedNewRules,
    generatedAt: new Date().toISOString(),
  };
}

function buildSuggestedNewRules(dashboard: ProductionDashboard): string[] {
  const suggestions: string[] = [];

  for (const [market, bucket] of Object.entries(dashboard.byMarket)) {
    if (
      bucket.sampleSize >= MIN_SAMPLE_SIZE &&
      bucket.hitRate >= 0.55 &&
      bucket.roi > 0.05
    ) {
      suggestions.push(
        `Increase exposure to ${market} when confidence is medium or high (ROI ${formatRate(bucket.roi)}).`
      );
    }
  }

  for (const point of dashboard.confidenceVsHitRate) {
    if (point.sampleSize >= MIN_SAMPLE_SIZE && point.hitRate >= 0.55) {
      suggestions.push(
        `Add rule requiring minimum ${point.confidence} confidence when hit rate stays above ${formatRate(point.hitRate)}.`
      );
    }
  }

  for (const [league, bucket] of Object.entries(dashboard.byLeague)) {
    if (
      bucket.sampleSize >= MIN_SAMPLE_SIZE &&
      bucket.roi > 0.08 &&
      bucket.hitRate >= 0.5
    ) {
      suggestions.push(
        `Add league-specific weighting for ${league} (ROI ${formatRate(bucket.roi)}).`
      );
    }
  }

  return [...new Set(suggestions)].slice(0, 8);
}

function formatRate(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}
