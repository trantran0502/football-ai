import type { ProviderDataSource } from "@/lib/providers/registry/types";

const BASE_CONFIDENCE: Record<Exclude<ProviderDataSource, "cache">, number> = {
  googleSearch: 0.72,
  matchRecords: 0.7,
  teamProfile: 0.82,
  apiFootball: 0.85,
  hybrid: 0.9,
  mock: 0.2,
  unavailable: 0.1,
};

export function computeSquadAvailabilityProviderConfidence(input: {
  sampleSize: number;
  dataFreshnessDays: number | null;
  source: Exclude<ProviderDataSource, "cache">;
}): number {
  if (input.sampleSize === 0) {
    return BASE_CONFIDENCE.unavailable;
  }

  let confidence = BASE_CONFIDENCE[input.source] ?? 0.5;

  if (input.dataFreshnessDays !== null) {
    if (input.dataFreshnessDays > 7) {
      confidence *= 0.88;
    }
    if (input.dataFreshnessDays > 14) {
      confidence *= 0.78;
    }
    if (input.dataFreshnessDays > 30) {
      confidence *= 0.65;
    }
  }

  return Math.round(Math.max(0.1, Math.min(0.85, confidence)) * 1000) / 1000;
}

export function isSquadAvailabilitySampleUsable(
  sampleSize: number | null | undefined
): boolean {
  return (sampleSize ?? 0) > 0;
}
