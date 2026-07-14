import { buildMatchHistoryStats } from "@/lib/database/matchSchema";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  assertSupabaseCount,
  assertSupabaseData,
} from "@/lib/supabase/errors";
import { matchRecordRowToDomain } from "@/lib/supabase/mappers/matchRecordMapper";

export async function listMatchRecordsFromSupabase() {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("match_records")
    .select("*")
    .order("created_at", { ascending: false });

  const data = assertSupabaseData(result);

  const records = (data ?? []).map(matchRecordRowToDomain);
  return {
    records,
    stats: buildMatchHistoryStats(records),
  };
}

export async function getMatchRecordFromSupabase(id: string) {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("match_records")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const data = assertSupabaseData(result);
  return data ? matchRecordRowToDomain(data) : null;
}

export async function countMatchRecordsFromSupabase(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("match_records")
    .select("*", { count: "exact", head: true });

  return assertSupabaseCount(result);
}
