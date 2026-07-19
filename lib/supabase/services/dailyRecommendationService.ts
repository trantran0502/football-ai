import {
  buildDailyRecommendationRecordsWithDiagnostics,
} from "@/lib/dailyRecommendations/dailyRecommendationRanking";
import type {
  BuildDailyRecommendationsInput,
  DailyRecommendationBuildResult,
} from "@/lib/dailyRecommendations/dailyRecommendationRanking";
import type { DailyRecommendationRecord } from "@/lib/dailyRecommendations/dailyRecommendationTypes";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  assertSupabaseData,
  throwIfSupabaseError,
} from "@/lib/supabase/errors";
import type { Database } from "@/lib/supabase/database.types";
import {
  dailyRecommendationDomainToRow,
  dailyRecommendationRowToDomain,
} from "@/lib/supabase/mappers/dailyRecommendationMapper";

type DailyRecommendationInsertRow =
  Database["public"]["Tables"]["daily_recommendations"]["Insert"];

export async function deleteDailyRecommendationsForDate(matchDate: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("daily_recommendations")
    .delete()
    .eq("match_date", matchDate);

  throwIfSupabaseError(result.error, result.status ?? null);
}

export async function insertDailyRecommendationsToSupabase(
  records: DailyRecommendationRecord[]
): Promise<DailyRecommendationRecord[]> {
  if (records.length === 0) {
    return [];
  }

  const supabase = getSupabaseAdmin();
  const rows = records.map(
    (record) => dailyRecommendationDomainToRow(record) as DailyRecommendationInsertRow
  );
  const result = await supabase
    .from("daily_recommendations")
    .insert(rows as never[])
    .select("*");

  throwIfSupabaseError(result.error, result.status ?? null);
  const data = assertSupabaseData(result) ?? [];
  return (data as unknown as Array<Parameters<typeof dailyRecommendationRowToDomain>[0]>).map(
    dailyRecommendationRowToDomain
  );
}

export async function rebuildDailyRecommendationsForDate(
  input: BuildDailyRecommendationsInput
): Promise<DailyRecommendationRecord[]> {
  const rebuilt = await rebuildDailyRecommendationsWithDiagnosticsForDate(input);
  return rebuilt.records;
}

export async function rebuildDailyRecommendationsWithDiagnosticsForDate(
  input: BuildDailyRecommendationsInput
): Promise<DailyRecommendationBuildResult> {
  await deleteDailyRecommendationsForDate(input.matchDate);
  const built = buildDailyRecommendationRecordsWithDiagnostics(input);
  const records = await insertDailyRecommendationsToSupabase(built.records);
  return {
    records,
    diagnostics: built.diagnostics,
  };
}

export type { HistoricalMatchRecord };
