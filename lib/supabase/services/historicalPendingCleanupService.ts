import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { UpdateMatchResultInput } from "@/lib/database/matchSchema";
import { getApiFootballClient } from "@/lib/providers/apiFootball/apiFootballClient";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  assertSupabaseData,
  sanitizeErrorText,
  throwIfSupabaseError,
} from "@/lib/supabase/errors";
import { matchRecordRowToDomain } from "@/lib/supabase/mappers/matchRecordMapper";
import {
  buildPendingPolicyMetadata,
  isLegacyUnverifiablePendingRecord,
  isOperationallyExcluded,
  isVerifiablePendingRetryCandidate,
  MISSING_FIXTURE_ID_EXCLUSION_REASON,
} from "@/lib/supabase/services/matchRecordPendingPolicy";
import { verifyMatchInSupabase } from "@/lib/supabase/services/matchRecordService";

const FINISHED_FIXTURE_STATUSES = new Set(["FT", "AET", "PEN"]);

export const PENDING_CLEANUP_PAGE_SIZE = 50;
export const PENDING_CLEANUP_PAGE_MAX_ATTEMPTS = 3;
export const PENDING_CLEANUP_PAGE_RETRY_BACKOFF_MS = [500, 1000, 2000] as const;

export interface PendingMatchRecordsPageFetchInput {
  rangeFrom: number;
  rangeTo: number;
}

export interface PendingMatchRecordsLoadSummary {
  pagesLoaded: number;
  retriesUsed: number;
  pendingRecordsLoaded: number;
  duplicateIdsIgnored: number;
  pageSize: number;
}

export interface PendingMatchRecordsLoadResult {
  records: HistoricalMatchRecord[];
  summary: PendingMatchRecordsLoadSummary;
}

export interface PendingMatchRecordsLoaderDependencies {
  fetchPage?: (input: PendingMatchRecordsPageFetchInput) => Promise<HistoricalMatchRecord[]>;
  sleep?: (ms: number) => Promise<void>;
  pageSize?: number;
}

export interface PendingMatchRecordsPageLoadFailureDetails {
  pageNumber: number;
  rangeFrom: number;
  rangeTo: number;
  attempt: number;
  errorName: string;
  errorMessage: string;
}

export class PendingMatchRecordsLoadError extends Error {
  readonly details: PendingMatchRecordsPageLoadFailureDetails;

  constructor(details: PendingMatchRecordsPageLoadFailureDetails) {
    super(
      [
        "Pending match records load failed:",
        `page: ${details.pageNumber}`,
        `range: ${details.rangeFrom}-${details.rangeTo}`,
        `error: ${details.errorName}`,
        `message: ${details.errorMessage}`,
      ].join("\n")
    );
    this.name = "PendingMatchRecordsLoadError";
    this.details = details;
  }
}

export interface HistoricalPendingCleanupPlan {
  generatedAt: string;
  retryCandidates: HistoricalMatchRecord[];
  legacyExclusionCandidates: HistoricalMatchRecord[];
  otherPendingRecords: HistoricalMatchRecord[];
}

export interface HistoricalPendingVerificationAttempt {
  recordId: string;
  fixtureId: number;
  status: "verified" | "skipped" | "failed";
  message?: string;
}

export interface HistoricalPendingExclusionAttempt {
  recordId: string;
  status: "excluded" | "skipped" | "failed";
  message?: string;
}

export interface HistoricalPendingCleanupResult {
  dryRun: boolean;
  plan: HistoricalPendingCleanupPlan;
  verificationAttempts: HistoricalPendingVerificationAttempt[];
  exclusionAttempts: HistoricalPendingExclusionAttempt[];
  pendingLoadSummary?: PendingMatchRecordsLoadSummary;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeLoadError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: "Error", message: String(error) };
}

function readErrorField(error: unknown, field: string): unknown {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  return (error as Record<string, unknown>)[field];
}

function appendNodeSystemErrorFields(
  lines: string[],
  error: unknown,
  prefix: string
): void {
  const fields = ["name", "message", "code", "errno", "syscall", "hostname"] as const;
  for (const field of fields) {
    const value = readErrorField(error, field);
    if (value !== undefined && value !== null && value !== "") {
      lines.push(`${prefix}.${field}: ${sanitizeErrorText(String(value))}`);
    }
  }
}

function readSanitizedSupabaseStringField(
  error: unknown,
  field: "code" | "details" | "hint"
): string | null {
  const value = readErrorField(error, field);
  if (value === undefined || value === null) {
    return null;
  }

  const sanitized = sanitizeErrorText(String(value));
  return sanitized || null;
}

