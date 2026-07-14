import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  assertSupabaseCount,
  assertSupabaseData,
} from "@/lib/supabase/errors";
import { betaRollingReportRowToDomain } from "@/lib/supabase/mappers/betaRollingReportMapper";

export interface BetaRollingReportQuery {
  modelVersion?: string;
}

export async function listBetaRollingReportsFromSupabase(
  query: BetaRollingReportQuery = {}
) {
  const supabase = getSupabaseAdmin();
  let request = supabase
    .from("beta_rolling_reports")
    .select("*")
    .order("evaluated_at", { ascending: false });

  if (query.modelVersion) {
    request = request.eq("model_version", query.modelVersion);
  }

  const result = await request;
  const data = assertSupabaseData(result);

  return (data ?? []).map(betaRollingReportRowToDomain);
}

export async function countBetaRollingReportsFromSupabase(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("beta_rolling_reports")
    .select("*", { count: "exact", head: true });

  return assertSupabaseCount(result);
}
