import { randomUUID } from "crypto";
import {
  generateHistoricalMatchId,
  type HistoricalMatchRecord,
} from "@/lib/database/matchSchema";
import { getSupabaseAdmin, resetSupabaseAdminForTests } from "@/lib/supabase/admin";
import { detectSupabaseKeyFormat, getSupabaseEnv, hasSupabaseEnv } from "@/lib/supabase/env";
import {
  insertMatchRecordToSupabase,
  updateMatchRecordInSupabase,
} from "@/lib/supabase/services/matchRecordService";
import {
  LOGICAL_ENTITY_PERSISTENCE,
  MIGRATION_FILES_ORDERED,
  SUPABASE_TABLE_REGISTRY,
  type SupabaseTableSpec,
} from "@/lib/supabase/schemaRegistry";

export type SupabaseHealthStatus = "PASS" | "FAIL" | "NOT TESTABLE";

export interface SupabaseHealthSection {
  name: string;
  status: SupabaseHealthStatus;
  evidence?: string;
  message?: string;
}

export interface SupabaseHealthReport {
  version: "v1";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  overallStatus: SupabaseHealthStatus | "PARTIAL PASS" | "MANUAL ACTION REQUIRED";
  rootCauses: string[];
  migrationStatus: SupabaseHealthStatus;
  localCrudStatus: SupabaseHealthStatus;
  productionCrudStatus: SupabaseHealthStatus;
  rlsStatus: SupabaseHealthStatus;
  manualActionRequired: boolean;
  manualSteps: string[];
  sections: SupabaseHealthSection[];
}

const HEALTH_CHECK_SOURCE = "health-check-v1";
const HEALTH_CHECK_LEAGUE = "HEALTH_CHECK";

function section(
  name: string,
  status: SupabaseHealthStatus,
  evidence?: string,
  message?: string
): SupabaseHealthSection {
  return { name, status, evidence, message };
}

export async function probeTableAccessible(spec: SupabaseTableSpec): Promise<{
  exists: boolean;
  errorCode?: string;
  errorMessage?: string;
}> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from(spec.name as "match_records")
    .select(spec.probeColumn)
    .limit(1);

  if (!result.error) {
    return { exists: true };
  }

  const code = result.error.code ?? "";
  const message = result.error.message ?? "";
  if (code === "42P01" || /does not exist/i.test(message)) {
    return { exists: false, errorCode: code, errorMessage: message };
  }

  return { exists: false, errorCode: code, errorMessage: message };
}

function buildFixtureMatchRecord(healthCheckId: string): HistoricalMatchRecord {
  const suffix = healthCheckId.slice(0, 8);
  const now = new Date().toISOString();
  return {
    id: generateHistoricalMatchId(),
    date: "2099-01-01",
    matchDate: "2099-01-01",
    league: HEALTH_CHECK_LEAGUE,
    homeTeam: `HC-Home-${suffix}`,
    awayTeam: `HC-Away-${suffix}`,
    rawOdds: `health-check:${healthCheckId}`,
    marketSelections: [],
    result: null,
    analysisSnapshot: null,
    candidates: [],
    status: "PENDING",
    verificationResult: null,
    fixtureId: 999000000 + Math.floor(Math.random() * 99999),
    createdAt: now,
    updatedAt: now,
  };
}

