import type {
  BetaRecommendationRecord,
  BetaRecommendationStatus,
} from "@/lib/beta/types";
import type { BetResult } from "@/lib/backtest/types";
import type {
  BetaRecommendationInsert,
  BetaRecommendationRow,
} from "@/lib/supabase/database.types";

function toIsoTimestamp(value: string): string {
  return value.includes("T") ? value : `${value}T00:00:00.000Z`;
}

export function betaRecommendationRowToDomain(
  row: BetaRecommendationRow
): BetaRecommendationRecord {
  return {
    id: row.id,
    matchRecordId: row.match_record_id,
    modelVersion: row.model_version,
    recommendedAt: row.recommended_at,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    matchDate: row.match_date,
    candidate: row.candidate,
    rawOdds: row.raw_odds,
    marketSelections: row.market_selections,
    teamData: row.team_data,
    rulesUsed: row.rules_used,
    status: row.status as BetaRecommendationStatus,
    finalScore: row.final_score,
    settlement: row.settlement as BetResult | null,
    profit: row.profit,
    hit: row.hit,
    verifiedAt: row.verified_at,
  };
}

export function betaRecommendationDomainToRow(
  record: BetaRecommendationRecord,
  options?: { source?: string; schemaVersion?: number }
): BetaRecommendationInsert {
  return {
    id: record.id,
    match_record_id: record.matchRecordId,
    model_version: record.modelVersion,
    recommended_at: toIsoTimestamp(record.recommendedAt),
    home_team: record.homeTeam,
    away_team: record.awayTeam,
    match_date: record.matchDate,
    status: record.status,
    settlement: record.settlement,
    profit: record.profit,
    hit: record.hit,
    verified_at: record.verifiedAt ? toIsoTimestamp(record.verifiedAt) : null,
    candidate: record.candidate,
    raw_odds: record.rawOdds,
    market_selections: record.marketSelections,
    team_data: record.teamData,
    rules_used: record.rulesUsed,
    final_score: record.finalScore,
    source: options?.source ?? "app",
    schema_version: options?.schemaVersion ?? 1,
    created_at: toIsoTimestamp(record.recommendedAt),
    updated_at: record.verifiedAt
      ? toIsoTimestamp(record.verifiedAt)
      : toIsoTimestamp(record.recommendedAt),
  };
}
