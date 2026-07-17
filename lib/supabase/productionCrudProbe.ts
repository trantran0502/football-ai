import {
  generateHistoricalMatchId,
  type HistoricalMatchRecord,
} from "@/lib/database/matchSchema";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  insertMatchRecordToSupabase,
  updateMatchRecordInSupabase,
} from "@/lib/supabase/services/matchRecordService";

export const PRODUCTION_HEALTH_CHECK_LEAGUE = "HEALTH_CHECK";
export const PRODUCTION_HEALTH_CHECK_PREFIX = "production-health-";

export interface ProductionCrudStepResult {
  step: "insert" | "select" | "update" | "delete" | "cleanup";
  status: "PASS" | "FAIL";
  evidence?: string;
  message?: string;
}

export interface ProductionCrudProbeResult {
  healthCheckId: string;
  recordId: string | null;
  supabaseHost: string | null;
  steps: ProductionCrudStepResult[];
  passed: boolean;
}

export function isValidProductionHealthCheckId(healthCheckId: string): boolean {
  return /^production-health-[0-9TZ-]+$/.test(healthCheckId);
}

function buildProbeRecord(healthCheckId: string): HistoricalMatchRecord {
  const suffix = healthCheckId.slice(-8);
  const now = new Date().toISOString();
  return {
    id: generateHistoricalMatchId(),
    date: "2099-01-01",
    matchDate: "2099-01-01",
    league: PRODUCTION_HEALTH_CHECK_LEAGUE,
    homeTeam: `PH-Home-${suffix}`,
    awayTeam: `PH-Away-${suffix}`,
    rawOdds: `${PRODUCTION_HEALTH_CHECK_PREFIX}${healthCheckId}`,
    marketSelections: [],
    result: null,
    analysisSnapshot: null,
    candidates: [],
    status: "PENDING",
    verificationResult: null,
    fixtureId: 998000000 + Math.floor(Math.random() * 99999),
    createdAt: now,
    updatedAt: now,
  };
}

export async function runProductionCrudProbe(
  healthCheckId: string
): Promise<ProductionCrudProbeResult> {
  const steps: ProductionCrudStepResult[] = [];
  let recordId: string | null = null;
  let supabaseHost: string | null = null;

  try {
    const { getSupabaseEnv } = await import("@/lib/supabase/env");
    supabaseHost = new URL(getSupabaseEnv().url).host;
  } catch {
    supabaseHost = null;
  }

  if (!isValidProductionHealthCheckId(healthCheckId)) {
    steps.push({
      step: "insert",
      status: "FAIL",
      message: "Invalid healthCheckId format",
    });
    return { healthCheckId, recordId, supabaseHost, steps, passed: false };
  }

  try {
    const inserted = await insertMatchRecordToSupabase(buildProbeRecord(healthCheckId));
    recordId = inserted.id;
    steps.push({
      step: "insert",
      status: "PASS",
      evidence: `id=${inserted.id}`,
    });

    const supabase = getSupabaseAdmin();
    const selected = await supabase
      .from("match_records")
      .select("id, league, raw_odds")
      .eq("id", inserted.id)
      .maybeSingle();

    steps.push({
      step: "select",
      status: selected.error || !selected.data ? "FAIL" : "PASS",
      evidence: selected.error?.message ?? `league=${String((selected.data as { league?: string } | null)?.league ?? "")}`,
    });

    const updated = await updateMatchRecordInSupabase({
      ...inserted,
      league: `${PRODUCTION_HEALTH_CHECK_LEAGUE}_UPDATED`,
      updatedAt: new Date().toISOString(),
    });

    steps.push({
      step: "update",
      status: updated?.league === `${PRODUCTION_HEALTH_CHECK_LEAGUE}_UPDATED` ? "PASS" : "FAIL",
      evidence: updated?.league,
    });

    const deleted = await supabase.from("match_records").delete().eq("id", inserted.id);
    steps.push({
      step: "delete",
      status: deleted.error ? "FAIL" : "PASS",
      evidence: deleted.error?.message ?? "row removed",
    });

    recordId = null;

    const orphanCheck = await supabase
      .from("match_records")
      .select("id")
      .eq("raw_odds", `${PRODUCTION_HEALTH_CHECK_PREFIX}${healthCheckId}`)
      .limit(1);

    steps.push({
      step: "cleanup",
      status: orphanCheck.error || (orphanCheck.data?.length ?? 0) > 0 ? "FAIL" : "PASS",
      evidence:
        orphanCheck.data && orphanCheck.data.length > 0
          ? "orphan rows remain"
          : "no orphan rows",
    });

    const passed = steps.every((step) => step.status === "PASS");
    return { healthCheckId, recordId, supabaseHost, steps, passed };
  } catch (error) {
    steps.push({
      step: "insert",
      status: "FAIL",
      message: error instanceof Error ? error.message : String(error),
    });
    return { healthCheckId, recordId, supabaseHost, steps, passed: false };
  } finally {
    if (recordId) {
      try {
        await getSupabaseAdmin().from("match_records").delete().eq("id", recordId);
        steps.push({ step: "cleanup", status: "PASS", evidence: "best-effort delete" });
      } catch {
        steps.push({ step: "cleanup", status: "FAIL", message: "best-effort delete failed" });
      }
    }
  }
}
