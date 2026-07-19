import type { DailyRecommendationRecord } from "@/lib/dailyRecommendations/dailyRecommendationTypes";
import type {
  DailyRecommendationInsert,
  DailyRecommendationRow,
} from "@/lib/supabase/database.types";

function toIsoTimestamp(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return value.includes("T") ? value : `${value}T00:00:00.000Z`;
}

export function dailyRecommendationRowToDomain(
  row: DailyRecommendationRow
): DailyRecommendationRecord {
  return {
    id: row.id,
    schedulerRun: row.scheduler_run,
    fixtureId: row.fixture_id,
    matchDate: row.match_date,
    kickoffTime: row.kickoff_time,
    leagueId: row.league_id,
    leagueName: row.league_name,
    country: row.country,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    market: row.market,
    recommendation: row.recommendation,
    odds: Number(row.odds),
    confidence: row.confidence,
    score: row.score,
    rank: row.rank,
    grade: row.grade,
    reasoning: row.reasoning,
    analysisSnapshot: row.analysis_snapshot,
    matchRecordId:
      row.analysis_snapshot?.replay?.match?.matchId ?? "",
    createdAt: row.created_at,
  };
}

export function dailyRecommendationDomainToRow(
  record: DailyRecommendationRecord
): DailyRecommendationInsert {
  return {
    id: record.id,
    scheduler_run: record.schedulerRun,
    fixture_id: record.fixtureId,
    match_date: record.matchDate,
    kickoff_time: toIsoTimestamp(record.kickoffTime),
    league_id: record.leagueId,
    league_name: record.leagueName,
    country: record.country,
    home_team: record.homeTeam,
    away_team: record.awayTeam,
    market: record.market,
    recommendation: record.recommendation,
    odds: record.odds,
    confidence: record.confidence,
    score: record.score,
    rank: record.rank,
    grade: record.grade,
    reasoning: record.reasoning,
    analysis_snapshot: record.analysisSnapshot,
    created_at: toIsoTimestamp(record.createdAt) ?? new Date().toISOString(),
  };
}