function readSanitizedSupabaseStatusField(error: unknown): string | null {
  const value = readErrorField(error, "status");
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function appendSupabaseDiagnosticFields(lines: string[], error: unknown): void {
  const code = readSanitizedSupabaseStringField(error, "code");
  const details = readSanitizedSupabaseStringField(error, "details");
  const hint = readSanitizedSupabaseStringField(error, "hint");
  const status = readSanitizedSupabaseStatusField(error);

  lines.push(`error.code: ${code ?? "(none)"}`);
  lines.push("error.details:");
  if (details) {
    lines.push(details);
  } else {
    lines.push("(none)");
  }
  lines.push(`error.hint: ${hint ?? "(none)"}`);
  lines.push(`error.status: ${status ?? "(none)"}`);
}

export function formatPendingMatchRecordsFetchErrorChain(
  error: unknown,
  context: {
    pageNumber: number;
    rangeFrom: number;
    rangeTo: number;
    attempt: number;
  }
): string {
  const lines = [
    "Pending match records page fetch error:",
    `page: ${context.pageNumber}`,
    `range: ${context.rangeFrom}-${context.rangeTo}`,
    `attempt: ${context.attempt}`,
  ];

  if (error instanceof Error) {
    lines.push(`error.name: ${error.name}`);
    lines.push(`error.message: ${error.message}`);
    appendSupabaseDiagnosticFields(lines, error);
    if (error.stack) {
      lines.push(`error.stack: ${error.stack}`);
    }

    const cause = error.cause;
    if (cause !== undefined) {
      lines.push("error.cause: present");
      appendNodeSystemErrorFields(lines, cause, "cause");
      if (cause instanceof Error && cause.stack) {
        lines.push(`cause.stack: ${cause.stack}`);
      }
    } else {
      lines.push("error.cause: (none)");
    }

    appendNodeSystemErrorFields(lines, error, "error");

    if (error instanceof AggregateError) {
      lines.push(`AggregateError.errors (${error.errors.length}):`);
      error.errors.forEach((innerError, index) => {
        lines.push(`  [${index}]`);
        if (innerError instanceof Error) {
          lines.push(`    inner.name: ${innerError.name}`);
          lines.push(`    inner.message: ${innerError.message}`);
          if (innerError.stack) {
            lines.push(`    inner.stack: ${innerError.stack}`);
          }
          appendNodeSystemErrorFields(lines, innerError, "    inner");
          if (innerError.cause !== undefined) {
            lines.push("    inner.cause: present");
            appendNodeSystemErrorFields(lines, innerError.cause, "    inner.cause");
          }
        } else {
          lines.push(`    inner: ${String(innerError)}`);
        }
      });
    }
  } else {
    lines.push(`error: ${String(error)}`);
    appendSupabaseDiagnosticFields(lines, error);
  }

  return lines.join("\n");
}

function logPendingMatchRecordsPageFetchError(
  error: unknown,
  context: {
    pageNumber: number;
    rangeFrom: number;
    rangeTo: number;
    attempt: number;
  }
): void {
  console.error(formatPendingMatchRecordsFetchErrorChain(error, context));
}

async function fetchPendingMatchRecordsPageFromSupabase(
  input: PendingMatchRecordsPageFetchInput
): Promise<HistoricalMatchRecord[]> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("match_records")
    .select("*")
    .eq("status", "PENDING")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(input.rangeFrom, input.rangeTo);

  throwIfSupabaseError(result.error, result.status ?? null);
  const rows = assertSupabaseData(result) ?? [];
  return rows
    .map((row) => matchRecordRowToDomain(row))
    .filter((record) => record.status === "PENDING");
}

async function loadPendingMatchRecordsPageWithRetry(input: {
  pageNumber: number;
  rangeFrom: number;
  rangeTo: number;
  fetchPage: (pageInput: PendingMatchRecordsPageFetchInput) => Promise<HistoricalMatchRecord[]>;
  sleep: (ms: number) => Promise<void>;
}): Promise<{ records: HistoricalMatchRecord[]; retryCount: number }> {
  let lastError: { name: string; message: string } | null = null;

  for (let attempt = 1; attempt <= PENDING_CLEANUP_PAGE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const records = await input.fetchPage({
        rangeFrom: input.rangeFrom,
        rangeTo: input.rangeTo,
      });
      return { records, retryCount: attempt - 1 };
    } catch (error) {
      logPendingMatchRecordsPageFetchError(error, {
        pageNumber: input.pageNumber,
        rangeFrom: input.rangeFrom,
        rangeTo: input.rangeTo,
        attempt,
      });
      lastError = normalizeLoadError(error);
      if (attempt < PENDING_CLEANUP_PAGE_MAX_ATTEMPTS) {
        await input.sleep(PENDING_CLEANUP_PAGE_RETRY_BACKOFF_MS[attempt - 1]);
      }
    }
  }

  throw new PendingMatchRecordsLoadError({
    pageNumber: input.pageNumber,
    rangeFrom: input.rangeFrom,
    rangeTo: input.rangeTo,
    attempt: PENDING_CLEANUP_PAGE_MAX_ATTEMPTS,
    errorName: lastError?.name ?? "Error",
    errorMessage: lastError?.message ?? "Pending match records page load failed.",
  });
}

