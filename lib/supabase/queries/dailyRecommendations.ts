import type { DailyRecommendationRecord } from "@/lib/dailyRecommendations/dailyRecommendationTypes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { assertSupabaseData } from "@/lib/supabase/errors";
import { dailyRecommendationRowToDomain } from "@/lib/supabase/mappers/dailyRecommendationMapper";

export async function listDailyRecommendationsFromSupabase(
  matchDate: string
): Promise<DailyRecommendationRecord[]> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("daily_recommendations")
    .select("*")
    .eq("match_date", matchDate)
    .order("rank", { ascending: true });

  const data = assertSupabaseData(result) ?? [];
  return mapDailyRecommendationRows(data);
}

export async function listAllDailyRecommendationsFromSupabase(): Promise<
  DailyRecommendationRecord[]
> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("daily_recommendations")
    .select("*")
    .order("match_date", { ascending: false })
    .order("rank", { ascending: true });

  const data = assertSupabaseData(result) ?? [];
  return mapDailyRecommendationRows(data);
}

function mapDailyRecommendationRows(
  data: unknown
): DailyRecommendationRecord[] {
  return (data as Array<Parameters<typeof dailyRecommendationRowToDomain>[0]>).map(
    dailyRecommendationRowToDomain
  );
}
