import type { FeatureScore } from "@/lib/analysis/featureScore/types";

function hasZeroSampleMetadata(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata) {
    return false;
  }

  const homeSample =
    typeof metadata.homeSampleSize === "number" ? metadata.homeSampleSize : null;
  const awaySample =
    typeof metadata.awaySampleSize === "number" ? metadata.awaySampleSize : null;
  const sampleSize =
    typeof metadata.sampleSize === "number" ? metadata.sampleSize : null;

  if (homeSample !== null || awaySample !== null) {
    return (homeSample ?? 0) <= 0 && (awaySample ?? 0) <= 0;
  }

  if (sampleSize !== null) {
    return sampleSize <= 0;
  }

  return metadata.available === false;
}

export function isUnavailableFeature(feature: FeatureScore): boolean {
  if (feature.available === false) {
    return true;
  }
  if (feature.confidence <= 0) {
    return true;
  }
  if (feature.confidence <= 0.2 && feature.score === 0 && hasZeroSampleMetadata(feature.metadata)) {
    return true;
  }
  return false;
}

export function normalizeFeatureAvailability(features: FeatureScore[]): FeatureScore[] {
  return features.map((feature) => {
    if (!isUnavailableFeature(feature)) {
      return {
        ...feature,
        available: feature.available ?? true,
        unavailableReason: null,
      };
    }

    return {
      ...feature,
      available: false,
      score: feature.score,
      confidence: 0,
      unavailableReason: feature.unavailableReason ?? feature.reason,
      metadata: {
        ...(feature.metadata ?? {}),
        available: false,
        value: null,
      },
    };
  });
}
