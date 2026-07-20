import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  isLegacyUnverifiablePendingRecord,
  isOperationallyExcluded,
  isTrulyPendingVerification,
  isVerifiablePendingRetryCandidate,
  todayKey,
} from "@/lib/supabase/services/matchRecordPendingPolicy";

export type PendingRecordCategory =
  | "upcoming"
  | "finished_but_unmatched"
  | "postponed"
  | "cancelled"
  | "missing_fixture_id"
  | "cross_date"
  | "legacy_unmatchable"
  | "retryable"
  | "terminal";

export interface PendingRecordClassification {
  recordId: string;
  category: PendingRecordCategory;
  matchDate: string;
  fixtureId: number | null;
  ageHours: number | null;
}

export interface PendingClassificationSummary {
  total: number;
  pendingOver24h: number;
  byCategory: Record<PendingRecordCategory, number>;
  records: PendingRecordClassification[];
}

const EMPTY_COUNTS: Record<PendingRecordCategory, number> = {
  upcoming: 0,
  finished_but_unmatched: 0,
  postponed: 0,
  cancelled: 0,
  missing_fixture_id: 0,
  cross_date: 0,
  legacy_unmatchable: 0,
  retryable: 0,
  terminal: 0,
};

function hoursSinceMatchDate(matchDate: string, now: Date): number | null {
  const kickoff = Date.parse(`${matchDate}T12:00:00.000Z`);
  if (!Number.isFinite(kickoff)) {
    return null;
  }
  return Math.max(0, (now.getTime() - kickoff) / (60 * 60 * 1000));
}

function readTerminalPendingPolicy(record: HistoricalMatchRecord): boolean {
  return record.analysisSnapshot?.pendingPolicy?.reason === "terminal_pending";
}

export function classifyPendingRecord(
  record: HistoricalMatchRecord,
  now = new Date()
): PendingRecordClassification {
  const today = todayKey(now);
  const ageHours = hoursSinceMatchDate(record.matchDate, now);
  const pendingPolicyReason = record.analysisSnapshot?.pendingPolicy?.reason ?? null;

  if (readTerminalPendingPolicy(record)) {
    return {
      recordId: record.id,
      category: "terminal",
      matchDate: record.matchDate,
      fixtureId: record.fixtureId ?? null,
      ageHours,
    };
  }

  if (pendingPolicyReason === "postponed") {
    return {
      recordId: record.id,
      category: "postponed",
      matchDate: record.matchDate,
      fixtureId: record.fixtureId ?? null,
      ageHours,
    };
  }

  if (pendingPolicyReason === "cancelled") {
    return {
      recordId: record.id,
      category: "cancelled",
      matchDate: record.matchDate,
      fixtureId: record.fixtureId ?? null,
      ageHours,
    };
  }

  if (record.fixtureId == null) {
    return {
      recordId: record.id,
      category: "missing_fixture_id",
      matchDate: record.matchDate,
      fixtureId: null,
      ageHours,
    };
  }

  if (isLegacyUnverifiablePendingRecord(record, now)) {
    return {
      recordId: record.id,
      category: "legacy_unmatchable",
      matchDate: record.matchDate,
      fixtureId: record.fixtureId ?? null,
      ageHours,
    };
  }

  if (record.matchDate > today) {
    return {
      recordId: record.id,
      category: "upcoming",
      matchDate: record.matchDate,
      fixtureId: record.fixtureId ?? null,
      ageHours,
    };
  }

  if (record.matchDate < today && isVerifiablePendingRetryCandidate(record, now)) {
    return {
      recordId: record.id,
      category: "retryable",
      matchDate: record.matchDate,
      fixtureId: record.fixtureId ?? null,
      ageHours,
    };
  }

  if (record.matchDate < today) {
    return {
      recordId: record.id,
      category: "finished_but_unmatched",
      matchDate: record.matchDate,
      fixtureId: record.fixtureId ?? null,
      ageHours,
    };
  }

  if (record.matchDate !== today) {
    return {
      recordId: record.id,
      category: "cross_date",
      matchDate: record.matchDate,
      fixtureId: record.fixtureId ?? null,
      ageHours,
    };
  }

  return {
    recordId: record.id,
    category: "upcoming",
    matchDate: record.matchDate,
    fixtureId: record.fixtureId ?? null,
    ageHours,
  };
}

export function summarizePendingRecordClassifications(
  records: HistoricalMatchRecord[],
  now = new Date()
): PendingClassificationSummary {
  const pendingRecords = records.filter(
    (record) => record.status === "PENDING" && !isOperationallyExcluded(record)
  );
  const byCategory = { ...EMPTY_COUNTS };
  const classified = pendingRecords.map((record) => classifyPendingRecord(record, now));

  for (const item of classified) {
    byCategory[item.category] += 1;
  }

  const pendingOver24h = classified.filter(
    (item) => (item.ageHours ?? 0) >= 24 && isTrulyPendingVerification(
      records.find((record) => record.id === item.recordId)!,
      now
    )
  ).length;

  return {
    total: classified.length,
    pendingOver24h,
    byCategory,
    records: classified,
  };
}
