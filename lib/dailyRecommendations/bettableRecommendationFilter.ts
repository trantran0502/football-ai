import type { DailyRecommendationRecord } from "@/lib/dailyRecommendations/dailyRecommendationTypes";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  isKickoffEligibleForBetting,
  PRE_MATCH_KICKOFF_BUFFER_MS,
} from "@/lib/scheduler/preMatchFixtureEligibility";

export function resolveBettableKickoffTime(input: {
  kickoffTime?: string | null;
  analysisSnapshot?: HistoricalMatchRecord["analysisSnapshot"];
}): string | null {
  if (input.kickoffTime?.trim()) {
    return input.kickoffTime;
  }

  return input.analysisSnapshot?.replay?.match?.matchTime ?? null;
}

export function isBettableDailyRecommendation(
  record: Pick<DailyRecommendationRecord, "kickoffTime">,
  now: Date,
  bufferMs: number = PRE_MATCH_KICKOFF_BUFFER_MS
): boolean {
  return isKickoffEligibleForBetting(record.kickoffTime, now, bufferMs);
}

export function isBettableMatchRecordForRecommendation(
  record: HistoricalMatchRecord,
  now: Date,
  bufferMs: number = PRE_MATCH_KICKOFF_BUFFER_MS
): boolean {
  const kickoffTime = resolveBettableKickoffTime({
    analysisSnapshot: record.analysisSnapshot,
  });
  return isKickoffEligibleForBetting(kickoffTime, now, bufferMs);
}

export function filterBettableDailyRecommendations(
  records: DailyRecommendationRecord[],
  now: Date = new Date(),
  bufferMs: number = PRE_MATCH_KICKOFF_BUFFER_MS
): DailyRecommendationRecord[] {
  return records.filter((record) => isBettableDailyRecommendation(record, now, bufferMs));
}
