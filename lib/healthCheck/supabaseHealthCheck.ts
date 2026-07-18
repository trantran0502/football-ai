import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateHistoricalMatchId,
  type HistoricalMatchRecord,
} from "@/lib/database/matchSchema";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseEnv, hasSupabaseEnv, type SupabaseEnv } from "@/lib/supabase/env";
import {
  insertMatchRecordToSupabase,
  updateMatchRecordInSupabase,
} from "@/lib/supabase/services/matchRecordService";
import type { Database } from "@/lib/supabase/database.types";
import type { HealthCheckItem, HealthCheckStatus } from "@/lib/healthCheck/types";

import {
  SUPABASE_TABLE_REGISTRY,
} from "@/lib/supabase/schemaRegistry";
import type { SupabaseTableSpec } from "@/lib/supabase/schemaRegistry";

export const CONNECTION_PROBE_MAX_ATTEMPTS = 4;

/** Delay before attempts 2, 3, and 4 (ms). Attempt 1 runs immediately. */
export const CONNECTION_PROBE_RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

export interface ConnectionProbeQueryResult {
  error: { message: string } | null;
  data: unknown[] | null;
}

export interface ConnectionProbeRetryResult {
  connected: boolean;
  probeEvidence: string;
  attemptCount: number;
  lastError: string | null;
}

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

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatConnectionProbeEvidence(env: SupabaseEnv, probe: ConnectionProbeQueryResult): string {
  return probe.error
    ? probe.error.message
    : `host=${new URL(env.url).host} rows=${probe.data?.length ?? 0}`;
}

export async function runConnectionProbeWithRetry(input: {
  probe: () => Promise<ConnectionProbeQueryResult>;
  env: SupabaseEnv;
  sleep?: (ms: number) => Promise<void>;
  retryDelaysBeforeAttemptMs?: readonly number[];
  maxAttempts?: number;
}): Promise<ConnectionProbeRetryResult> {
  const sleep = input.sleep ?? defaultSleep;
  const retryDelays = input.retryDelaysBeforeAttemptMs ?? CONNECTION_PROBE_RETRY_DELAYS_MS;
  const maxAttempts = input.maxAttempts ?? CONNECTION_PROBE_MAX_ATTEMPTS;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      const delayMs = retryDelays[attempt - 1] ?? retryDelays[retryDelays.length - 1] ?? 0;
      await sleep(delayMs);
    }

    try {
      const probe = await input.probe();
      if (!probe.error) {
        return {
          connected: true,
          probeEvidence: formatConnectionProbeEvidence(input.env, probe),
          attemptCount: attempt + 1,
          lastError: null,
        };
      }
      lastError = probe.error.message;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    connected: false,
    probeEvidence: lastError ?? "Connection probe failed",
    attemptCount: maxAttempts,
    lastError,
  };
}

async function probeTableExists(
  supabase: SupabaseClient<Database>,
  spec: SupabaseTableSpec
): Promise<boolean> {
  const result = await supabase
    .from(spec.name as "match_records")
    .select(spec.probeColumn)
    .limit(1);
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

export interface SupabaseHealthCheckDeps {
  hasSupabaseEnv: () => boolean;
  getSupabaseEnv: () => SupabaseEnv;
  getSupabaseAdmin: () => SupabaseClient<Database>;
  insertMatchRecord: typeof insertMatchRecordToSupabase;
  updateMatchRecord: typeof updateMatchRecordInSupabase;
  sleep: (ms: number) => Promise<void>;
  runConnectionProbe: (input: {
    supabase: SupabaseClient<Database>;
    env: SupabaseEnv;
    sleep: (ms: number) => Promise<void>;
  }) => Promise<ConnectionProbeRetryResult>;
}

const defaultSupabaseHealthCheckDeps: SupabaseHealthCheckDeps = {
  hasSupabaseEnv,
  getSupabaseEnv,
  getSupabaseAdmin,
  insertMatchRecord: insertMatchRecordToSupabase,
  updateMatchRecord: updateMatchRecordInSupabase,
  sleep: defaultSleep,
  runConnectionProbe: async ({ supabase, env, sleep }) =>
    runConnectionProbeWithRetry({
      env,
      sleep,
      probe: async () => {
        const result = await supabase.from("match_records").select("id").limit(1);
        return {
          error: result.error ? { message: result.error.message } : null,
          data: result.data,
        };
      },
    }),
};

function mergeSupabaseHealthCheckDeps(
  overrides?: Partial<SupabaseHealthCheckDeps>
): SupabaseHealthCheckDeps {
  return {
    ...defaultSupabaseHealthCheckDeps,
    ...overrides,
  };
}

export async function runSupabaseHealthChecks(
  depsOverride?: Partial<SupabaseHealthCheckDeps>
): Promise<{
  items: HealthCheckItem[];
  connected: boolean;
  crudPassed: boolean;
}> {
  const deps = mergeSupabaseHealthCheckDeps(depsOverride);
  const items: HealthCheckItem[] = [];
  let connected = false;
  let crudPassed = false;

  if (!deps.hasSupabaseEnv()) {
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

  const env = deps.getSupabaseEnv();
  const supabase = deps.getSupabaseAdmin();
  const connection = await deps.runConnectionProbe({ supabase, env, sleep: deps.sleep });

  connected = connection.connected;

  if (!connected) {
    items.push(
      item(
        "Supabase",
        "Connection probe",
        "FAIL",
        connection.probeEvidence,
        connection.lastError ?? connection.probeEvidence
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

  items.push(
    item(
      "Supabase",
      "Connection probe",
      "PASS",
      connection.probeEvidence
    )
  );

  for (const spec of SUPABASE_TABLE_REGISTRY) {
    const exists = await probeTableExists(supabase, spec);
    items.push(
      item(
        "Supabase Schema",
        spec.name,
        exists ? "PASS" : "FAIL",
        exists ? "SELECT probe succeeded" : `Table missing — apply ${spec.migrationFile}`
      )
    );
  }

  let insertedId: string | null = null;
  try {
    const record = buildHealthCheckRecord();
    const inserted = await deps.insertMatchRecord(record);
    insertedId = inserted.id;

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

    const updated = await deps.updateMatchRecord({
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
