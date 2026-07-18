import type { AnalysisReport } from "@/lib/analysis/types";
import {
  clearMatchHistoryLocally,
  loadMatchHistoryComposite,
  saveMatchFromAnalysisComposite,
  verifyMatchComposite,
  type MatchRecordWriteResult,
} from "@/lib/database/compositeMatchStorage";
import type {
  HistoricalMatchRecord,
  MatchHistoryStats,
  UpdateMatchResultInput,
} from "@/lib/database/matchSchema";
import type { StorageHealth } from "@/lib/storage/storageStatus";

/**
 * 瀏覽器端持久化：Production 必須寫入 Supabase；Development 才允許 LocalStorage fallback。
 */
export async function persistAnalysisToHistory(
  rawOdds: string,
  report: AnalysisReport
): Promise<MatchRecordWriteResult> {
  return saveMatchFromAnalysisComposite(rawOdds, report);
}

export async function loadPersistedHistory(): Promise<{
  matches: HistoricalMatchRecord[];
  stats: MatchHistoryStats;
  storage: StorageHealth;
}> {
  return loadMatchHistoryComposite();
}

export async function verifyPersistedMatch(
  matchId: string,
  input: UpdateMatchResultInput
): Promise<{
  record: HistoricalMatchRecord | null;
  storage: StorageHealth;
}> {
  return verifyMatchComposite(matchId, input);
}

export function clearPersistedHistory(): void {
  clearMatchHistoryLocally();
}
