import { buildRecommendationLearningDebugReport } from "@/lib/recommendation/recommendationLearningDiagnostics";
import {
  syncRecommendationLearningFromVerifiedMatches,
} from "@/lib/recommendation/recommendationLearningPersistence";
import type { RecommendationLearningRecord } from "@/lib/recommendation/recommendationLearningTypes";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { listMatchRecordsFromSupabase } from "@/lib/supabase/queries/matchRecords";
import { listRecommendationLearningFromMemory } from "@/lib/recommendation/recommendationLearningMemoryStore";
import { listRecommendationLearningFromSupabase } from "@/lib/supabase/services/recommendationLearningService";

export async function listRecommendationLearningRecords(): Promise<RecommendationLearningRecord[]> {
  if (hasSupabaseEnv()) {
    try {
      await syncRecommendationLearningFromVerifiedMatches();
      return await listRecommendationLearningFromSupabase();
    } catch {
      // Fall back to in-memory records for local development.
    }
  }

  return listRecommendationLearningFromMemory();
}

export async function buildRecommendationLearningDebugPageData() {
  let syncResult = {
    scanned: 0,
    inserted: 0,
    skipped: 0,
    errors: [] as Array<{ matchRecordId: string; reason: string }>,
  };

  if (hasSupabaseEnv()) {
    syncResult = await syncRecommendationLearningFromVerifiedMatches();
  }

  const learningRecords = await listRecommendationLearningRecords();
  const matchRecords = hasSupabaseEnv()
    ? (await listMatchRecordsFromSupabase()).records
    : [];

  const report = buildRecommendationLearningDebugReport({
    matchRecords,
    learningRecords,
  });

  return {
    syncResult,
    report,
  };
}
