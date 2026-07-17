import { randomUUID } from "crypto";
import {
  generateHistoricalMatchId,
  type HistoricalMatchRecord,
} from "@/lib/database/matchSchema";
import {
  getSupabaseAdmin,
  resetSupabaseAdminForTests,
} from "@/lib/supabase/admin";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import {
  insertMatchRecordToSupabase,
  updateMatchRecordInSupabase,
} from "@/lib/supabase/services/matchRecordService";
import type { HealthCheckItem, HealthCheckStatus } from "@/lib/healthCheck/types";

const MIGRATED_TABLES = [
  "match_records",
  "beta_recommendations",
  "beta_rolling_reports",
  "recommendation_learning",
  "team_profiles",
  "execution_logs",
  "scheduler_state",
  "admin_daily_summaries",
  "admin_system_snapshots",
  "admin_error_logs",
  "security_rate_limit_buckets",
] as const;

const LEGACY_EXPECTED_TABLES = [
  "fixtures",
  "market_snapshots",
  "recommendations",
  "validation_results",
  "evidence_reports",
  "evidence_performance",
  "evidence_weight_reports",
  "ai_learning_reports",
  "provider_performance",
  "historical_fundamentals",
  "scheduler_runs",
] as const;

function item(
  section: string,
  name: string,
  status: HealthCheckStatus,
  evidence?: string,
  message?: string
): HealthCheckItem {
  return {
    id: `${section}:${name}`.replace(/\s+/g, "-").toLowerCase(),
    section,
    name,
    status,
    evidence,
    message,
  };
}

async function probeTableExists(table: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const result = await supabase.from(table as "match_records").select("id").limit(1);
  if (result.error) {
    const code = result.error.code ?? "";
    const message = result.error.message ?? "";
    if (code === "42P01" || message.includes("does not exist")) {
      return false;
    }
  }
  return !result.error;
}