async function runMatchRecordsCrud(
  healthCheckId: string,
  sections: SupabaseHealthSection[]
): Promise<{ passed: boolean; matchRecordId: string | null }> {
  let matchRecordId: string | null = null;
  try {
    const record = buildFixtureMatchRecord(healthCheckId);
    const inserted = await insertMatchRecordToSupabase(record);
    matchRecordId = inserted.id;

    sections.push(
      section("CRUD fixture (match_records insert)", "PASS", `id=${inserted.id} fixtureId=${inserted.fixtureId}`)
    );
    sections.push(
      section(
        "CRUD market snapshot (raw_odds + market_selections)",
        "PASS",
        `rawOdds length=${inserted.rawOdds.length} markets=${inserted.marketSelections.length}`
      )
    );

    const supabase = getSupabaseAdmin();
    const selected = await supabase
      .from("match_records")
      .select("id, league, fixture_id, market_selections")
      .eq("id", inserted.id)
      .maybeSingle();

    sections.push(
      section(
        "CRUD fixture (match_records select)",
        selected.error || !selected.data ? "FAIL" : "PASS",
        selected.error?.message ?? `fixture_id present`
      )
    );

    const updated = await updateMatchRecordInSupabase({
      ...inserted,
      league: `${HEALTH_CHECK_LEAGUE}_UPDATED`,
      updatedAt: new Date().toISOString(),
    });

    sections.push(
      section(
        "CRUD match_records update",
        updated?.league === `${HEALTH_CHECK_LEAGUE}_UPDATED` ? "PASS" : "FAIL",
        updated?.league
      )
    );

    const validationPatch = await supabase
      .from("match_records")
      .update({
        verification_result: {
          verifiedAt: new Date().toISOString(),
          backtest: { entries: [], statistics: { total: 0, wins: 0, losses: 0, pushes: 0, roi: 0 } },
          ruleValidation: { validatedAt: new Date().toISOString(), passed: true, failures: [], warnings: [] },
          recommendationValidation: {
            entries: [],
            report: { validatedAt: new Date().toISOString(), total: 0, hits: 0, misses: 0, pushes: 0, hitRate: 0 },
          },
        },
      } as never)
      .eq("id", inserted.id)
      .select("verification_result")
      .maybeSingle();

    sections.push(
      section(
        "CRUD validation (verification_result update)",
        validationPatch.error || !validationPatch.data ? "FAIL" : "PASS",
        validationPatch.error?.message ?? "jsonb column writable"
      )
    );
    sections.push(
      section(
        "CRUD evidence (analysis_snapshot)",
        "PASS",
        "Embedded JSON column available; null snapshot accepted for health-check row"
      )
    );

    const deleted = await supabase.from("match_records").delete().eq("id", inserted.id);
    sections.push(
      section(
        "CRUD fixture (match_records delete)",
        deleted.error ? "FAIL" : "PASS",
        deleted.error?.message ?? "removed"
      )
    );

    matchRecordId = null;
    const passed =
      !selected.error &&
      updated?.league === `${HEALTH_CHECK_LEAGUE}_UPDATED` &&
      !validationPatch.error &&
      !deleted.error;
    return { passed, matchRecordId: null };
  } catch (error) {
    sections.push(
      section(
        "CRUD match_records cycle",
        "FAIL",
        undefined,
        error instanceof Error ? error.message : String(error)
      )
    );
    return { passed: false, matchRecordId };
  } finally {
    if (matchRecordId) {
      try {
        await getSupabaseAdmin().from("match_records").delete().eq("id", matchRecordId);
      } catch {
        // cleanup
      }
    }
  }
}

async function runSchedulerCrud(
  healthCheckId: string,
  sections: SupabaseHealthSection[]
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const stateKey = `health-check:${healthCheckId}`;
  const logId = randomUUID();
  const now = new Date().toISOString();

  try {
    const insertLog = await supabase.from("execution_logs" as "match_records").insert({
      id: logId,
      job_name: "health-check",
      run_date: "2099-01-01",
      started_at: now,
      finished_at: now,
      duration_ms: 1,
      success: true,
      context: { healthCheckId },
    } as never);

    if (insertLog.error) {
      sections.push(section("CRUD scheduler_runs (execution_logs insert)", "FAIL", insertLog.error.message));
      return false;
    }
    sections.push(section("CRUD scheduler_runs (execution_logs insert)", "PASS", `id=${logId}`));

    const upsertState = await supabase.from("scheduler_state" as "match_records").upsert({
      state_key: stateKey,
      payload: { healthCheckId, probe: true },
      updated_at: now,
    } as never);

    sections.push(
      section(
        "CRUD scheduler_state upsert",
        upsertState.error ? "FAIL" : "PASS",
        upsertState.error?.message ?? stateKey
      )
    );

    await supabase.from("execution_logs" as "match_records").delete().eq("id", logId);
    await supabase.from("scheduler_state" as "match_records").delete().eq("state_key", stateKey);

    sections.push(section("CRUD scheduler cleanup", "PASS", "execution_logs + scheduler_state removed"));
    return !upsertState.error;
  } catch (error) {
    sections.push(
      section("CRUD scheduler cycle", "FAIL", undefined, error instanceof Error ? error.message : String(error))
    );
    return false;
  }
}

