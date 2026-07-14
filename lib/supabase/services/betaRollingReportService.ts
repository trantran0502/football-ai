import type { RollingEvaluationReport } from "@/lib/beta/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import {
  assertSupabaseData,
  throwIfSupabaseError,
} from "@/lib/supabase/errors";
import {
  betaRollingReportDomainToRow,
  betaRollingReportRowToDomain,
} from "@/lib/supabase/mappers/betaRollingReportMapper";

const MAX_ROLLING_REPORTS = 20;

type BetaRollingReportInsertRow =
  Database["public"]["Tables"]["beta_rolling_reports"]["Insert"];

export async function insertRollingReportToSupabase(
  report: RollingEvaluationReport
): Promise<RollingEvaluationReport> {
  const supabase = getSupabaseAdmin();
  const row = betaRollingReportDomainToRow(report) as BetaRollingReportInsertRow;
  const result = await supabase
    .from("beta_rolling_reports")
    .insert([row as never])
    .select("*")
    .single();

  throwIfSupabaseError(result.error, result.status ?? null);
  const data = assertSupabaseData(result);
  const saved = betaRollingReportRowToDomain(data);

  const listResult = await supabase
    .from("beta_rolling_reports")
    .select("id")
    .order("evaluated_at", { ascending: false });

  throwIfSupabaseError(listResult.error, listResult.status ?? null);
  const rows = (listResult.data ?? []) as Array<{ id: string }>;
  const staleIds = rows.slice(MAX_ROLLING_REPORTS).map((item) => item.id);
  if (staleIds.length > 0) {
    await supabase.from("beta_rolling_reports").delete().in("id", staleIds);
  }

  return saved;
}