export async function listPendingMatchRecordsInSupabase(
  dependencies: PendingMatchRecordsLoaderDependencies = {}
): Promise<PendingMatchRecordsLoadResult> {
  const pageSize = dependencies.pageSize ?? PENDING_CLEANUP_PAGE_SIZE;
  const fetchPage = dependencies.fetchPage ?? fetchPendingMatchRecordsPageFromSupabase;
  const sleep = dependencies.sleep ?? defaultSleep;

  const records: HistoricalMatchRecord[] = [];
  const seenIds = new Set<string>();
  let pagesLoaded = 0;
  let retriesUsed = 0;
  let duplicateIdsIgnored = 0;
  let pageNumber = 1;
  let rangeFrom = 0;

  while (true) {
    const rangeTo = rangeFrom + pageSize - 1;
    const pageResult = await loadPendingMatchRecordsPageWithRetry({
      pageNumber,
      rangeFrom,
      rangeTo,
      fetchPage,
      sleep,
    });

    pagesLoaded += 1;
    retriesUsed += pageResult.retryCount;

    for (const record of pageResult.records) {
      if (record.status !== "PENDING") {
        continue;
      }
      if (seenIds.has(record.id)) {
        duplicateIdsIgnored += 1;
        continue;
      }
      seenIds.add(record.id);
      records.push(record);
    }

    if (pageResult.records.length < pageSize) {
      break;
    }

    rangeFrom += pageSize;
    pageNumber += 1;
  }

  return {
    records,
    summary: {
      pagesLoaded,
      retriesUsed,
      pendingRecordsLoaded: records.length,
      duplicateIdsIgnored,
      pageSize,
    },
  };
}

export function buildHistoricalPendingCleanupPlan(
  records: HistoricalMatchRecord[],
  now = new Date()
): HistoricalPendingCleanupPlan {
  const retryCandidates: HistoricalMatchRecord[] = [];
  const legacyExclusionCandidates: HistoricalMatchRecord[] = [];
  const otherPendingRecords: HistoricalMatchRecord[] = [];

  for (const record of records) {
    if (isVerifiablePendingRetryCandidate(record, now)) {
      retryCandidates.push(record);
      continue;
    }
    if (isLegacyUnverifiablePendingRecord(record, now)) {
      legacyExclusionCandidates.push(record);
      continue;
    }
    otherPendingRecords.push(record);
  }

  return {
    generatedAt: now.toISOString(),
    retryCandidates,
    legacyExclusionCandidates,
    otherPendingRecords,
  };
}

export function buildUpdateMatchResultInputFromFixture(
  fixture: ApiFootballFixtureRecord
): UpdateMatchResultInput | null {
  if (!FINISHED_FIXTURE_STATUSES.has(fixture.status)) {
    return null;
  }
  if (fixture.homeGoals == null || fixture.awayGoals == null) {
    return null;
  }

  return {
    fullTimeHomeGoals: fixture.homeGoals,
    fullTimeAwayGoals: fixture.awayGoals,
    halfTimeHomeGoals: fixture.halfTimeHome ?? 0,
    halfTimeAwayGoals: fixture.halfTimeAway ?? 0,
  };
}