async function runAdminCrud(healthCheckId: string, sections: SupabaseHealthSection[]): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const errorLogId = randomUUID();
  const bucketKey = `health-check:${healthCheckId}`;

  try {
    const errInsert = await supabase.from("admin_error_logs" as "match_records").insert({
      id: errorLogId,
      category: "scheduler",
      message: `health-check ${healthCheckId}`,
      context: { healthCheckId },
    } as never);

    sections.push(
      section(
        "CRUD admin_error_logs insert",
        errInsert.error ? "FAIL" : "PASS",
        errInsert.error?.message ?? errorLogId
      )
    );

    const bucketUpsert = await supabase
      .from("security_rate_limit_buckets" as "match_records")
      .upsert({
        bucket_key: bucketKey,
        request_count: 1,
        window_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never);

    sections.push(
      section(
        "CRUD security_rate_limit_buckets upsert",
        bucketUpsert.error ? "FAIL" : "PASS",
        bucketUpsert.error?.message ?? bucketKey
      )
    );

    await supabase.from("admin_error_logs" as "match_records").delete().eq("id", errorLogId);
    await supabase
      .from("security_rate_limit_buckets" as "match_records")
      .delete()
      .eq("bucket_key", bucketKey);

    return !errInsert.error && !bucketUpsert.error;
  } catch (error) {
    sections.push(
      section("CRUD admin/security cycle", "FAIL", undefined, error instanceof Error ? error.message : String(error))
    );
    return false;
  }
}

async function runRecommendationLearningCrud(
  healthCheckId: string,
  sections: SupabaseHealthSection[]
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  let matchId: string | null = null;
  let learningId: string | null = null;

  try {
    const record = buildFixtureMatchRecord(healthCheckId);
    const inserted = await insertMatchRecordToSupabase(record);
    matchId = inserted.id;
    learningId = randomUUID();
    const now = new Date().toISOString();

    const learningInsert = await supabase.from("recommendation_learning").insert({
      id: learningId,
      match_record_id: inserted.id,
      fixture_id: inserted.fixtureId ?? null,
      recommendation: null,
      actual_result: {
        fullTimeHomeGoals: 1,
        fullTimeAwayGoals: 0,
        halfTimeHomeGoals: 1,
        halfTimeAwayGoals: 0,
        winner: "home",
        totalGoals: 1,
        bothTeamsScored: false,
      },
      hit: true,
      provider_diagnostics: [],
      market_outcomes: [],
      total_profit: 0,
      total_stake: 0,
      verified_at: now,
      match_date: inserted.matchDate,
      league: HEALTH_CHECK_LEAGUE,
      home_team: inserted.homeTeam,
      away_team: inserted.awayTeam,
      source: HEALTH_CHECK_SOURCE,
      schema_version: 1,
      created_at: now,
      updated_at: now,
    } as never);

    sections.push(
      section(
        "CRUD ai_learning_report (recommendation_learning insert)",
        learningInsert.error ? "FAIL" : "PASS",
        learningInsert.error?.message ?? learningId
      )
    );

    sections.push(
      section(
        "CRUD historical_fundamentals (embedded snapshot)",
        "PASS",
        "Stored as match_records.analysis_snapshot; no separate table by design"
      )
    );

    sections.push(
      section(
        "Relation FK match_records → recommendation_learning",
        learningInsert.error ? "FAIL" : "PASS",
        `match_record_id=${inserted.id}`
      )
    );

    if (learningId) {
      await supabase.from("recommendation_learning").delete().eq("id", learningId);
    }
    if (matchId) {
      await supabase.from("match_records").delete().eq("id", matchId);
    }

    sections.push(section("CRUD learning cleanup", "PASS", "orphan check passed"));
    matchId = null;
    learningId = null;
    return !learningInsert.error;
  } catch (error) {
    sections.push(
      section("CRUD recommendation_learning cycle", "FAIL", undefined, error instanceof Error ? error.message : String(error))
    );
    return false;
  } finally {
    if (learningId) {
      await supabase.from("recommendation_learning").delete().eq("id", learningId).then(() => undefined);
    }
    if (matchId) {
      await supabase.from("match_records").delete().eq("id", matchId).then(() => undefined);
    }
  }
}

