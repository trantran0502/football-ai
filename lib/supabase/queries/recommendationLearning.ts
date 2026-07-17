import { withSupabaseRetry } from "@/lib/admin/supabaseRetry";
import { syncRecommendationLearningFromVerifiedMatches } from "@/lib/recommendation/recommendationLearningPersistence";
import type { RecommendationLearningRecord } from "@/lib/recommendation/recommendationLearningTypes";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { listRecommendationLearningFromMemory } from "@/lib/recommendation/recommendationLearningMemoryStore";
import { listRecommendationLearningFromSupabase } from "@/lib/supabase/services/recommendationLearningService";

export async function listRecommendationLearningRecords(): Promise<RecommendationLearningRecord[]> {
  if (hasSupabaseEnv()) {
    await syncRecommendationLearningFromVerifiedMatches();
    const result = await withSupabaseRetry(
      "list_recommendation_learning",
      "GET recommendation_learning",
      () => listRecommendationLearningFromSupabase()
    );
    if (result.ok) {
      return result.value;
    }
  }

  return listRecommendationLearningFromMemory();
}