export async function markLegacyPendingExcludedInSupabase(
  recordId: string,
  now = new Date().toISOString()
): Promise<HistoricalMatchRecord | null> {
  const supabase = getSupabaseAdmin();
  const existingResult = await supabase
    .from("match_records")
    .select("*")
    .eq("id", recordId)
    .maybeSingle();

  const existingRow = assertSupabaseData(existingResult);
  if (!existingRow) {
    return null;
  }

  const existing = matchRecordRowToDomain(existingRow);
  if (existing.status !== "PENDING") {
    return null;
  }

  if (isOperationallyExcluded(existing)) {
    return existing;
  }

  if (!existing.analysisSnapshot) {
    return null;
  }

  const updatedSnapshot = {
    ...existing.analysisSnapshot,
    pendingPolicy: buildPendingPolicyMetadata(MISSING_FIXTURE_ID_EXCLUSION_REASON, now),
  };

  const result = await supabase
    .from("match_records")
    .update({
      analysis_snapshot: updatedSnapshot,
      updated_at: now,
    } as never)
    .eq("id", recordId)
    .eq("status", "PENDING")
    .select("*")
    .maybeSingle();

  throwIfSupabaseError(result.error, result.status ?? null);
  const row = assertSupabaseData(result);
  return row ? matchRecordRowToDomain(row) : null;
}

export async function runHistoricalPendingCleanup(options: {
  dryRun?: boolean;
  now?: Date;
  listPending?: () => Promise<HistoricalMatchRecord[]>;
  fetchFixtureById?: (fixtureId: number) => Promise<ApiFootballFixtureRecord | null>;
  verifyMatch?: typeof verifyMatchInSupabase;
  markLegacyExcluded?: typeof markLegacyPendingExcludedInSupabase;
} = {}): Promise<HistoricalPendingCleanupResult> {
  const dryRun = options.dryRun !== false;
  const now = options.now ?? new Date();
  const fetchFixtureById =
    options.fetchFixtureById ??
    (async (fixtureId: number) => {
      const client = getApiFootballClient();
      if (!client.isConfigured()) {
        return null;
      }
      return client.getFixtureById(fixtureId);
    });
  const verifyMatch = options.verifyMatch ?? verifyMatchInSupabase;
  const markLegacyExcluded = options.markLegacyExcluded ?? markLegacyPendingExcludedInSupabase;

  let pendingRecords: HistoricalMatchRecord[];
  let pendingLoadSummary: PendingMatchRecordsLoadSummary | undefined;

  if (options.listPending) {
    pendingRecords = await options.listPending();
  } else {
    const loaded = await listPendingMatchRecordsInSupabase();
    pendingRecords = loaded.records;
    pendingLoadSummary = loaded.summary;
  }

  const plan = buildHistoricalPendingCleanupPlan(pendingRecords, now);
  const verificationAttempts: HistoricalPendingVerificationAttempt[] = [];
  const exclusionAttempts: HistoricalPendingExclusionAttempt[] = [];

  for (const record of plan.retryCandidates) {
    const fixtureId = record.fixtureId!;
    if (dryRun) {
      verificationAttempts.push({
        recordId: record.id,
        fixtureId,
        status: "skipped",
        message: "dry_run",
      });
      continue;
    }

    try {
      const fixture = await fetchFixtureById(fixtureId);
      if (!fixture) {
        verificationAttempts.push({
          recordId: record.id,
          fixtureId,
          status: "skipped",
          message: "fixture_not_found",
        });
        continue;
      }

      const input = buildUpdateMatchResultInputFromFixture(fixture);
      if (!input) {
        verificationAttempts.push({
          recordId: record.id,
          fixtureId,
          status: "skipped",
          message: `fixture_not_finished:${fixture.status}`,
        });
        continue;
      }

      const verified = await verifyMatch(record.id, input);
      if (verified?.status === "VERIFIED") {
        verificationAttempts.push({
          recordId: record.id,
          fixtureId,
          status: "verified",
        });
        continue;
      }

      verificationAttempts.push({
        recordId: record.id,
        fixtureId,
        status: "failed",
        message: verified ? `unexpected_status:${verified.status}` : "verify_returned_null",
      });
    } catch (error) {
      verificationAttempts.push({
        recordId: record.id,
        fixtureId,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const record of plan.legacyExclusionCandidates) {
    if (dryRun) {
      exclusionAttempts.push({
        recordId: record.id,
        status: "skipped",
        message: "dry_run",
      });
      continue;
    }

    try {
      const marked = await markLegacyExcluded(record.id, now.toISOString());
      if (marked && isOperationallyExcluded(marked)) {
        exclusionAttempts.push({
          recordId: record.id,
          status: "excluded",
        });
        continue;
      }

      exclusionAttempts.push({
        recordId: record.id,
        status: "failed",
        message: marked ? "pending_policy_not_applied" : "mark_returned_null",
      });
    } catch (error) {
      exclusionAttempts.push({
        recordId: record.id,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    dryRun,
    plan,
    verificationAttempts,
    exclusionAttempts,
    pendingLoadSummary,
  };
}
