import type { MatchResult } from "@/lib/database/matchSchema";
import type {
  RecommendationLearningMarketOutcome,
  RecommendationLearningRecord,
} from "@/lib/recommendation/recommendationLearningTypes";
import type { RecommendationEngineResult } from "@/lib/recommendation/recommendationTypes";
import type { ReplayProviderRecommendationDiagnostic } from "@/lib/replay/replayTypes";
import type { RecommendationLearningRow } from "@/lib/supabase/database.types";
import { extractEvidenceValidationFromRecommendation, buildEvidenceValidationRecord } from "@/lib/evidence/evidenceValidation";

export function recommendationLearningDomainToRow(
  record: RecommendationLearningRecord
): RecommendationLearningRow {
  return {
    id: record.id,
    match_record_id: record.matchRecordId,
    fixture_id: record.fixtureId,
    recommendation: record.recommendation,
    actual_result: record.actualResult,
    hit: record.hit,
    provider_diagnostics: record.providerDiagnostics,
    provider_overall_confidence: record.providerOverallConfidence,
    market_outcomes: record.marketOutcomes,
    total_profit: record.totalProfit,
    total_stake: record.totalStake,
    verified_at: record.verifiedAt,
    match_date: record.matchDate,
    league: record.league,
    home_team: record.homeTeam,
    away_team: record.awayTeam,
    source: "app",
    schema_version: 1,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function recommendationLearningRowToDomain(
  row: RecommendationLearningRow
): RecommendationLearningRecord {
  return {
    id: row.id,
    matchRecordId: row.match_record_id,
    fixtureId: row.fixture_id,
    recommendation: row.recommendation as RecommendationEngineResult | null,
    actualResult: row.actual_result as MatchResult,
    hit: row.hit,
    providerDiagnostics: row.provider_diagnostics as ReplayProviderRecommendationDiagnostic[],
    providerOverallConfidence:
      row.provider_overall_confidence === null
        ? null
        : Number(row.provider_overall_confidence),
    marketOutcomes: row.market_outcomes as RecommendationLearningMarketOutcome[],
    totalProfit: Number(row.total_profit),
    totalStake: Number(row.total_stake),
    verifiedAt: row.verified_at,
    matchDate: row.match_date,
    league: row.league,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    evidenceValidation:
      extractEvidenceValidationFromRecommendation(
        row.recommendation as RecommendationEngineResult | null
      ) ??
      buildEvidenceValidationFromLearningRecordFallback(row),
  };
}

function buildEvidenceValidationFromLearningRecordFallback(
  row: RecommendationLearningRow
): RecommendationLearningRecord["evidenceValidation"] {
  const recommendation = row.recommendation as RecommendationEngineResult | null;
  if (!recommendation) {
    return null;
  }

  return buildEvidenceValidationRecord({
    matchRecordId: row.match_record_id,
    recommendation,
    actualResult: row.actual_result as MatchResult,
    matchHit: row.hit,
    validatedAt: row.verified_at,
  });
}
