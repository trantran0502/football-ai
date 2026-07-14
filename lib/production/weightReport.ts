import type { ProductionDashboard, WeightReport } from "@/lib/production/productionTypes";

const MIN_SAMPLE_SIZE = 5;
const HIGH_ROI = 0.05;
const LOW_ROI = -0.05;
const INVALID_HIT_RATE = 0.4;

export function buildWeightReport(dashboard: ProductionDashboard): WeightReport {
  const highRoiFeatures = rankFeatures(dashboard.byFeature, "high");
  const lowRoiFeatures = rankFeatures(dashboard.byFeature, "low");
  const invalidRules = findInvalidRules(dashboard);
  const bestMarkets = rankMarkets(dashboard);

  return {
    highRoiFeatures,
    lowRoiFeatures,
    invalidRules,
    bestMarkets,
    generatedAt: new Date().toISOString(),
  };
}

function rankFeatures(
  byFeature: ProductionDashboard["byFeature"],
  mode: "high" | "low"
): string[] {
  return Object.entries(byFeature)
    .filter(([, bucket]) => bucket.sampleSize >= MIN_SAMPLE_SIZE)
    .filter(([, bucket]) =>
      mode === "high" ? bucket.roi >= HIGH_ROI : bucket.roi <= LOW_ROI
    )
    .sort((left, right) =>
      mode === "high" ? right[1].roi - left[1].roi : left[1].roi - right[1].roi
    )
    .map(([feature]) => feature);
}

function findInvalidRules(dashboard: ProductionDashboard): string[] {
  const invalid: string[] = [];

  for (const [market, bucket] of Object.entries(dashboard.byMarket)) {
    if (
      bucket.sampleSize >= MIN_SAMPLE_SIZE &&
      (bucket.hitRate < INVALID_HIT_RATE || bucket.roi < LOW_ROI)
    ) {
      invalid.push(`market:${market}`);
    }
  }

  for (const [confidence, bucket] of Object.entries(dashboard.byConfidence)) {
    if (
      bucket.sampleSize >= MIN_SAMPLE_SIZE &&
      (bucket.hitRate < INVALID_HIT_RATE || bucket.roi < LOW_ROI)
    ) {
      invalid.push(`confidence:${confidence}`);
    }
  }

  for (const [feature, bucket] of Object.entries(dashboard.byFeature)) {
    if (
      bucket.sampleSize >= MIN_SAMPLE_SIZE &&
      (bucket.hitRate < INVALID_HIT_RATE || bucket.roi < LOW_ROI)
    ) {
      invalid.push(`feature:${feature}`);
    }
  }

  for (const [rule, bucket] of Object.entries(dashboard.byRule)) {
    if (
      bucket.sampleSize >= MIN_SAMPLE_SIZE &&
      (bucket.hitRate < INVALID_HIT_RATE || bucket.roi < LOW_ROI)
    ) {
      invalid.push(rule.startsWith("reason:") || rule.startsWith("confidence:")
        ? rule
        : `rule:${rule}`);
    }
  }

  return [...new Set(invalid)];
}

function rankMarkets(dashboard: ProductionDashboard): string[] {
  return Object.entries(dashboard.byMarket)
    .filter(([, bucket]) => bucket.sampleSize >= MIN_SAMPLE_SIZE)
    .sort((left, right) => right[1].roi - left[1].roi)
    .map(([market]) => market);
}
