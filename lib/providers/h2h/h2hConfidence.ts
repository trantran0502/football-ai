import type { H2HSnapshot } from "@/lib/analysis/featureScore/providers/h2hProvider";
import type { ProviderDataSource } from "@/lib/providers/registry/types";

const THREE_YEARS_DAYS = 365 * 3;

const BASE_CONFIDENCE: Record<Exclude<ProviderDataSource, "cache">, number> = {
  matchRecords: 0.84,
  teamProfile: 0.82,
  apiFootball: 0.82,
  googleSearch: 0.65,
  hybrid: 0.9,
  mock: 0.2,
  unavailable: 0.1,
};

export function computeH2HProviderConfidence(
  snapshot: H2HSnapshot,
  source: Exclude<ProviderDataSource, "cache">
): number {
  if (snapshot.sampleSize === 0) {
    return BASE_CONFIDENCE.unavailable;
  }

  let confidence = BASE_CONFIDENCE[source] ?? 0.5;

  if (snapshot.sampleSize < 3) {
    confidence *= 0.45;
  } else if (snapshot.sampleSize < 5) {
    confidence *= 0.72;
  }

  if (
    snapshot.dataFreshnessDays !== null &&
    snapshot.dataFreshnessDays > THREE_YEARS_DAYS
  ) {
    confidence *= 0.7;
  }

  return Math.round(Math.max(0.1, Math.min(0.85, confidence)) * 1000) / 1000;
}
