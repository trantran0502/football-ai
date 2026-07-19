import type {
  FeatureCollector,
  FeatureScore,
  FeatureScoreContext,
  FeatureScoreResult,
} from "@/lib/analysis/featureScore/types";
import { isUnavailableFeature, normalizeFeatureAvailability } from "@/lib/analysis/featureScore/featureAvailability";

const collectors: FeatureCollector[] = [];

/** Register a feature collector. Collectors run in registration order. */
export function registerFeatureCollector(collector: FeatureCollector): void {
  collectors.push(collector);
}

/** Clear all collectors — for unit tests only. */
export function resetFeatureCollectorsForTests(): void {
  collectors.length = 0;
}

/** Return a snapshot of registered collectors (for tests / diagnostics). */
export function getRegisteredFeatureCollectors(): readonly FeatureCollector[] {
  return collectors;
}

/**
 * Run all registered collectors and aggregate scores.
 * No football rules are applied in PR1; collectors may be empty.
 */
export function buildFeatureScores(
  context: FeatureScoreContext
): FeatureScoreResult {
  const features = normalizeFeatureAvailability(
    collectors.flatMap((collect) => collect(context))
  );
  return aggregateFeatureScores(features);
}

function aggregateFeatureScores(features: FeatureScore[]): FeatureScoreResult {
  const scoredFeatures = features.filter(
    (feature) => feature.available !== false && !isUnavailableFeature(feature)
  );

  if (scoredFeatures.length === 0) {
    return {
      features,
      totalScore: 0,
      confidence: 0,
    };
  }

  const totalWeight = scoredFeatures.reduce((sum, feature) => sum + feature.weight, 0);

  if (totalWeight <= 0) {
    return {
      features,
      totalScore: 0,
      confidence: 0,
    };
  }

  const weightedScore = scoredFeatures.reduce(
    (sum, feature) => sum + (feature.score ?? 0) * feature.weight,
    0
  );
  const weightedConfidence = scoredFeatures.reduce(
    (sum, feature) => sum + feature.confidence * feature.weight,
    0
  );

  return {
    features,
    totalScore: weightedScore / totalWeight,
    confidence: weightedConfidence / totalWeight,
  };
}
