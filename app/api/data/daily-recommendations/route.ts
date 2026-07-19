import { listDailyRecommendationsFromSupabase } from "@/lib/supabase/queries/dailyRecommendations";
import { dataApiSuccess } from "@/lib/supabase/apiResponse";
import { genericErrorResponse } from "@/lib/security";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  if (!hasSupabaseEnv()) {
    return genericErrorResponse(503);
  }

  const { searchParams } = new URL(request.url);
  const matchDate = searchParams.get("matchDate")?.trim() || todayKey();

  try {
    const records = await listDailyRecommendationsFromSupabase(matchDate);
    return dataApiSuccess(records, { count: records.length, matchDate });
  } catch {
    return genericErrorResponse();
  }
}
