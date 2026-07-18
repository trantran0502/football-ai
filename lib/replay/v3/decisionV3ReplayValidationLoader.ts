import { loadEnvConfig } from "@next/env";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";

export const REPLAY_VALIDATION_PAGE_SIZE = 50;
export const REPLAY_VALIDATION_PAGE_MAX_ATTEMPTS = 3;
export const REPLAY_VALIDATION_PAGE_RETRY_BACKOFF_MS = [500, 1000, 2000] as const;

export interface ReplayValidationSupabaseEnvStatus {
  hasSupabaseUrl: boolean;
  hasSupabaseServiceRoleKey: boolean;
}

export interface ReplayValidationPageLoadSummary {
  pageNumber: number;
  rangeFrom: number;
  rangeTo: number;
  loadedCount: number;
  retryCount: number;
}

export interface ReplayValidationLoadSummary {
  dataSource: "Supabase";
  loadedRecords: number;
  verifiedRecords: number;
  pageSize: number;
  pageCount: number;
  pageLoads: ReplayValidationPageLoadSummary[];
  totalRetries: number;
}

export interface ReplayValidationPageLoadFailureDetails {
  pageNumber: number;
  rangeFrom: number;
  rangeTo: number;
  attempt: number;
  errorName: string;
  errorMessage: string;
}

export interface ReplayValidationLoadErrorDetails extends ReplayValidationSupabaseEnvStatus {
  stage: "loadHistoricalMatchRecords";
  errorName: string;
  errorMessage: string;
}

export class ReplayValidationLoadError extends Error {
  readonly details: ReplayValidationLoadErrorDetails;

  constructor(details: ReplayValidationLoadErrorDetails) {
    super(formatReplayValidationLoadError(details));
    this.name = "ReplayValidationLoadError";
    this.details = details;
  }
}

export class ReplayValidationConfigurationError extends Error {
  readonly missingVariables: string[];

  constructor(missingVariables: string[]) {
    super(formatReplayValidationConfigurationError(missingVariables));
    this.name = "ReplayValidationConfigurationError";
    this.missingVariables = missingVariables;
  }
}

export interface ReplayValidationPageFetchInput {
  rangeFrom: number;
  rangeTo: number;
}

export interface ReplayValidationLoaderDependencies {
  fetchPage?: (input: ReplayValidationPageFetchInput) => Promise<HistoricalMatchRecord[]>;
  sleep?: (ms: number) => Promise<void>;
  logPageLoadFailure?: (details: ReplayValidationPageLoadFailureDetails) => void;
  env?: NodeJS.ProcessEnv;
  pageSize?: number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function defaultLogPageLoadFailure(
  details: ReplayValidationPageLoadFailureDetails
): void {
  console.error(
    [
      "Replay validation page load failed:",
      `page: ${details.pageNumber}`,
      `range: ${details.rangeFrom}-${details.rangeTo}`,
      `attempt: ${details.attempt}`,
      `error: ${details.errorName}`,
      `message: ${details.errorMessage}`,
    ].join("\n")
  );
}

function normalizeLoadError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: "Error", message: String(error) };
}

