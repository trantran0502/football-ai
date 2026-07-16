import type { ProviderDataSource } from "@/lib/providers/registry/types";

const BASE_CONFIDENCE: Record<Exclude<ProviderDataSource, "cache">, number> = {
  matchRecords: 0.84,
  teamProfile: 0.82,
  apiFootball: 0.85,
  googleSearch: 0.65,
  hybrid: 0.9,
  mock: 0.2,
  unavailable: 0.1,
};

const MIN_SAMPLE_NORMAL = 20;
const MIN_SAMPLE_REDUCED = 10;

export function computeLeagueStrengthProviderConfidence(
  sampleSize: number,
  source: Exclude<ProviderDataSource, "cache">
): number {
  if (sampleSize === 0) {
    return BASE_CONFIDENCE.unavailable;
  }

  let confidence = BASE_CONFIDENCE[source] ?? 0.5;

  if (sampleSize < MIN_SAMPLE_REDUCED) {
    confidence *= 0.45;
  } else if (sampleSize < MIN_SAMPLE_NORMAL) {
    confidence *= 0.72;
  }

  return Math.round(Math.max(0.1, Math.min(0.85, confidence)) * 1000) / 1000;
}

export function isLeagueStrengthSampleUsable(sampleSize: number): boolean {
  return sampleSize >= MIN_SAMPLE_REDUCED;
}
