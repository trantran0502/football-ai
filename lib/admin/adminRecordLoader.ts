import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { listInMemoryProductionRecords } from "@/lib/production/inMemoryProductionStore";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { listMatchRecordsFromSupabase } from "@/lib/supabase/queries/matchRecords";

export async function loadAdminMatchRecords(): Promise<HistoricalMatchRecord[]> {
  try {
    if (typeof window !== "undefined") {
      return listInMemoryProductionRecords();
    }

    if (hasSupabaseEnv()) {
      const { records } = await listMatchRecordsFromSupabase();
      if (records.length > 0) {
        return records;
      }
    }
  } catch {
    // Fall back to in-memory records.
  }

  return listInMemoryProductionRecords();
}
