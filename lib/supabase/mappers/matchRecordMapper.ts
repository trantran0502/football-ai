import {
  normalizeHistoricalMatchRecord,
  type HistoricalMatchRecord,
  type MatchStatus,
} from "@/lib/database/matchSchema";
import type { MatchRecordInsert, MatchRecordRow } from "@/lib/supabase/database.types";

function toIsoTimestamp(value: string): string {
  return value.includes("T") ? value : `${value}T00:00:00.000Z`;
}

export function matchRecordRowToDomain(row: MatchRecordRow): HistoricalMatchRecord {
  const matchDate = row.match_date;
  const legacyDate = row.legacy_date ?? matchDate;

  return normalizeHistoricalMatchRecord({
    id: row.id,
    date: legacyDate,
    matchDate,
    league: row.league,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    rawOdds: row.raw_odds,
    marketSelections: row.market_selections,
    result: row.result,
    analysisSnapshot: row.analysis_snapshot,
    candidates: row.candidates,
    status: row.status as MatchStatus,
    verificationResult: row.verification_result,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function matchRecordDomainToRow(
  record: HistoricalMatchRecord,
  options?: { source?: string; schemaVersion?: number }
): MatchRecordInsert {
  const normalized = normalizeHistoricalMatchRecord(record);

  return {
    id: normalized.id,
    match_date: normalized.matchDate,
    league: normalized.league,
    home_team: normalized.homeTeam,
    away_team: normalized.awayTeam,
    status: normalized.status,
    raw_odds: normalized.rawOdds,
    market_selections: normalized.marketSelections,
    candidates: normalized.candidates,
    analysis_snapshot: normalized.analysisSnapshot,
    result: normalized.result,
    verification_result: normalized.verificationResult,
    legacy_date: normalized.date,
    source: options?.source ?? "app",
    schema_version: options?.schemaVersion ?? 1,
    created_at: toIsoTimestamp(normalized.createdAt),
    updated_at: toIsoTimestamp(normalized.updatedAt),
  };
}
