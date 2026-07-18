import type { AnalysisSnapshot, HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { SupabaseQueryError } from "@/lib/supabase/errors";
import {
  buildHistoricalPendingCleanupPlan,
  formatPendingMatchRecordsFetchErrorChain,
  listPendingMatchRecordsInSupabase,
  PENDING_CLEANUP_PAGE_SIZE,
  PendingMatchRecordsLoadError,
  runHistoricalPendingCleanup,
} from "@/lib/supabase/services/historicalPendingCleanupService";
import {
  isOperationallyExcluded,
  MISSING_FIXTURE_ID_EXCLUSION_REASON,
} from "@/lib/supabase/services/matchRecordPendingPolicy";
import type { MarketSelection } from "@/types/match";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const SETTLEABLE_MARKET: MarketSelection = {
  marketType: "moneyline",
  marketFamily: "moneyline",
  title: "Moneyline",
  period: "full",
  side: "home",
  line: null,
  rawLine: null,
  modifier: null,
  odds: 1.9,
  impliedProbability: 0.526,
};

const ORIGINAL_SNAPSHOT = {
  features: [{ id: "feature-1", score: 1, weight: 1, weightedScore: 1 }],
  interpretations: [],
  marketAnalysis: { summary: "keep-me" },
  combinedAnalysis: { summary: "keep-me-too" },
  candidates: [],
  recommendation: null,
  replay: null,
  bettingIntelligence: null,
  decision: null,
  dataCompleteness: {
    analysisEnriched: true,
    analysisEnrichedAt: "2026-07-15T09:00:00.000Z",
    enrichedFrom: "historical_backfill",
  },
  capturedAt: "2026-07-15T10:00:00.000Z",
} as AnalysisSnapshot;

function buildLegacyRecord(id: string): HistoricalMatchRecord {
  return {
    id,
    date: "2026-07-15",
    matchDate: "2026-07-15",
    league: "Test League",
    homeTeam: "Home",
    awayTeam: "Away",
    rawOdds: "sample odds",
    marketSelections: [SETTLEABLE_MARKET],
    result: null,
    analysisSnapshot: structuredClone(ORIGINAL_SNAPSHOT),
    candidates: [],
    status: "PENDING",
    verificationResult: null,
    fixtureId: null,
    leagueId: null,
    season: null,
    homeTeamId: null,
    awayTeamId: null,
    source: "app",
    createdAt: "2026-07-15T10:00:00.000Z",
    updatedAt: "2026-07-15T10:00:00.000Z",
  };
}

function buildPendingRecord(id: string, overrides: Partial<HistoricalMatchRecord> = {}): HistoricalMatchRecord {
  return {
    ...buildLegacyRecord(id),
    ...overrides,
    id,
  };
}

function buildPendingPages(
  totalRecords: number,
  pageSize = PENDING_CLEANUP_PAGE_SIZE
): HistoricalMatchRecord[][] {
  const pages: HistoricalMatchRecord[][] = [];
  for (let index = 0; index < totalRecords; index += 1) {
    const pageIndex = Math.floor(index / pageSize);
    pages[pageIndex] = pages[pageIndex] ?? [];
    pages[pageIndex].push(buildPendingRecord(`pending-${index + 1}`));
  }
  return pages;
}

function runPendingMatchRecordsFetchErrorDiagnosticsTests(): void {
  const errorContext = {
    pageNumber: 1,
    rangeFrom: 0,
    rangeTo: 49,
    attempt: 2,
  };

  const multilineDetails = [
    "TypeError: fetch failed",
    "",
    "Caused by: Error: connect ECONNREFUSED",
    "    at Socket.connect (node:net:123:45)",
  ].join("\n");
  const supabaseError = new SupabaseQueryError({
    name: "PostgrestError",
    message: "TypeError: fetch failed",
    code: "PGRST000",
    details: multilineDetails,
    hint: "Check network connectivity",
    status: 0,
  });
  const supabaseFormatted = formatPendingMatchRecordsFetchErrorChain(
    supabaseError,
    errorContext
  );
  assert(supabaseFormatted.includes("error.code: PGRST000"), "should print error.code");
  assert(supabaseFormatted.includes("error.details:"), "should print error.details header");
  assert(
    supabaseFormatted.includes("Caused by: Error: connect ECONNREFUSED"),
    "should preserve multiline details content"
  );
  assert(
    supabaseFormatted.includes("    at Socket.connect (node:net:123:45)"),
    "should preserve stack lines inside details"
  );
  assert(
    supabaseFormatted.includes("error.hint: Check network connectivity"),
    "should print error.hint"
  );
  assert(supabaseFormatted.includes("error.status: 0"), "should print error.status");

  const secretKey = "test-service-role-key-do-not-leak";
  const previousServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = secretKey;
  try {
    const secretError = new SupabaseQueryError({
      name: "PostgrestError",
      message: "request failed",
      code: secretKey,
      details: `Authorization: Bearer ${secretKey}\nsecond line ${secretKey}`,
      hint: secretKey,
      status: 503,
    });
    const secretFormatted = formatPendingMatchRecordsFetchErrorChain(
      secretError,
      errorContext
    );
    assert(!secretFormatted.includes(secretKey), "should redact service role key from diagnostic fields");
    assert(
      secretFormatted.includes("[REDACTED]"),
      "should replace secrets with [REDACTED]"
    );
    assert(secretFormatted.includes("error.status: 503"), "should still print sanitized status");
  } finally {
    if (previousServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRoleKey;
    }
  }

  const plainError = new Error("plain fetch failure");
  const plainFormatted = formatPendingMatchRecordsFetchErrorChain(plainError, errorContext);
  assert(plainFormatted.includes("error.code: (none)"), "missing code should print (none)");
  assert(plainFormatted.includes("error.details:\n(none)"), "missing details should print (none)");
  assert(plainFormatted.includes("error.hint: (none)"), "missing hint should print (none)");
  assert(plainFormatted.includes("error.status: (none)"), "missing status should print (none)");
}

export async function runPendingMatchRecordsLoaderTests(): Promise<void> {
  runPendingMatchRecordsFetchErrorDiagnosticsTests();
  const cause = Object.assign(new Error("connect ECONNREFUSED"), {
    code: "ECONNREFUSED",
    errno: -4078,
    syscall: "connect",
    hostname: "qjzuledpatlbjsymqtbb.supabase.co",
  });
  const wrapped = new TypeError("fetch failed", { cause });
  wrapped.name = "PostgrestError";
  const formatted = formatPendingMatchRecordsFetchErrorChain(wrapped, {
    pageNumber: 1,
    rangeFrom: 0,
    rangeTo: 49,
    attempt: 3,
  });
  assert(formatted.includes("error.name: PostgrestError"), "should print error.name");
  assert(formatted.includes("error.message: fetch failed"), "should print error.message");
  assert(formatted.includes("error.cause: present"), "should print cause presence");
  assert(formatted.includes("cause.code: ECONNREFUSED"), "should print cause.code");
  assert(formatted.includes("cause.errno: -4078"), "should print cause.errno");
  assert(formatted.includes("cause.syscall: connect"), "should print cause.syscall");
  assert(
    formatted.includes("cause.hostname: qjzuledpatlbjsymqtbb.supabase.co"),
    "should print cause.hostname"
  );

  const aggregate = new AggregateError(
    [
      Object.assign(new Error("inner failure"), { code: "ETIMEDOUT" }),
      new TypeError("socket hang up"),
    ],
    "multiple failures"
  );
  const aggregateFormatted = formatPendingMatchRecordsFetchErrorChain(aggregate, {
    pageNumber: 2,
    rangeFrom: 50,
    rangeTo: 99,
    attempt: 1,
  });
  assert(aggregateFormatted.includes("AggregateError.errors (2):"), "should list aggregate errors");
  assert(aggregateFormatted.includes("inner.code: ETIMEDOUT"), "should print inner error fields");

  const singlePageRecords = Array.from({ length: 12 }, (_, index) =>
    buildPendingRecord(`single-${index + 1}`)
  );
  const singlePageLoaded = await listPendingMatchRecordsInSupabase({
    pageSize: PENDING_CLEANUP_PAGE_SIZE,
    fetchPage: async () => singlePageRecords,
  });
  assert(singlePageLoaded.summary.pagesLoaded === 1, "single page load should read one page");
  assert(singlePageLoaded.summary.retriesUsed === 0, "single page load should not retry");
  assert(singlePageLoaded.records.length === 12, "single page load should return all records");

  const multiPageRecords = buildPendingPages(120);
  let multiPageCalls = 0;
  const multiPageLoaded = await listPendingMatchRecordsInSupabase({
    pageSize: PENDING_CLEANUP_PAGE_SIZE,
    fetchPage: async (input) => {
      multiPageCalls += 1;
      const pageIndex = input.rangeFrom / PENDING_CLEANUP_PAGE_SIZE;
      return multiPageRecords[pageIndex] ?? [];
    },
  });
  assert(multiPageCalls === 3, "multi page load should fetch three pages");
  assert(multiPageLoaded.summary.pagesLoaded === 3, "multi page summary should report three pages");
  assert(multiPageLoaded.records.length === 120, "multi page load should return all records");

  let firstPageAttempts = 0;
  const firstPageRetryLoaded = await listPendingMatchRecordsInSupabase({
    pageSize: PENDING_CLEANUP_PAGE_SIZE,
    sleep: async () => undefined,
    fetchPage: async () => {
      firstPageAttempts += 1;
      if (firstPageAttempts === 1) {
        throw new TypeError("fetch failed");
      }
      return singlePageRecords;
    },
  });
  assert(firstPageAttempts === 2, "first page should retry once after fetch failed");
  assert(firstPageRetryLoaded.summary.retriesUsed === 1, "first page retry should be counted");
  assert(firstPageRetryLoaded.records.length === 12, "first page retry should still load records");

  const middlePageRecords = buildPendingPages(75);
  let middlePageCalls = 0;
  const middlePageAttempts = [0, 0];
  const middlePageRetryLoaded = await listPendingMatchRecordsInSupabase({
    pageSize: PENDING_CLEANUP_PAGE_SIZE,
    sleep: async () => undefined,
    fetchPage: async (input) => {
      const pageIndex = input.rangeFrom / PENDING_CLEANUP_PAGE_SIZE;
      middlePageAttempts[pageIndex] += 1;
      middlePageCalls += 1;
      if (pageIndex === 1 && middlePageAttempts[1] < 3) {
        throw new TypeError("fetch failed");
      }
      return middlePageRecords[pageIndex] ?? [];
    },
  });
  assert(middlePageCalls >= 3, "middle page load should include retried middle page fetch");
  assert(middlePageRetryLoaded.summary.pagesLoaded === 2, "middle page retry should still load two pages");
  assert(middlePageRetryLoaded.summary.retriesUsed === 2, "middle page retry count should be tracked");
  assert(middlePageRetryLoaded.records.length === 75, "middle page retry should return all records");

  let exhaustedAttempts = 0;
  let exhausted = false;
  try {
    await listPendingMatchRecordsInSupabase({
      pageSize: PENDING_CLEANUP_PAGE_SIZE,
      sleep: async () => undefined,
      fetchPage: async () => {
        exhaustedAttempts += 1;
        throw new TypeError("fetch failed");
      },
    });
  } catch (error) {
    exhausted = error instanceof PendingMatchRecordsLoadError;
  }
  assert(exhausted, "loader should fail loudly after three retries");
  assert(exhaustedAttempts === 3, "loader should attempt exactly three retries before failing");

  const shortLastPageRecords = buildPendingPages(55);
  const shortLastPageLoaded = await listPendingMatchRecordsInSupabase({
    pageSize: PENDING_CLEANUP_PAGE_SIZE,
    fetchPage: async (input) => {
      const pageIndex = input.rangeFrom / PENDING_CLEANUP_PAGE_SIZE;
      return shortLastPageRecords[pageIndex] ?? [];
    },
  });
  assert(shortLastPageLoaded.summary.pagesLoaded === 2, "short last page should stop after two pages");
  assert(shortLastPageLoaded.records.length === 55, "short last page should load fifty-five records");

  const duplicateRecord = buildPendingRecord("duplicate-1");
  const duplicateLoaded = await listPendingMatchRecordsInSupabase({
    pageSize: 2,
    fetchPage: async (input) => {
      if (input.rangeFrom === 0) {
        return [duplicateRecord, buildPendingRecord("pending-2")];
      }
      if (input.rangeFrom === 2) {
        return [duplicateRecord, buildPendingRecord("pending-3")];
      }
      return [buildPendingRecord("pending-4")];
    },
  });
  assert(duplicateLoaded.summary.duplicateIdsIgnored === 1, "duplicate id should be ignored once");
  assert(
    duplicateLoaded.records.filter((record) => record.id === "duplicate-1").length === 1,
    "duplicate id should only appear once in loaded records"
  );

  const mixedStatusLoaded = await listPendingMatchRecordsInSupabase({
    pageSize: PENDING_CLEANUP_PAGE_SIZE,
    fetchPage: async () => [
      buildPendingRecord("pending-only"),
      buildPendingRecord("verified-record", { status: "VERIFIED" }),
    ],
  });
  assert(mixedStatusLoaded.records.length === 1, "loader consumer should only keep pending records when filtered upstream");
}

export async function runHistoricalPendingCleanupServiceTests(): Promise<void> {
  await runPendingMatchRecordsLoaderTests();

  const now = new Date("2026-07-19T12:00:00.000Z");
  const legacy = buildLegacyRecord("legacy-1");
  const retry = {
    ...buildLegacyRecord("retry-1"),
    fixtureId: 999,
  };

  const plan = buildHistoricalPendingCleanupPlan([legacy, retry], now);
  assert(plan.legacyExclusionCandidates.length === 1, "plan should identify one legacy record");
  assert(plan.retryCandidates.length === 1, "plan should identify one retry record");

  const store = new Map<string, HistoricalMatchRecord>([
    [legacy.id, structuredClone(legacy)],
    [retry.id, structuredClone(retry)],
  ]);

  async function listPending() {
    return [...store.values()].filter((record) => record.status === "PENDING");
  }

  async function markLegacyExcluded(recordId: string, excludedAt: string) {
    const existing = store.get(recordId);
    if (!existing || existing.status !== "PENDING") {
      return null;
    }
    if (isOperationallyExcluded(existing)) {
      return existing;
    }
    if (!existing.analysisSnapshot) {
      return null;
    }

    const updated: HistoricalMatchRecord = {
      ...existing,
      analysisSnapshot: {
        ...existing.analysisSnapshot,
        pendingPolicy: {
          excluded: true,
          reason: MISSING_FIXTURE_ID_EXCLUSION_REASON,
          excludedAt,
          source: "historical_pending_cleanup",
        },
      },
      updatedAt: excludedAt,
    };
    store.set(recordId, updated);
    return updated;
  }

  async function verifyMatch(recordId: string) {
    const existing = store.get(recordId);
    if (!existing) {
      return null;
    }
    const updated = {
      ...existing,
      status: "VERIFIED" as const,
      result: {
        fullTimeHomeGoals: 2,
        fullTimeAwayGoals: 1,
        halfTimeHomeGoals: 1,
        halfTimeAwayGoals: 0,
        winner: "home" as const,
        totalGoals: 3,
        bothTeamsScored: true,
      },
    };
    store.set(recordId, updated);
    return updated;
  }

  const dryRun = await runHistoricalPendingCleanup({
    dryRun: true,
    now,
    listPending,
  });
  assert(dryRun.dryRun === true, "dry-run should not apply changes");
  assert(dryRun.exclusionAttempts.every((item) => item.status === "skipped"), "dry-run should skip exclusions");
  assert(store.get("legacy-1")?.analysisSnapshot?.pendingPolicy == null, "dry-run should not write metadata");

  const first = await runHistoricalPendingCleanup({
    dryRun: false,
    now,
    listPending,
    markLegacyExcluded: markLegacyExcluded,
    fetchFixtureById: async () => ({
      fixtureId: 999,
      date: "2026-07-15",
      kickoffTime: null,
      league: "Test",
      leagueId: 1,
      season: 2026,
      homeTeam: "Home",
      awayTeam: "Away",
      homeTeamId: 1,
      awayTeamId: 2,
      status: "FT",
      homeGoals: 2,
      awayGoals: 1,
      halfTimeHome: 1,
      halfTimeAway: 0,
      venue: null,
      neutralVenue: false,
    }),
    verifyMatch: async (recordId) => verifyMatch(recordId),
  });

  assert(first.exclusionAttempts[0]?.status === "excluded", "legacy record should be marked excluded");
  assert(first.verificationAttempts[0]?.status === "verified", "retry record should verify");

  const marked = store.get("legacy-1");
  assert(marked?.status === "PENDING", "legacy cleanup should preserve PENDING status");
  assert(isOperationallyExcluded(marked!), "legacy cleanup should write pendingPolicy metadata");
  assert(
    marked?.analysisSnapshot?.dataCompleteness?.analysisEnriched === true,
    "cleanup should preserve dataCompleteness metadata"
  );
  assert(
    (marked?.analysisSnapshot?.marketAnalysis as { summary?: string } | undefined)?.summary ===
      "keep-me",
    "cleanup should preserve analysis snapshot content"
  );
  assert(marked?.rawOdds === "sample odds", "cleanup should preserve raw_odds");

  const second = await runHistoricalPendingCleanup({
    dryRun: false,
    now,
    listPending,
    markLegacyExcluded: markLegacyExcluded,
    fetchFixtureById: async () => null,
    verifyMatch: async () => null,
  });
  assert(
    second.plan.legacyExclusionCandidates.length === 0,
    "second cleanup run should be idempotent for legacy records"
  );
  assert(
    second.exclusionAttempts.length === 0,
    "second cleanup run should not attempt legacy exclusion again"
  );
}

async function main(): Promise<void> {
  await runHistoricalPendingCleanupServiceTests();
  console.log("historicalPendingCleanupService.test.ts passed");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
