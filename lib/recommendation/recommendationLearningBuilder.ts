import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { mapEngineProviderDiagnostics } from "@/lib/recommendation/recommendationValidationDashboard";
import type {
  RecommendationLearningMarketKey,
  RecommendationLearningMarketOutcome,
  RecommendationLearningRecord,
} from "@/lib/recommendation/recommendationLearningTypes";
import type { ValidationMarketKey } from "@/lib/validation/validationTypes";

function createLearningId(matchRecordId: string): string {
  return matchRecordId;
}

function toLearningMarketKey(marketKey: ValidationMarketKey): RecommendationLearningMarketKey {
  switch (marketKey) {
    case "Moneyline":
      return "1X2";
    case "Handicap":
      return "AH";
    case "OverUnder":
      return "O/U";
    case "BTTS":
      return "BTTS";
  }
}

function isFiniteProviderConfidence(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function resolveProviderDiagnostics(record: HistoricalMatchRecord) {
  const replayRecommendation = record.analysisSnapshot?.replay?.recommendation;
  const result = record.analysisSnapshot?.recommendation?.result ?? null;

  const replayDiagnostics = replayRecommendation?.providerDiagnostics ?? [];
  const resultDiagnostics = result
    ? mapEngineProviderDiagnostics(result.providerDiagnostics ?? [])
    : [];

  const providerOverallConfidence = isFiniteProviderConfidence(
    replayRecommendation?.providerOverallConfidence
  )
    ? replayRecommendation.providerOverallConfidence
    : isFiniteProviderConfidence(result?.providerOverallConfidence)
      ? result.providerOverallConfidence
      : null;

  const providerDiagnostics =
    replayDiagnostics.length > 0 ? replayDiagnostics : resultDiagnostics;

  const metaSource =
    replayDiagnostics.length > 0
      ? replayRecommendation
      : resultDiagnostics.length > 0
        ? result
        : isFiniteProviderConfidence(replayRecommendation?.providerOverallConfidence)
          ? replayRecommendation
          : result;

  return {
    providerDiagnostics,
    providerOverallConfidence,
    usableProviderCount: metaSource?.usableProviderCount ?? 0,
    unavailableProviderCount: metaSource?.unavailableProviderCount ?? 0,
  };
}

function resolveRecommendation(record: HistoricalMatchRecord) {
  return record.analysisSnapshot?.recommendation?.result ?? null;
}

function buildMarketOutcomes(record: HistoricalMatchRecord): RecommendationLearningMarketOutcome[] {
  const entries = record.verificationResult?.recommendationValidation?.entries ?? [];
  return entries.map((entry) => ({
    marketKey: toLearningMarketKey(entry.marketKey),
    hit: entry.evaluation.hit,
    profit: entry.evaluation.profit,
    stake: entry.evaluation.stake,
    confidence: entry.evaluation.confidence,
    result: entry.evaluation.result,
  }));
}

function resolveMatchHit(marketOutcomes: RecommendationLearningMarketOutcome[]): boolean {
  const decisive = marketOutcomes.filter((outcome) => outcome.result !== "PUSH");
  if (decisive.length === 0) {
    return false;
  }
  return decisive.some((outcome) => outcome.hit);
}

export function buildRecommendationLearningRecord(
  record: HistoricalMatchRecord
): RecommendationLearningRecord | null {
  if (record.status !== "VERIFIED" || !record.result) {
    return null;
  }

  const verifiedAt =
    record.verificationResult?.verifiedAt ??
    record.updatedAt ??
    new Date().toISOString();
  const now = new Date().toISOString();
  const providerSnapshot = resolveProviderDiagnostics(record);
  const marketOutcomes = buildMarketOutcomes(record);
  const totalProfit = marketOutcomes.reduce((sum, outcome) => sum + outcome.profit, 0);
  const totalStake = marketOutcomes.reduce((sum, outcome) => sum + outcome.stake, 0);

  return {
    id: createLearningId(record.id),
    matchRecordId: record.id,
    fixtureId: record.fixtureId ?? record.analysisSnapshot?.replay?.match?.fixtureId ?? null,
    recommendation: resolveRecommendation(record),
    actualResult: record.result,
    hit: resolveMatchHit(marketOutcomes),
    providerDiagnostics: providerSnapshot.providerDiagnostics,
    providerOverallConfidence: providerSnapshot.providerOverallConfidence,
    marketOutcomes,
    totalProfit,
    totalStake,
    verifiedAt,
    matchDate: record.matchDate,
    league: record.league,
    homeTeam: record.homeTeam,
    awayTeam: record.awayTeam,
    createdAt: now,
    updatedAt: now,
  };
}
