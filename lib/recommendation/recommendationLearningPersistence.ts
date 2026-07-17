import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { buildRecommendationLearningRecord } from "@/lib/recommendation/recommendationLearningBuilder";
import { saveRecommendationLearningToMemory } from "@/lib/recommendation/recommendationLearningMemoryStore";
import type { RecommendationLearningRecord } from "@/lib/recommendation/recommendationLearningTypes";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { listMatchRecordsFromSupabase } from "@/lib/supabase/queries/matchRecords";
import {
  listRecommendationLearningFromSupabase,
  upsertRecommendationLearningToSupabase,
} from "@/lib/supabase/services/recommendationLearningService";

export interface RecommendationLearningPersistResult {
  record: RecommendationLearningRecord | null;
  error?: string;
}

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
): Promise<RecommendationLearningPersistResult> {
  const learningRecord = buildRecommendationLearningRecord(record);
  if (!learningRecord) {
    return {
      record: null,
      error: record.status !== "VERIFIED" ? "match_not_verified" : "missing_actual_result",
    };
  }

  saveRecommendationLearningToMemory(learningRecord);

  if (hasSupabaseEnv()) {
    try {
      await upsertRecommendationLearningToSupabase(learningRecord);
    } catch (error) {
      return {
        record: learningRecord,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return { record: learningRecord };
}

export interface RecommendationLearningSyncResult {
  scanned: number;
  inserted: number;
  skipped: number;
  errors: Array<{ matchRecordId: string; reason: string }>;
}

export async function syncRecommendationLearningFromVerifiedMatches(): Promise<RecommendationLearningSyncResult> {
  if (!hasSupabaseEnv()) {
    return { scanned: 0, inserted: 0, skipped: 0, errors: [] };
  }

  const [{ records: matchRecords }, existingLearning] = await Promise.all([
    listMatchRecordsFromSupabase(),
    listRecommendationLearningFromSupabase(),
  ]);

  const existingIds = new Set(existingLearning.map((record) => record.matchRecordId));
  const verifiedRecords = matchRecords.filter(
    (record) => record.status === "VERIFIED" && record.result !== null
  );

  let inserted = 0;
  let skipped = 0;
  const errors: Array<{ matchRecordId: string; reason: string }> = [];

  for (const record of verifiedRecords) {
    if (existingIds.has(record.id)) {
      skipped += 1;
      continue;
    }

    const outcome = await persistRecommendationLearningForVerifiedMatch(record);
    if (outcome.record) {
      inserted += 1;
      existingIds.add(record.id);
      if (outcome.error) {
        errors.push({ matchRecordId: record.id, reason: outcome.error });
      }
      continue;
    }

    errors.push({
      matchRecordId: record.id,
      reason: outcome.error ?? "learning_record_not_buildable",
    });
  }

  return {
    scanned: verifiedRecords.length,
    inserted,
    skipped,
    errors,
  };
}
