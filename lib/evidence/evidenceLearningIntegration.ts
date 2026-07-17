import type { EvidenceCategory } from "@/lib/evidence/evidenceTypes";
import type { EvidencePerformanceReport, EvidencePerformanceStats } from "@/lib/evidence/evidenceValidation";
import { EVIDENCE_PROVIDER_LABELS } from "@/lib/evidence/evidenceValidation";

export type EvidenceHealthStatus = "healthy" | "warning" | "critical";

export interface EvidenceRankedEntry {
  category: EvidenceCategory;
  label: string;
  usageCount: number;
  hitRate: number;
  roi: number;
  averageConfidence: number;
  averageImpactScore: number;
  reliabilityScore: number;
  overallScore: number;
  rank: number;
  health: EvidenceHealthStatus;
}

export interface EvidenceHealthProviderEntry {
  category: EvidenceCategory;
  label: string;
  health: EvidenceHealthStatus;
  reliabilityScore: number;
  hitRate: number;
  roi: number;
  usageCount: number;
}

export interface EvidenceHealthSummary {
  healthy: number;
  warning: number;
  critical: number;
  entries: EvidenceHealthProviderEntry[];
}

export interface EvidenceLearningInsights {
  overallRanking: EvidenceRankedEntry[];
  topPerforming: EvidenceRankedEntry[];
  worstPerforming: EvidenceRankedEntry[];
  mostUsed: EvidenceRankedEntry[];
  leastReliable: EvidenceRankedEntry[];
  health: EvidenceHealthSummary;
}

export const EVIDENCE_DISABLE_ACCURACY_THRESHOLD = 0.45;
export const EVIDENCE_DISABLE_MIN_SAMPLE = 100;

export const EVIDENCE_RANKING_WEIGHTS = {
  accuracy: 0.35,
  roi: 0.25,
  confidence: 0.2,
  sampleSize: 0.2,
} as const;

export const EVIDENCE_RELIABILITY_WEIGHTS = {
  sampleSize: 25,
  accuracy: 35,
  roi: 25,
  confidence: 15,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeEvidenceRoi(roi: number): number {
  return clamp((roi + 0.5) / 1.5, 0, 1);
}

export function normalizeEvidenceSampleSize(usageCount: number): number {
  return clamp(usageCount / 300, 0, 1);
}

export function computeEvidenceOverallScore(stats: EvidencePerformanceStats): number {
  return (
    stats.hitRate * EVIDENCE_RANKING_WEIGHTS.accuracy +
    normalizeEvidenceRoi(stats.roi) * EVIDENCE_RANKING_WEIGHTS.roi +
    stats.averageConfidence * EVIDENCE_RANKING_WEIGHTS.confidence +
    normalizeEvidenceSampleSize(stats.usageCount) * EVIDENCE_RANKING_WEIGHTS.sampleSize
  );
}

export function computeEvidenceReliabilityScore(stats: EvidencePerformanceStats): number {
  if (stats.usageCount <= 0) {
    return 0;
  }

  const score =
    normalizeEvidenceSampleSize(stats.usageCount) * EVIDENCE_RELIABILITY_WEIGHTS.sampleSize +
    stats.hitRate * EVIDENCE_RELIABILITY_WEIGHTS.accuracy +
    normalizeEvidenceRoi(stats.roi) * EVIDENCE_RELIABILITY_WEIGHTS.roi +
    stats.averageConfidence * EVIDENCE_RELIABILITY_WEIGHTS.confidence;

  return Math.round(clamp(score, 0, 100));
}

export function isEvidenceDisableCandidate(stats: EvidencePerformanceStats): boolean {
  return (
    stats.usageCount > EVIDENCE_DISABLE_MIN_SAMPLE &&
    stats.hitRate < EVIDENCE_DISABLE_ACCURACY_THRESHOLD &&
    stats.roi < 0
  );
}

export function resolveEvidenceHealthStatus(input: {
  stats: EvidencePerformanceStats;
  reliabilityScore: number;
  disableCandidate: boolean;
}): EvidenceHealthStatus {
  if (
    input.disableCandidate ||
    input.reliabilityScore < 35 ||
    (input.stats.usageCount > 30 &&
      input.stats.hitRate < EVIDENCE_DISABLE_ACCURACY_THRESHOLD &&
      input.stats.roi < 0)
  ) {
    return "critical";
  }

  if (
    input.reliabilityScore < 60 ||
    input.stats.roi < 0 ||
    (input.stats.usageCount > 10 && input.stats.hitRate < 0.5)
  ) {
    return "warning";
  }

  return "healthy";
}

function buildRankedEntry(
  stats: EvidencePerformanceStats,
  rank: number,
  disableCandidate: boolean
): EvidenceRankedEntry {
  const reliabilityScore = computeEvidenceReliabilityScore(stats);
  const overallScore = computeEvidenceOverallScore(stats);
  const health = resolveEvidenceHealthStatus({
    stats,
    reliabilityScore,
    disableCandidate,
  });

  return {
    category: stats.category,
    label: stats.label || EVIDENCE_PROVIDER_LABELS[stats.category],
    usageCount: stats.usageCount,
    hitRate: stats.hitRate,
    roi: stats.roi,
    averageConfidence: stats.averageConfidence,
    averageImpactScore: stats.averageImpactScore,
    reliabilityScore,
    overallScore,
    rank,
    health,
  };
}

export function buildEvidenceLearningInsights(
  performance: EvidencePerformanceReport,
  limit = 10
): EvidenceLearningInsights {
  const activeProviders = performance.providers.filter((provider) => provider.usageCount > 0);
  const ranked = [...activeProviders]
    .sort((left, right) => computeEvidenceOverallScore(right) - computeEvidenceOverallScore(left))
    .map((stats, index) =>
      buildRankedEntry(stats, index + 1, isEvidenceDisableCandidate(stats))
    );

  const topPerforming = ranked.slice(0, limit);
  const worstPerforming = [...ranked].sort((left, right) => left.overallScore - right.overallScore).slice(0, limit);
  const mostUsed = [...ranked].sort((left, right) => right.usageCount - left.usageCount).slice(0, limit);
  const leastReliable = [...ranked]
    .sort((left, right) => left.reliabilityScore - right.reliabilityScore)
    .slice(0, limit);

  const healthEntries: EvidenceHealthProviderEntry[] = ranked.map((entry) => ({
    category: entry.category,
    label: entry.label,
    health: entry.health,
    reliabilityScore: entry.reliabilityScore,
    hitRate: entry.hitRate,
    roi: entry.roi,
    usageCount: entry.usageCount,
  }));

  const health: EvidenceHealthSummary = {
    healthy: healthEntries.filter((entry) => entry.health === "healthy").length,
    warning: healthEntries.filter((entry) => entry.health === "warning").length,
    critical: healthEntries.filter((entry) => entry.health === "critical").length,
    entries: healthEntries,
  };

  return {
    overallRanking: ranked,
    topPerforming,
    worstPerforming,
    mostUsed,
    leastReliable,
    health,
  };
}
