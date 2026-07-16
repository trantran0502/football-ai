import type { RecommendationLearningRecord } from "@/lib/recommendation/recommendationLearningTypes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import {
  assertSupabaseData,
  throwIfSupabaseError,
} from "@/lib/supabase/errors";
import {
  recommendationLearningDomainToRow,
  recommendationLearningRowToDomain,
} from "@/lib/supabase/mappers/recommendationLearningMapper";

type RecommendationLearningInsertRow =
  Database["public"]["Tables"]["recommendation_learning"]["Insert"];

function toUpsertRow(record: RecommendationLearningRecord): RecommendationLearningInsertRow {
  return recommendationLearningDomainToRow(record) as RecommendationLearningInsertRow;
}

export async function upsertRecommendationLearningToSupabase(
  record: RecommendationLearningRecord
): Promise<RecommendationLearningRecord> {
  const supabase = getSupabaseAdmin();
  const row = toUpsertRow(record);
  const result = await supabase
    .from("recommendation_learning")
    .upsert(row as never, { onConflict: "match_record_id" })
    .select("*")
    .single();

  throwIfSupabaseError(result.error, result.status ?? null);
  const data = assertSupabaseData(result);
  if (!data) {
    throw new Error("Failed to upsert recommendation_learning row.");
  }
  return recommendationLearningRowToDomain(data);
}

export async function listRecommendationLearningFromSupabase(): Promise<RecommendationLearningRecord[]> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("recommendation_learning")
    .select("*")
    .order("verified_at", { ascending: false });

  throwIfSupabaseError(result.error, result.status ?? null);
  const data = assertSupabaseData(result) ?? [];
  return data.map(recommendationLearningRowToDomain);
}