function buildHealthCheckRecord(): HistoricalMatchRecord {
  const suffix = randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  return {
    id: generateHistoricalMatchId(),
    date: "2099-01-01",
    matchDate: "2099-01-01",
    league: "HEALTH_CHECK",
    homeTeam: `HC-Home-${suffix}`,
    awayTeam: `HC-Away-${suffix}`,
    rawOdds: "health-check-minimal",
    marketSelections: [],
    result: null,
    analysisSnapshot: null,
    candidates: [],
    status: "PENDING",
    verificationResult: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function runSupabaseHealthChecks(): Promise<{
  items: HealthCheckItem[];
  connected: boolean;
  crudPassed: boolean;
}> {
  const items: HealthCheckItem[] = [];
  let connected = false;
  let crudPassed = false;

  if (!hasSupabaseEnv()) {
    items.push(
      item(
        "Supabase",
        "Environment configured",
        "NOT CONFIGURED",
        undefined,
        "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing"
      )
    );
    return { items, connected, crudPassed };
  }

  resetSupabaseAdminForTests();

  let probeEvidence = "";
  try {
    const env = getSupabaseEnv();
    const supabase = getSupabaseAdmin();
    const probe = await supabase.from("match_records").select("id").limit(1);
    connected = !probe.error;
    probeEvidence = probe.error
      ? probe.error.message
      : `host=${new URL(env.url).host} rows=${probe.data?.length ?? 0}`;
  } catch (firstError) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      resetSupabaseAdminForTests();
      const env = getSupabaseEnv();
      const supabase = getSupabaseAdmin();
      const probe = await supabase.from("match_records").select("id").limit(1);
      connected = !probe.error;
      probeEvidence = probe.error
        ? probe.error.message
        : `host=${new URL(env.url).host} rows=${probe.data?.length ?? 0}`;
    } catch (retryError) {
      items.push(
        item(
          "Supabase",
          "Connection probe",
          "FAIL",
          undefined,
          retryError instanceof Error ? retryError.message : String(retryError)
        )
      );
      items.push(
        item("Supabase", "Schema tables", "NOT TESTABLE", undefined, "Connection failed")
      );
      items.push(
        item("Supabase", "CRUD test", "NOT TESTABLE", undefined, "Connection failed")
      );
      return { items, connected, crudPassed };
    }
  }

  items.push(
    item(
      "Supabase",
      "Connection probe",
      connected ? "PASS" : "FAIL",
      probeEvidence
    )
  );

  if (!connected) {
    items.push(
      item("Supabase", "Schema tables", "NOT TESTABLE", undefined, "Connection failed")
    );
    items.push(
      item("Supabase", "CRUD test", "NOT TESTABLE", undefined, "Connection failed")
    );
    return { items, connected, crudPassed };
  }

  for (const table of MIGRATED_TABLES) {
    const exists = await probeTableExists(table);
    items.push(
      item(
        "Supabase Schema",
        table,
        exists ? "PASS" : "FAIL",
        exists ? "SELECT probe succeeded" : "Table missing or inaccessible"
      )
    );
  }

  for (const table of LEGACY_EXPECTED_TABLES) {
    const exists = await probeTableExists(table);
    items.push(
      item(
        "Supabase Schema",
        `${table} (legacy spec)`,
        exists ? "PASS" : "WARNING",
        exists
          ? "Table exists"
          : "Not migrated; data stored in JSON columns or in-memory engines"
      )
    );
  }

  let insertedId: string | null = null;
  try {
    const record = buildHealthCheckRecord();
    const inserted = await insertMatchRecordToSupabase(record);
    insertedId = inserted.id;

    const supabase = getSupabaseAdmin();
    const selectResult = await supabase
      .from("match_records")
      .select("id, league, home_team")
      .eq("id", inserted.id)
      .maybeSingle();

    items.push(
      item(
        "Supabase CRUD",
        "insert match_records",
        "PASS",
        `id=${inserted.id}`
      )
    );
    items.push(
      item(
        "Supabase CRUD",
        "select match_records",
        selectResult.error || !selectResult.data ? "FAIL" : "PASS",
        selectResult.error?.message ??
          `league=${String((selectResult.data as { league?: string } | null)?.league ?? "")}`
      )
    );

    const updated = await updateMatchRecordInSupabase({
      ...inserted,
      league: "HEALTH_CHECK_UPDATED",
      updatedAt: new Date().toISOString(),
    });

    items.push(
      item(
        "Supabase CRUD",
        "update match_records",
        updated?.league === "HEALTH_CHECK_UPDATED" ? "PASS" : "FAIL",
        updated?.league
      )
    );

    const deleteResult = await supabase
      .from("match_records")
      .delete()
      .eq("id", inserted.id);

    items.push(
      item(
        "Supabase CRUD",
        "delete match_records",
        deleteResult.error ? "FAIL" : "PASS",
        deleteResult.error?.message ?? "test row removed"
      )
    );

    crudPassed = !selectResult.error && Boolean(updated) && !deleteResult.error;
  } catch (error) {
    items.push(
      item(
        "Supabase CRUD",
        "CRUD cycle",
        "FAIL",
        undefined,
        error instanceof Error ? error.message : String(error)
      )
    );
  } finally {
    if (insertedId) {
      try {
        const supabase = getSupabaseAdmin();
        await supabase.from("match_records").delete().eq("id", insertedId);
      } catch {
        // best-effort cleanup
      }
    }
  }

  items.push(
    item(
      "Supabase",
      "Embedded models note",
      "WARNING",
      "Fixture/Market/Evidence/Learning reports are JSON-embedded, not separate tables"
    )
  );

  return { items, connected, crudPassed };
}

export function summarizeSupabaseStatus(
  items: HealthCheckItem[],
  connected: boolean,
  crudPassed: boolean
): HealthCheckStatus {
  if (!hasSupabaseEnv()) {
    return "NOT CONFIGURED";
  }
  if (!connected) {
    return "FAIL";
  }
  const schemaFails = items.some(
    (entry) =>
      entry.section === "Supabase Schema" &&
      entry.status === "FAIL" &&
      !entry.name.includes("legacy")
  );
  if (schemaFails || !crudPassed) {
    return "FAIL";
  }
  return "PASS";
}
