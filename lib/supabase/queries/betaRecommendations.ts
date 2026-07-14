import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  assertSupabaseCount,
  assertSupabaseData,
} from "@/lib/supabase/errors";
import { betaRecommendationRowToDomain } from "@/lib/supabase/mappers/betaRecommendationMapper";

export interface BetaRecommendationQuery {
  matchRecordId?: string;
  modelVersion?: string;
}

export async function listBetaRecommendationsFromSupabase(
  query: BetaRecommendationQuery = {}
) {
  const supabase = getSupabaseAdmin();
  let request = supabase
    .from("beta_recommendations")
    .select("*")
    .order("recommended_at", { ascending: false });

  if (query.matchRecordId) {
    request = request.eq("match_record_id", query.matchRecordId);
  }
  if (query.modelVersion) {
    request = request.eq("model_version", query.modelVersion);
  }

  const result = await request;
  const data = assertSupabaseData(result);

  return (data ?? []).map(betaRecommendationRowToDomain);
}

export async function countBetaRecommendationsFromSupabase(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("beta_recommendations")
    .select("*", { count: "exact", head: true });

  return assertSupabaseCount(result);
}
