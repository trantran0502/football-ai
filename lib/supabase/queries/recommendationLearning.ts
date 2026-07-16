import { listRecommendationLearningFromMemory } from "@/lib/recommendation/recommendationLearningMemoryStore";
import type { RecommendationLearningRecord } from "@/lib/recommendation/recommendationLearningTypes";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { listRecommendationLearningFromSupabase } from "@/lib/supabase/services/recommendationLearningService";

export async function listRecommendationLearningRecords(): Promise<RecommendationLearningRecord[]> {
  if (hasSupabaseEnv()) {
    try {
      const remote = await listRecommendationLearningFromSupabase();
      if (remote.length > 0) {
        return remote;
      }
    } catch {
      // Fall back to in-memory records for local development.
    }
  }

  return listRecommendationLearningFromMemory();
}
