import type {
  AnalysisPendingPolicyMetadata,
  HistoricalMatchRecord,
} from "@/lib/database/matchSchema";
import { hasCompleteAnalysisRecord } from "@/lib/supabase/services/matchRecordCompletenessGuard";

export const HISTORICAL_PENDING_CLEANUP_SOURCE = "historical_pending_cleanup";
export const MISSING_FIXTURE_ID_EXCLUSION_REASON = "missing_fixture_id";

export function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export type MatchPendingPolicyRecord = Pick<
  HistoricalMatchRecord,
  "status" | "matchDate" | "fixtureId" | "analysisSnapshot"
>;

export function readPendingPolicy(
  record: Pick<HistoricalMatchRecord, "analysisSnapshot">
): AnalysisPendingPolicyMetadata | null {
  return record.analysisSnapshot?.pendingPolicy ?? null;
}

export function isOperationallyExcluded(
  record: Pick<HistoricalMatchRecord, "analysisSnapshot">
): boolean {
  return readPendingPolicy(record)?.excluded === true;
}

export function getPendingExclusionReason(
  record: Pick<HistoricalMatchRecord, "analysisSnapshot">
): string | null {
  const pendingPolicy = readPendingPolicy(record);
  return pendingPolicy?.excluded === true ? pendingPolicy.reason : null;
}

export function isTrulyPendingVerification(
  record: MatchPendingPolicyRecord,
  now = new Date()
): boolean {
  if (record.status !== "PENDING") {
    return false;
  }

  if (isOperationallyExcluded(record)) {
    return false;
  }

  const today = todayKey(now);
  if (record.matchDate >= today) {
    return true;
  }

  return record.fixtureId != null;
}

export function isLegacyUnverifiablePendingRecord(
  record: HistoricalMatchRecord,
  now = new Date()
): boolean {
  if (isOperationallyExcluded(record)) {
    return false;
  }

  if (record.status !== "PENDING") {
    return false;
  }

  if (record.fixtureId != null) {
    return false;
  }

  if (record.matchDate >= todayKey(now)) {
    return false;
  }

  if (record.result != null) {
    return false;
  }

  return hasCompleteAnalysisRecord(record);
}

export function isVerifiablePendingRetryCandidate(
  record: HistoricalMatchRecord,
  now = new Date()
): boolean {
  if (!isTrulyPendingVerification(record, now)) {
    return false;
  }

  return record.fixtureId != null && record.matchDate <= todayKey(now);
}

export function filterTrulyPendingVerificationRecords(
  records: HistoricalMatchRecord[],
  now = new Date()
): HistoricalMatchRecord[] {
  return records.filter((record) => isTrulyPendingVerification(record, now));
}

export function countTrulyPendingVerification(
  records: MatchPendingPolicyRecord[],
  now = new Date()
): number {
  return records.filter((record) => isTrulyPendingVerification(record, now)).length;
}

export function countOperationallyExcludedRecords(
  records: Array<Pick<HistoricalMatchRecord, "analysisSnapshot">>
): number {
  return records.filter((record) => isOperationallyExcluded(record)).length;
}

export function buildPendingPolicyMetadata(
  reason: string,
  now = new Date().toISOString(),
  source = HISTORICAL_PENDING_CLEANUP_SOURCE
): AnalysisPendingPolicyMetadata {
  return {
    excluded: true,
    reason,
    excludedAt: now,
    source,
  };
}
