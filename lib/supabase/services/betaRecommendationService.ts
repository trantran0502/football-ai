import type { BetaRecommendationRecord } from "@/lib/beta/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import {
  assertSupabaseData,
  throwIfSupabaseError,
} from "@/lib/supabase/errors";
import {
  betaRecommendationDomainToRow,
  betaRecommendationRowToDomain,
} from "@/lib/supabase/mappers/betaRecommendationMapper";

type BetaRecommendationInsertRow =
  Database["public"]["Tables"]["beta_recommendations"]["Insert"];

function toInsertRow(
  record: BetaRecommendationRecord
): BetaRecommendationInsertRow {
  return betaRecommendationDomainToRow(record) as BetaRecommendationInsertRow;
}

export async function insertBetaRecommendationsToSupabase(
  records: BetaRecommendationRecord[]
): Promise<BetaRecommendationRecord[]> {
  if (records.length === 0) {
    return [];
  }

  const supabase = getSupabaseAdmin();
  const rows = records.map(toInsertRow);
  const result = await supabase
    .from("beta_recommendations")
    .insert(rows as never[])
    .select("*");

  throwIfSupabaseError(result.error, result.status ?? null);
  const data = assertSupabaseData(result) ?? [];
  return data.map(betaRecommendationRowToDomain);
}

export async function updateBetaRecommendationInSupabase(
  record: BetaRecommendationRecord
): Promise<BetaRecommendationRecord | null> {
  const supabase = getSupabaseAdmin();
  const row = toInsertRow(record);
  const result = await supabase
    .from("beta_recommendations")
    .update(row as never)
    .eq("id", record.id)
    .select("*")
    .maybeSingle();

  throwIfSupabaseError(result.error, result.status ?? null);
  const data = assertSupabaseData(result);
  return data ? betaRecommendationRowToDomain(data) : null;
}
