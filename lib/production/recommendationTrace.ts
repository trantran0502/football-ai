import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { RecommendationTrace } from "@/lib/production/productionTypes";
import type { RecommendationValidationEntry } from "@/lib/validation/validationTypes";

export function buildRecommendationTrace(
  record: HistoricalMatchRecord
): RecommendationTrace | null {
  const validation =
    record.verificationResult?.recommendationValidation ?? null;
  if (!validation || record.status !== "VERIFIED") {
    return null;
  }

  const recommendation = record.analysisSnapshot?.recommendation ?? null;
  const entries = validation.entries;
  const profit = entries.reduce(
    (sum, entry) => sum + entry.evaluation.profit,
    0
  );
  const hits = entries.filter((entry) => entry.evaluation.hit).length;
  const decisive = entries.filter(
    (entry) => entry.evaluation.result !== "PUSH"
  ).length;

  return {
    matchId: record.id,
    matchDate: record.matchDate,
    league: record.league,
    homeTeam: record.homeTeam,
    awayTeam: record.awayTeam,
    fusion: recommendation?.fusion ?? null,
    recommendation: recommendation?.result ?? null,
    supportingFeatures: collectSupportingFeatures(
      entries,
      recommendation?.result ?? null
    ),
    validationEntries: entries,
    hitRate: decisive > 0 ? hits / decisive : 0,
    roi: entries.length > 0 ? profit / entries.length : 0,
  };
}

export function buildRecommendationTraces(
  records: HistoricalMatchRecord[]
): RecommendationTrace[] {
  return records
    .map((record) => buildRecommendationTrace(record))
    .filter((trace): trace is RecommendationTrace => trace !== null);
}

function collectSupportingFeatures(
  entries: RecommendationValidationEntry[],
  recommendation: RecommendationTrace["recommendation"]
): string[] {
  const fromEntries = entries.flatMap(
    (entry) => entry.candidate.supportingFeatures
  );
  const fromRecommendation =
    recommendation?.candidates.flatMap(
      (candidate) => candidate.supportingFeatures
    ) ?? [];
  return [...new Set([...fromEntries, ...fromRecommendation])];
}
