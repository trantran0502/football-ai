import { buildPerformanceCenterReport } from "@/lib/performance/performanceAggregation";
import { enrichDailyRecommendation } from "@/lib/performance/performanceSettlement";
import type { PerformanceCenterReport } from "@/lib/performance/performanceTypes";
import {
  listAllDailyRecommendationsFromSupabase,
} from "@/lib/supabase/queries/dailyRecommendations";
import { listMatchRecordsFromSupabase } from "@/lib/supabase/queries/matchRecords";

export async function buildPerformanceCenterResponse(): Promise<PerformanceCenterReport> {
  const [recommendations, matchRecordsResult] = await Promise.all([
    listAllDailyRecommendationsFromSupabase(),
    listMatchRecordsFromSupabase(),
  ]);

  const matchRecordMap = new Map(
    matchRecordsResult.records.map((record) => [record.id, record])
  );

  const enriched = recommendations.map((recommendation) =>
    enrichDailyRecommendation(
      recommendation,
      matchRecordMap.get(recommendation.matchRecordId) ?? null
    )
  );

  return buildPerformanceCenterReport({ items: enriched });
}
