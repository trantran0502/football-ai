import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { withSupabaseRetry } from "@/lib/admin/supabaseRetry";
import { buildRecommendationLearningRecord } from "@/lib/recommendation/recommendationLearningBuilder";
import { inspectLearningRecordCompleteness } from "@/lib/recommendation/recommendationLearningDiagnostics";
import type { RecommendationLearningRecord } from "@/lib/recommendation/recommendationLearningTypes";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { listMatchRecordsFromSupabase } from "@/lib/supabase/queries/matchRecords";
import {
  listRecommendationLearningFromSupabase,
  upsertRecommendationLearningToSupabase,
} from "@/lib/supabase/services/recommendationLearningService";

const BACKFILL_REQUIRED_FIELDS = [
  "providerDiagnostics",
  "marketOutcomes",
  "providerOverallConfidence",
] as const;

export interface RecommendationLearningBackfillScanResult {
  verifiedRecords: number;
  alreadyExists: number;
  eligibleToCreate: number;
  ineligible: number;
}

export interface RecommendationLearningBackfillFailure {
  matchRecordId: string;
  reason: string;
  missingFields: string[];
}

export interface RecommendationLearningBackfillResult {
  verifiedRecords: number;
  alreadyExists: number;
  created: number;
  skipped: number;
  failed: number;
  skipReasons: Record<string, number>;
  failures: RecommendationLearningBackfillFailure[];
  processingTimeMs: number;
  retryErrors: string[];
}

function listVerifiedMatchRecords(records: HistoricalMatchRecord[]): HistoricalMatchRecord[] {
  return records.filter((record) => record.status === "VERIFIED" && record.result !== null);
}

export function validateLearningRecordForBackfill(
  record: RecommendationLearningRecord
): { eligible: boolean; missingFields: string[]; skipReasons: string[] } {
  const completeness = inspectLearningRecordCompleteness(record);
  const requiredMissing = completeness.missingFields.filter((field) =>
    BACKFILL_REQUIRED_FIELDS.some(
      (required) => field === required || field.startsWith(`${required}.`)
    )
  );

  const skipReasons = [...completeness.skipReasons];
  if (
    !record.providerDiagnostics ||
    record.providerDiagnostics.length === 0
  ) {
    if (!skipReasons.includes("missing_provider_diagnostics")) {
      skipReasons.push("missing_provider_diagnostics");
    }
  }
  const decisiveOutcomes = record.marketOutcomes.filter((outcome) => outcome.result !== "PUSH");
  if (decisiveOutcomes.length === 0 && record.totalStake <= 0) {
    if (!skipReasons.includes("missing_market_outcomes")) {
      skipReasons.push("missing_market_outcomes");
    }
  }
  if (record.providerOverallConfidence === null) {
    if (!skipReasons.includes("missing_provider_overall_confidence")) {
      skipReasons.push("missing_provider_overall_confidence");
    }
  }

  const missingFields = [...new Set([...completeness.missingFields, ...requiredMissing])];
  const eligible =
    record.providerDiagnostics.length > 0 &&
    (decisiveOutcomes.length > 0 || record.totalStake > 0) &&
    record.providerOverallConfidence !== null &&
    record.actualResult !== null &&
    record.recommendation !== null;

  return {
    eligible,
    missingFields,
    skipReasons: [...new Set(skipReasons)],
  };
}

export async function scanRecommendationLearningBackfillCandidates(): Promise<RecommendationLearningBackfillScanResult> {
  if (!hasSupabaseEnv()) {
    return {
      verifiedRecords: 0,
      alreadyExists: 0,
      eligibleToCreate: 0,
      ineligible: 0,
    };
  }

  const matchList = await withSupabaseRetry(
    "scan_list_match_records",
    "GET match_records",
    async () => (await listMatchRecordsFromSupabase()).records
  );
  const learningList = await withSupabaseRetry(
    "scan_list_learning",
    "GET recommendation_learning",
    () => listRecommendationLearningFromSupabase()
  );

  if (!matchList.ok) {
    return {
      verifiedRecords: 0,
      alreadyExists: 0,
      eligibleToCreate: 0,
      ineligible: 0,
    };
  }

  const records = matchList.value;
  const existingLearning = learningList.ok ? learningList.value : [];

  const existingIds = new Set(existingLearning.map((record) => record.matchRecordId));
  const verifiedRecords = listVerifiedMatchRecords(records);

  let alreadyExists = 0;
  let eligibleToCreate = 0;
  let ineligible = 0;

  for (const matchRecord of verifiedRecords) {
    if (existingIds.has(matchRecord.id)) {
      alreadyExists += 1;
      continue;
    }

    const built = buildRecommendationLearningRecord(matchRecord);
    if (!built) {
      ineligible += 1;
      continue;
    }

    const validation = validateLearningRecordForBackfill(built);
    if (validation.eligible) {
      eligibleToCreate += 1;
    } else {
      ineligible += 1;
    }
  }

  return {
    verifiedRecords: verifiedRecords.length,
    alreadyExists,
    eligibleToCreate,
    ineligible,
  };
}

