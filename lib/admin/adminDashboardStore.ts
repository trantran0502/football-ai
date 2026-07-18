import type {
  AdminDailySummaryPayload,
  AdminSystemSnapshotPayload,
  AdminSystemSnapshotRecord,
} from "@/lib/admin/adminDashboardTypes";

const DAILY_TABLE = "admin_daily_summaries";
const SNAPSHOT_TABLE = "admin_system_snapshots";
const SNAPSHOT_KEY = "latest";

const memoryDailySummaries = new Map<string, AdminDailySummaryPayload>();
let memorySystemSnapshot: AdminSystemSnapshotPayload | null = null;
let memorySystemSnapshotUpdatedAt: string | null = null;

export async function upsertDailySummary(
  payload: AdminDailySummaryPayload
): Promise<void> {
  memoryDailySummaries.set(payload.summaryDate, structuredClone(payload));
  await writeDailySummarySupabase(payload);
}

export async function listDailySummariesFromStore(): Promise<AdminDailySummaryPayload[]> {
  const supabaseRows = await readDailySummariesSupabase();
  if (supabaseRows.length > 0) {
    for (const row of supabaseRows) {
      memoryDailySummaries.set(row.summaryDate, row);
    }
    return supabaseRows;
  }
  return [...memoryDailySummaries.values()].sort((left, right) =>
    right.summaryDate.localeCompare(left.summaryDate)
  );
}

export async function getDailySummaryFromStore(
  summaryDate: string
): Promise<AdminDailySummaryPayload | null> {
  const cached = memoryDailySummaries.get(summaryDate);
  if (cached) {
    return structuredClone(cached);
  }
  const rows = await readDailySummariesSupabase();
  return rows.find((row) => row.summaryDate === summaryDate) ?? null;
}

export async function upsertSystemSnapshot(
  payload: AdminSystemSnapshotPayload,
  updatedAt: string = new Date().toISOString()
): Promise<void> {
  memorySystemSnapshot = structuredClone(payload);
  memorySystemSnapshotUpdatedAt = updatedAt;
  await writeSystemSnapshotSupabase(payload, updatedAt);
}

export async function getSystemSnapshotFromStore(): Promise<AdminSystemSnapshotPayload | null> {
  const record = await getSystemSnapshotRecordFromStore();
  return record?.payload ?? null;
}

export async function getSystemSnapshotRecordFromStore(): Promise<AdminSystemSnapshotRecord | null> {
  if (memorySystemSnapshot) {
    return {
      payload: structuredClone(memorySystemSnapshot),
      updatedAt: memorySystemSnapshotUpdatedAt,
    };
  }
  return readSystemSnapshotSupabase();
}

export function resetAdminDashboardStoreForTests(): void {
  memoryDailySummaries.clear();
  memorySystemSnapshot = null;
  memorySystemSnapshotUpdatedAt = null;
}

export function seedDailySummaryForTests(payload: AdminDailySummaryPayload): void {
  memoryDailySummaries.set(payload.summaryDate, structuredClone(payload));
}

export function seedSystemSnapshotForTests(
  payload: AdminSystemSnapshotPayload,
  updatedAt: string = new Date().toISOString()
): void {
  memorySystemSnapshot = structuredClone(payload);
  memorySystemSnapshotUpdatedAt = updatedAt;
}

async function writeDailySummarySupabase(
  payload: AdminDailySummaryPayload
): Promise<void> {
  try {
    if (typeof window !== "undefined") {
      return;
    }
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    await supabase.from(DAILY_TABLE as "match_records").upsert({
      summary_date: payload.summaryDate,
      payload,
      updated_at: now,
      created_at: now,
    } as never);
  } catch {
    // Fail closed.
  }
}

async function readDailySummariesSupabase(): Promise<AdminDailySummaryPayload[]> {
  try {
    if (typeof window !== "undefined") {
      return [];
    }
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    const result = await supabase
      .from(DAILY_TABLE as "match_records")
      .select("summary_date,payload,updated_at")
      .order("summary_date", { ascending: false });

    if (result.error || !result.data) {
      return [];
    }

    return (result.data as unknown as Array<{ payload: AdminDailySummaryPayload }>).map(
      (row) => row.payload
    );
  } catch {
    return [];
  }
}

async function writeSystemSnapshotSupabase(
  payload: AdminSystemSnapshotPayload,
  updatedAt: string
): Promise<void> {
  try {
    if (typeof window !== "undefined") {
      return;
    }
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    await supabase.from(SNAPSHOT_TABLE as "match_records").upsert({
      snapshot_key: SNAPSHOT_KEY,
      payload,
      updated_at: updatedAt,
    } as never);
  } catch {
    // Fail closed.
  }
}

async function readSystemSnapshotSupabase(): Promise<AdminSystemSnapshotRecord | null> {
  try {
    if (typeof window !== "undefined") {
      return null;
    }
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    const result = await supabase
      .from(SNAPSHOT_TABLE as "match_records")
      .select("payload,updated_at")
      .eq("snapshot_key", SNAPSHOT_KEY)
      .maybeSingle();

    if (result.error || !result.data) {
      return null;
    }

    const row = result.data as unknown as {
      payload: AdminSystemSnapshotPayload;
      updated_at: string | null;
    };

    return {
      payload: row.payload,
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

export async function countDailySummariesInSupabase(): Promise<number> {
  try {
    if (typeof window !== "undefined") {
      return memoryDailySummaries.size;
    }
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    const result = await supabase
      .from(DAILY_TABLE as "match_records")
      .select("*", { count: "exact", head: true });
    return result.count ?? memoryDailySummaries.size;
  } catch {
    return memoryDailySummaries.size;
  }
}