export function getReplayValidationSupabaseEnvStatus(
  env: NodeJS.ProcessEnv = process.env
): ReplayValidationSupabaseEnvStatus {
  return {
    hasSupabaseUrl: Boolean(env.SUPABASE_URL?.trim()),
    hasSupabaseServiceRoleKey: Boolean(env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
  };
}

export function assertReplayValidationSupabaseEnv(
  env: NodeJS.ProcessEnv = process.env
): void {
  const missingVariables: string[] = [];

  if (!env.SUPABASE_URL?.trim()) {
    missingVariables.push("SUPABASE_URL");
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    missingVariables.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (missingVariables.length > 0) {
    throw new ReplayValidationConfigurationError(missingVariables);
  }
}

export function formatReplayValidationConfigurationError(
  missingVariables: string[]
): string {
  const lines = [
    "Replay validation configuration error:",
    ...missingVariables.map((name) => `${name} is missing`),
  ];
  return lines.join("\n");
}

export function formatReplayValidationLoadError(
  details: ReplayValidationLoadErrorDetails
): string {
  return [
    "Replay validation load error:",
    `stage: ${details.stage}`,
    `error: ${details.errorName}`,
    `message: ${details.errorMessage}`,
    `SUPABASE_URL present: ${details.hasSupabaseUrl ? "yes" : "no"}`,
    `SUPABASE_SERVICE_ROLE_KEY present: ${details.hasSupabaseServiceRoleKey ? "yes" : "no"}`,
  ].join("\n");
}

export function countVerifiedRecords(records: HistoricalMatchRecord[]): number {
  return records.filter((record) => record.status === "VERIFIED").length;
}

export function assertReplayValidationRecordIdsUnique(
  records: HistoricalMatchRecord[]
): void {
  const seen = new Set<string>();

  for (const record of records) {
    if (seen.has(record.id)) {
      throw new Error(`Duplicate match record id detected: ${record.id}`);
    }
    seen.add(record.id);
  }
}

export function buildReplayValidationLoadSummary(
  records: HistoricalMatchRecord[],
  pagination: {
    pageSize: number;
    pageLoads: ReplayValidationPageLoadSummary[];
    totalRetries: number;
  }
): ReplayValidationLoadSummary {
  return {
    dataSource: "Supabase",
    loadedRecords: records.length,
    verifiedRecords: countVerifiedRecords(records),
    pageSize: pagination.pageSize,
    pageCount: pagination.pageLoads.length,
    pageLoads: pagination.pageLoads,
    totalRetries: pagination.totalRetries,
  };
}

export function formatReplayValidationLoadSummary(
  summary: ReplayValidationLoadSummary
): string {
  const lines = [
    `Replay validation data source: ${summary.dataSource}`,
    `Page size: ${summary.pageSize}`,
    `Pages loaded: ${summary.pageCount}`,
    ...summary.pageLoads.map(
      (page) =>
        `- page ${page.pageNumber}: ${page.loadedCount} records (retries: ${page.retryCount}, range: ${page.rangeFrom}-${page.rangeTo})`
    ),
    `Total loaded: ${summary.loadedRecords}`,
    `Total retries: ${summary.totalRetries}`,
    `VERIFIED records: ${summary.verifiedRecords}`,
  ];
  return lines.join("\n");
}

async function fetchMatchRecordsPageFromSupabase(
  input: ReplayValidationPageFetchInput
): Promise<HistoricalMatchRecord[]> {
  const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
  const { assertSupabaseData } = await import("@/lib/supabase/errors");
  const { matchRecordRowToDomain } = await import(
    "@/lib/supabase/mappers/matchRecordMapper"
  );

  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("match_records")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(input.rangeFrom, input.rangeTo);

  const data = assertSupabaseData(result);
  return (data ?? []).map(matchRecordRowToDomain);
}

async function loadReplayValidationPageWithRetry(
  input: {
    pageNumber: number;
    rangeFrom: number;
    rangeTo: number;
    fetchPage: (pageInput: ReplayValidationPageFetchInput) => Promise<HistoricalMatchRecord[]>;
    sleep: (ms: number) => Promise<void>;
    logPageLoadFailure: (details: ReplayValidationPageLoadFailureDetails) => void;
  }
): Promise<{ records: HistoricalMatchRecord[]; retryCount: number }> {
  let lastError: { name: string; message: string } | null = null;

  for (let attempt = 1; attempt <= REPLAY_VALIDATION_PAGE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const records = await input.fetchPage({
        rangeFrom: input.rangeFrom,
        rangeTo: input.rangeTo,
      });
      return { records, retryCount: attempt - 1 };
    } catch (error) {
      lastError = normalizeLoadError(error);
      input.logPageLoadFailure({
        pageNumber: input.pageNumber,
        rangeFrom: input.rangeFrom,
        rangeTo: input.rangeTo,
        attempt,
        errorName: lastError.name,
        errorMessage: lastError.message,
      });

      if (attempt < REPLAY_VALIDATION_PAGE_MAX_ATTEMPTS) {
        await input.sleep(REPLAY_VALIDATION_PAGE_RETRY_BACKOFF_MS[attempt - 1]);
      }
    }
  }

  throw new ReplayValidationLoadError({
    stage: "loadHistoricalMatchRecords",
    errorName: lastError?.name ?? "Error",
    errorMessage: lastError?.message ?? "Replay validation page load failed.",
    hasSupabaseUrl: true,
    hasSupabaseServiceRoleKey: true,
  });
}

export async function loadHistoricalMatchRecordsForReplayValidation(
  dependencies: ReplayValidationLoaderDependencies = {}
): Promise<{
  records: HistoricalMatchRecord[];
  summary: ReplayValidationLoadSummary;
}> {
  const env = dependencies.env ?? process.env;
  assertReplayValidationSupabaseEnv(env);

  const envStatus = getReplayValidationSupabaseEnvStatus(env);
  const pageSize = dependencies.pageSize ?? REPLAY_VALIDATION_PAGE_SIZE;
  const fetchPage = dependencies.fetchPage ?? fetchMatchRecordsPageFromSupabase;
  const sleep = dependencies.sleep ?? defaultSleep;
  const logPageLoadFailure =
    dependencies.logPageLoadFailure ?? defaultLogPageLoadFailure;

  const pageLoads: ReplayValidationPageLoadSummary[] = [];
  const records: HistoricalMatchRecord[] = [];
  let totalRetries = 0;
  let pageNumber = 1;
  let rangeFrom = 0;

  try {
    while (true) {
      const rangeTo = rangeFrom + pageSize - 1;
      const pageResult = await loadReplayValidationPageWithRetry({
        pageNumber,
        rangeFrom,
        rangeTo,
        fetchPage,
        sleep,
        logPageLoadFailure,
      });

      totalRetries += pageResult.retryCount;
      pageLoads.push({
        pageNumber,
        rangeFrom,
        rangeTo,
        loadedCount: pageResult.records.length,
        retryCount: pageResult.retryCount,
      });
      records.push(...pageResult.records);

      if (pageResult.records.length < pageSize) {
        break;
      }

      rangeFrom += pageSize;
      pageNumber += 1;
    }

    assertReplayValidationRecordIdsUnique(records);

    return {
      records,
      summary: buildReplayValidationLoadSummary(records, {
        pageSize,
        pageLoads,
        totalRetries,
      }),
    };
  } catch (error) {
    if (error instanceof ReplayValidationConfigurationError) {
      throw error;
    }

    if (error instanceof ReplayValidationLoadError) {
      throw new ReplayValidationLoadError({
        ...error.details,
        ...envStatus,
      });
    }

    const normalized = normalizeLoadError(error);

    throw new ReplayValidationLoadError({
      stage: "loadHistoricalMatchRecords",
      errorName: normalized.name,
      errorMessage: normalized.message,
      ...envStatus,
    });
  }
}

export function loadNextEnvForReplayValidation(cwd = process.cwd()): void {
  loadEnvConfig(cwd);
}
