import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { listInMemoryProductionRecords } from "@/lib/production/inMemoryProductionStore";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import {
  listMatchRecordsFromSupabase,
  listMatchRecordsFromSupabaseByDateRange,
} from "@/lib/supabase/queries/matchRecords";

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

export async function loadAdminMatchRecordsByDateRange(input: {
  fromDate: string;
  toDate: string;
}): Promise<HistoricalMatchRecord[]> {
  try {
    if (typeof window !== "undefined") {
      return listInMemoryProductionRecords().filter(
        (record) =>
          record.matchDate >= input.fromDate && record.matchDate <= input.toDate
      );
    }

    if (hasSupabaseEnv()) {
      const { records } = await listMatchRecordsFromSupabaseByDateRange(input);
      return records;
    }
  } catch {
    // Fall back to in-memory records.
  }

  return listInMemoryProductionRecords().filter(
    (record) =>
      record.matchDate >= input.fromDate && record.matchDate <= input.toDate
  );
}
