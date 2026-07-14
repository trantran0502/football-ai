import { createHistoryRepository } from "@/lib/database/historyRepository";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { listInMemoryProductionRecords } from "@/lib/production/inMemoryProductionStore";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getMatchRecordFromSupabase } from "@/lib/supabase/queries/matchRecords";
import { buildReplayResponse } from "@/lib/replay/replayEngine";
import type { ReplayResponse } from "@/lib/replay/replayTypes";

export async function findMatchRecordForReplay(
  matchId: string
): Promise<HistoricalMatchRecord | null> {
  const inMemory = listInMemoryProductionRecords().find(
    (record) => record.id === matchId
  );
  if (inMemory) {
    return inMemory;
  }

  const history = createHistoryRepository().getMatch(matchId);
  if (history) {
    return history;
  }

  if (hasSupabaseEnv()) {
    try {
      return await getMatchRecordFromSupabase(matchId);
    } catch {
      return null;
    }
  }

  return null;
}

export async function getReplayForMatch(
  matchId: string
): Promise<ReplayResponse | null> {
  const record = await findMatchRecordForReplay(matchId);
  if (!record) {
    return null;
  }
  return buildReplayResponse(record);
}
