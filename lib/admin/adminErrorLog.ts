import type {
  AdminErrorCategory,
  AdminErrorLogEntry,
} from "@/lib/admin/adminDashboardTypes";

const MAX_ERROR_LOGS = 100;
const memoryLogs: AdminErrorLogEntry[] = [];

export function logAdminError(input: {
  category: AdminErrorCategory;
  message: string;
  context?: Record<string, unknown>;
}): AdminErrorLogEntry {
  const entry: AdminErrorLogEntry = {
    id: crypto.randomUUID(),
    category: input.category,
    message: input.message,
    context: input.context ?? null,
    createdAt: new Date().toISOString(),
  };

  memoryLogs.unshift(entry);
  if (memoryLogs.length > MAX_ERROR_LOGS) {
    memoryLogs.length = MAX_ERROR_LOGS;
  }

  void persistAdminError(entry);
  return entry;
}

export function listRecentAdminErrors(limit = MAX_ERROR_LOGS): AdminErrorLogEntry[] {
  return memoryLogs.slice(0, limit).map((entry) => structuredClone(entry));
}

export function resetAdminErrorLogsForTests(): void {
  memoryLogs.length = 0;
}

async function persistAdminError(entry: AdminErrorLogEntry): Promise<void> {
  try {
    if (typeof window !== "undefined") {
      return;
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    await supabase.from("admin_error_logs" as "match_records").insert({
      id: entry.id,
      category: entry.category,
      message: entry.message,
      context: entry.context,
      created_at: entry.createdAt,
    } as never);
  } catch {
    // Fail closed — error logging must not break callers.
  }
}

export async function loadRecentAdminErrorsFromSupabase(
  limit = MAX_ERROR_LOGS
): Promise<AdminErrorLogEntry[]> {
  if (memoryLogs.length > 0) {
    return listRecentAdminErrors(limit);
  }

  try {
    if (typeof window !== "undefined") {
      return [];
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    const result = await supabase
      .from("admin_error_logs" as "match_records")
      .select("id,category,message,context,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (result.error || !result.data) {
      return listRecentAdminErrors(limit);
    }

    return (result.data as unknown as Array<{
      id: string;
      category: AdminErrorCategory;
      message: string;
      context: Record<string, unknown> | null;
      created_at: string;
    }>).map((row) => ({
      id: row.id,
      category: row.category,
      message: row.message,
      context: row.context,
      createdAt: row.created_at,
    }));
  } catch {
    return listRecentAdminErrors(limit);
  }
}