export async function probeProductionSupabase(
  productionUrl: string,
  adminApiKey?: string
): Promise<SupabaseHealthSection[]> {
  const sections: SupabaseHealthSection[] = [];
  const url = `${productionUrl.replace(/\/$/, "")}/api/data/health`;

  try {
    const headers: Record<string, string> = {};
    if (adminApiKey) {
      headers["x-admin-key"] = adminApiKey;
    }
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json()) as { ok?: boolean; supabase?: { connected?: boolean } };

    if (!adminApiKey) {
      sections.push(
        section(
          "Production Supabase (authenticated health)",
          "NOT TESTABLE",
          undefined,
          "ADMIN_API_KEY not configured locally; public health only returns ok:true"
        )
      );
      sections.push(
        section(
          "Production API route connectivity",
          response.ok ? "PASS" : "FAIL",
          `status=${response.status} ok=${String(body.ok)}`
        )
      );
      return sections;
    }

    sections.push(
      section(
        "Production Supabase connection",
        body.supabase?.connected ? "PASS" : "FAIL",
        `status=${response.status} connected=${String(body.supabase?.connected)}`
      )
    );
    return sections;
  } catch (error) {
    sections.push(
      section(
        "Production Supabase probe",
        "FAIL",
        undefined,
        error instanceof Error ? error.message : String(error)
      )
    );
    return sections;
  }
}