export async function runRecommendationLearningBackfill(): Promise<RecommendationLearningBackfillResult> {
  const startedAt = Date.now();

  if (!hasSupabaseEnv()) {
    return {
      verifiedRecords: 0,
      alreadyExists: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      skipReasons: { supabase_unavailable: 1 },
      failures: [],
      processingTimeMs: Date.now() - startedAt,
      retryErrors: ["supabase_unavailable"],
    };
  }

  const matchList = await withSupabaseRetry(
    "backfill_list_match_records",
    "GET match_records",
    async () => (await listMatchRecordsFromSupabase()).records
  );
  const learningList = await withSupabaseRetry(
    "backfill_list_learning",
    "GET recommendation_learning",
    () => listRecommendationLearningFromSupabase()
  );

  const retryErrors: string[] = [];
  if (!matchList.ok) {
    retryErrors.push(matchList.error);
    return {
      verifiedRecords: 0,
      alreadyExists: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      skipReasons: { fetch_match_records_failed: 1 },
      failures: [],
      processingTimeMs: Date.now() - startedAt,
      retryErrors,
    };
  }
  if (!learningList.ok) {
    retryErrors.push(learningList.error);
  }

  const records = matchList.value;
  const existingLearning = learningList.ok ? learningList.value : [];

  const existingIds = new Set(existingLearning.map((record) => record.matchRecordId));
  const verifiedRecords = listVerifiedMatchRecords(records);

  let alreadyExists = 0;
  let created = 0;
  let skipped = 0;
  let failed = 0;
  const skipReasons: Record<string, number> = {};
  const failures: RecommendationLearningBackfillFailure[] = [];

  for (const matchRecord of verifiedRecords) {
    if (existingIds.has(matchRecord.id)) {
      alreadyExists += 1;
      continue;
    }

    const built = buildRecommendationLearningRecord(matchRecord);
    if (!built) {
      skipped += 1;
      skipReasons.learning_record_not_buildable =
        (skipReasons.learning_record_not_buildable ?? 0) + 1;
      failures.push({
        matchRecordId: matchRecord.id,
        reason: "learning_record_not_buildable",
        missingFields: ["recommendation_learning"],
      });
      continue;
    }

    const validation = validateLearningRecordForBackfill(built);
    if (!validation.eligible) {
      skipped += 1;
      for (const reason of validation.skipReasons) {
        skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
      }
      failures.push({
        matchRecordId: matchRecord.id,
        reason: validation.skipReasons[0] ?? "incomplete_record",
        missingFields: validation.missingFields,
      });
      continue;
    }

    const upsert = await withSupabaseRetry(
      "backfill_upsert_learning",
      `UPSERT recommendation_learning match_record_id=${matchRecord.id}`,
      () => upsertRecommendationLearningToSupabase(built)
    );
    if (upsert.ok) {
      created += 1;
      existingIds.add(matchRecord.id);
    } else {
      failed += 1;
      retryErrors.push(upsert.error);
      skipReasons.insert_failed = (skipReasons.insert_failed ?? 0) + 1;
      failures.push({
        matchRecordId: matchRecord.id,
        reason: upsert.error,
        missingFields: [],
      });
    }
  }

  return {
    verifiedRecords: verifiedRecords.length,
    alreadyExists,
    created,
    skipped,
    failed,
    skipReasons,
    failures,
    processingTimeMs: Date.now() - startedAt,
    retryErrors,
  };
}
