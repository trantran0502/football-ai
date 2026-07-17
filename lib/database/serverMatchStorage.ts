import type { AnalysisReport } from "@/lib/analysis/types";
import type {
  HistoricalMatchRecord,
  MatchHistoryStats,
  SaveMatchOutcome,
  UpdateMatchResultInput,
} from "@/lib/database/matchSchema";
import {
  listMatchRecordsFromSupabase,
} from "@/lib/supabase/queries/matchRecords";
import {
  saveMatchFromAnalysisInSupabase,
  verifyMatchInSupabase,
} from "@/lib/supabase/services/matchRecordService";
import type {
  MatchHistoryLoadResult,
  MatchRecordWriteResult,
} from "@/lib/database/compositeMatchStorage";
import type { MatchRecordVerifyResult } from "@/lib/database/matchRecordApiTypes";

export async function saveMatchFromAnalysisServerSide(
  rawOdds: string,
  report: AnalysisReport
): Promise<MatchRecordWriteResult> {
  const matchDate = new Date().toISOString().split("T")[0];
  const outcome = await saveMatchFromAnalysisInSupabase(rawOdds, report, matchDate);
  return {
    ...outcome,
    storage: "supabase",
  };
}

export async function loadMatchHistoryServerSide(): Promise<MatchHistoryLoadResult> {
  const { records, stats } = await listMatchRecordsFromSupabase();
  return {
    matches: records,
    stats,
    storage: "supabase",
  };
}

export async function verifyMatchServerSide(
  matchId: string,
  input: UpdateMatchResultInput
): Promise<MatchRecordVerifyResult> {
  const record = await verifyMatchInSupabase(matchId, input);
  return {
    record,
    storage: record ? "supabase" : "failed",
  };
}

export type { SaveMatchOutcome, HistoricalMatchRecord, MatchHistoryStats };