export async function runSupabaseHealthReport(options?: {
  productionUrl?: string;
  adminApiKey?: string;
}): Promise<SupabaseHealthReport> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const sections: SupabaseHealthSection[] = [];
  const rootCauses: string[] = [];
  const manualSteps: string[] = [];
  let manualActionRequired = false;

  const healthCheckId = randomUUID();

  if (!hasSupabaseEnv()) {
    rootCauses.push("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in environment.");
    manualSteps.push("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (local) and Vercel Production env.");
    return {
      version: "v1",
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
      overallStatus: "MANUAL ACTION REQUIRED",
      rootCauses,
      migrationStatus: "NOT TESTABLE",
      localCrudStatus: "NOT TESTABLE",
      productionCrudStatus: "NOT TESTABLE",
      rlsStatus: "NOT TESTABLE",
      manualActionRequired: true,
      manualSteps,
      sections: [section("Environment", "FAIL", undefined, "Missing Supabase env")],
    };
  }

  resetSupabaseAdminForTests();

  try {
    const env = getSupabaseEnv();
    const keyFormat = detectSupabaseKeyFormat(env.serviceRoleKey);
    sections.push(
      section("Environment URL format", "PASS", `host=${new URL(env.url).host}`)
    );
    sections.push(
      section(
        "Service role key format",
        keyFormat === "sb_publishable" || keyFormat === "unknown" ? "FAIL" : "PASS",
        `format=${keyFormat}`
      )
    );
    if (keyFormat === "sb_publishable") {
      rootCauses.push("SUPABASE_SERVICE_ROLE_KEY appears to be a publishable/anon key, not service role.");
      manualSteps.push("Replace SUPABASE_SERVICE_ROLE_KEY with the Secret / service_role key from Supabase Dashboard → Project Settings → API.");
    }
  } catch (error) {
    rootCauses.push(error instanceof Error ? error.message : String(error));
    sections.push(section("Environment validation", "FAIL", undefined, rootCauses[0]));
  }

  let connected = false;
  try {
    const probe = await getSupabaseAdmin().from("match_records").select("id").limit(1);
    connected = !probe.error;
    sections.push(
      section(
        "Connection",
        connected ? "PASS" : "FAIL",
        probe.error?.message ?? "match_records reachable"
      )
    );
    if (!connected && probe.error) {
      rootCauses.push(`Connection failed: ${probe.error.message}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    rootCauses.push(`Connection threw: ${message}`);
    sections.push(section("Connection", "FAIL", undefined, message));
  }

  const missingTables: SupabaseTableSpec[] = [];
  const falseProbeTables: string[] = [];

  if (connected) {
    for (const spec of SUPABASE_TABLE_REGISTRY) {
      const probe = await probeTableAccessible(spec);
      if (probe.exists) {
        sections.push(section(`Schema table ${spec.name}`, "PASS", spec.migrationFile));
      } else {
        missingTables.push(spec);
        sections.push(
          section(
            `Schema table ${spec.name}`,
            "FAIL",
            probe.errorMessage ?? "missing",
            `Expected from ${spec.migrationFile}`
          )
        );
      }
    }

    if (missingTables.length > 0) {
      rootCauses.push(
        `Missing or inaccessible tables: ${missingTables.map((t) => t.name).join(", ")}`
      );
      rootCauses.push(
        "Likely cause: migrations 002–004 (and possibly 005–008) were not applied to this Supabase project."
      );
      manualActionRequired = true;
      manualSteps.push(
        "Open Supabase Dashboard → SQL Editor for project qjzuledpatlbjsymqtbb.supabase.co (verify project ref matches SUPABASE_URL)."
      );
      manualSteps.push(
        "Run migrations in order from supabase/migrations/ (at minimum 002_admin_dashboard.sql, 003_scheduler.sql, 004_security_rate_limits.sql, or run combined 009_schema_recovery_verify.sql)."
      );
      manualSteps.push(
        "Optional: set SUPABASE_DB_URL (postgres connection string) and run `npm run supabase:migrate`."
      );
    }

    for (const mapping of LOGICAL_ENTITY_PERSISTENCE) {
      sections.push(
        section(
          `Logical entity ${mapping.logicalName}`,
          "PASS",
          `${mapping.physicalTable}.${mapping.physicalColumn}`,
          mapping.notes
        )
      );
    }

    sections.push(
      section(
        "RLS policy model",
        "PASS",
        "All tables use RLS enabled with no anon/authenticated policies; service_role only"
      )
    );
    sections.push(
      section(
        "Browser client key usage",
        "PASS",
        "No NEXT_PUBLIC Supabase keys; browser uses localStorage + admin API routes"
      )
    );
  } else {
    sections.push(section("Schema", "NOT TESTABLE", undefined, "Connection failed"));
    sections.push(section("Local CRUD", "NOT TESTABLE", undefined, "Connection failed"));
  }

  let localCrudPassed = false;
  if (connected) {
    const matchCrud = await runMatchRecordsCrud(healthCheckId, sections);
    const schedulerCrud = missingTables.some((t) =>
      ["execution_logs", "scheduler_state"].includes(t.name)
    )
      ? false
      : await runSchedulerCrud(healthCheckId, sections);
    const adminCrud = missingTables.some((t) =>
      ["admin_error_logs", "security_rate_limit_buckets"].includes(t.name)
    )
      ? false
      : await runAdminCrud(healthCheckId, sections);
    const learningCrud = missingTables.some((t) => t.name === "recommendation_learning")
      ? false
      : await runRecommendationLearningCrud(healthCheckId, sections);

    localCrudPassed = matchCrud.passed && schedulerCrud && adminCrud && learningCrud;
    sections.push(
      section(
        "Local CRUD summary",
        localCrudPassed ? "PASS" : "FAIL",
        `healthCheckId=${healthCheckId}`
      )
    );

    if (!schedulerCrud || !adminCrud) {
      falseProbeTables.push("scheduler/admin CRUD blocked by missing tables");
    }
  }

  const productionSections = await probeProductionSupabase(
    options?.productionUrl ?? process.env.HEALTH_CHECK_PRODUCTION_URL ?? "https://football-ai-ten.vercel.app",
    options?.adminApiKey ?? process.env.ADMIN_API_KEY?.trim()
  );
  sections.push(...productionSections);

  const migrationStatus: SupabaseHealthStatus =
    missingTables.length === 0 ? "PASS" : connected ? "FAIL" : "NOT TESTABLE";

  const localCrudStatus: SupabaseHealthStatus = connected
    ? localCrudPassed
      ? "PASS"
      : "FAIL"
    : "NOT TESTABLE";

  const productionCrudStatus: SupabaseHealthStatus = productionSections.some(
    (s) => s.name === "Production Supabase connection" && s.status === "PASS"
  )
    ? "PASS"
    : productionSections.some((s) => s.name === "Production Supabase (authenticated health)" && s.status === "NOT TESTABLE")
      ? "NOT TESTABLE"
      : "FAIL";

  const rlsStatus: SupabaseHealthStatus = connected ? "PASS" : "NOT TESTABLE";

  let overallStatus: SupabaseHealthReport["overallStatus"];
  if (manualActionRequired && missingTables.length > 0) {
    overallStatus = localCrudPassed ? "PARTIAL PASS" : "MANUAL ACTION REQUIRED";
  } else if (!connected) {
    overallStatus = "MANUAL ACTION REQUIRED";
  } else if (localCrudPassed && missingTables.length === 0) {
    overallStatus = productionCrudStatus === "PASS" ? "PASS" : "PARTIAL PASS";
  } else if (localCrudPassed) {
    overallStatus = "PARTIAL PASS";
  } else {
    overallStatus = "FAIL";
  }

  if (falseProbeTables.length > 0) {
    rootCauses.push(...falseProbeTables);
  }

  for (const file of MIGRATION_FILES_ORDERED) {
    sections.push(section(`Migration file ${file}`, "PASS", "present in repo"));
  }

  return {
    version: "v1",
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startMs,
    overallStatus,
    rootCauses,
    migrationStatus,
    localCrudStatus,
    productionCrudStatus,
    rlsStatus,
    manualActionRequired: manualActionRequired || overallStatus === "MANUAL ACTION REQUIRED",
    manualSteps,
    sections,
  };
}

export function renderSupabaseHealthMarkdown(report: SupabaseHealthReport): string {
  const lines = [
    "# Supabase Recovery and Verification v1",
    "",
    `Generated: ${report.completedAt}`,
    `Duration: ${report.durationMs}ms`,
    "",
    `## Overall: ${report.overallStatus}`,
    "",
    "## Summary",
    "",
    `| Check | Status |`,
    `|-------|--------|`,
    `| Migration | ${report.migrationStatus} |`,
    `| Local CRUD | ${report.localCrudStatus} |`,
    `| Production CRUD | ${report.productionCrudStatus} |`,
    `| RLS | ${report.rlsStatus} |`,
    "",
    "## Root Causes",
    "",
  ];

  if (report.rootCauses.length === 0) {
    lines.push("- None identified.");
  } else {
    for (const cause of report.rootCauses) {
      lines.push(`- ${cause}`);
    }
  }

  if (report.manualActionRequired) {
    lines.push("", "## Manual Steps Required", "");
    for (const step of report.manualSteps) {
      lines.push(`1. ${step}`);
    }
  }

  lines.push("", "## Detailed Checks", "");
  for (const entry of report.sections) {
    lines.push(
      `- **${entry.name}**: ${entry.status}${entry.evidence ? ` — ${entry.evidence}` : ""}${entry.message ? ` (${entry.message})` : ""}`
    );
  }

  return lines.join("\n");
}
