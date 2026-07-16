import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { buildRecommendationLearningRecord } from "@/lib/recommendation/recommendationLearningBuilder";
import { saveRecommendationLearningToMemory } from "@/lib/recommendation/recommendationLearningMemoryStore";
import type { RecommendationLearningRecord } from "@/lib/recommendation/recommendationLearningTypes";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { upsertRecommendationLearningToSupabase } from "@/lib/supabase/services/recommendationLearningService";

export function persistRecommendationLearningLocally(
  record: HistoricalMatchRecord
): RecommendationLearningRecord | null {
  const learningRecord = buildRecommendationLearningRecord(record);
  if (!learningRecord) {
    return null;
  }
  return saveRecommendationLearningToMemory(learningRecord);
}

export async function persistRecommendationLearningForVerifiedMatch(
  record: HistoricalMatchRecord
): Promise<RecommendationLearningRecord | null> {
  const learningRecord = persistRecommendationLearningLocally(record);
  if (!learningRecord) {
    return null;
  }

  if (hasSupabaseEnv()) {
    try {
      await upsertRecommendationLearningToSupabase(learningRecord);
    } catch {
      // Keep local accumulation even if remote persistence fails.
    }
  }

  return learningRecord;
}
