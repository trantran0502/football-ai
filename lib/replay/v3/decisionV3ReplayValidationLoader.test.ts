import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  assertReplayValidationRecordIdsUnique,
  assertReplayValidationSupabaseEnv,
  formatReplayValidationLoadSummary,
  loadHistoricalMatchRecordsForReplayValidation,
  loadNextEnvForReplayValidation,
  REPLAY_VALIDATION_PAGE_MAX_ATTEMPTS,
  REPLAY_VALIDATION_PAGE_RETRY_BACKOFF_MS,
  REPLAY_VALIDATION_PAGE_SIZE,
  ReplayValidationConfigurationError,
  ReplayValidationLoadError,
  type ReplayValidationPageFetchInput,
  type ReplayValidationPageLoadFailureDetails,
} from "@/lib/replay/v3/decisionV3ReplayValidationLoader";
import { runDecisionV3ReplayValidation } from "@/lib/replay/v3/decisionV3ReplayValidationRunner";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function withEnv<T>(
  values: Record<string, string | undefined>,
  run: () => T | Promise<T>
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return Promise.resolve(run()).finally(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

function buildSampleRecord(
  id: string,
  createdAt = "2026-03-01T09:00:00.000Z"
): HistoricalMatchRecord {
  return {
    id,
    date: "2026-03-01",
    matchDate: "2026-03-01",
    league: "Premier League",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    rawOdds: "sample",
    marketSelections: [
      {
        marketType: "moneyline",
        marketFamily: "moneyline",
        title: "Moneyline",
        period: "full",
        side: "home",
        line: null,
        rawLine: null,
        modifier: null,
        odds: 1.85,
        impliedProbability: 0.54,
      },
    ],
    result: {
      fullTimeHomeGoals: 2,
      fullTimeAwayGoals: 1,
      halfTimeHomeGoals: 1,
      halfTimeAwayGoals: 0,
      winner: "home",
      totalGoals: 3,
      bothTeamsScored: true,
    },
    analysisSnapshot: {
      features: [],
      interpretations: [],
      marketAnalysis: { markets: [], summary: "" },
      combinedAnalysis: { summary: "", score: 0, confidence: 0 },
      candidates: [],
      recommendation: null,
      replay: null,
      bettingIntelligence: null,
      decision: null,
      capturedAt: "2026-03-01T10:00:00.000Z",
    },
    candidates: [],
    status: "VERIFIED",
    verificationResult: null,
    createdAt,
    updatedAt: "2026-03-01T12:00:00.000Z",
  };
}

function buildPagedDataset(total: number): HistoricalMatchRecord[] {
  return Array.from({ length: total }, (_, index) =>
    buildSampleRecord(
      `replay-loader-page-${index + 1}`,
      `2026-03-${String(Math.floor(index / 10) + 1).padStart(2, "0")}T${String(index % 24).padStart(2, "0")}:00:00.000Z`
    )
  );
}

function createPagedFetcher(
  records: HistoricalMatchRecord[],
  pageSize = REPLAY_VALIDATION_PAGE_SIZE
): (input: ReplayValidationPageFetchInput) => Promise<HistoricalMatchRecord[]> {
  return async ({ rangeFrom, rangeTo }) => records.slice(rangeFrom, rangeTo + 1);
}

const TEST_ENV = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test_key",
};

async function testMissingEnvFails(): Promise<void> {
  await withEnv(
    {
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    },
    async () => {
      let threw = false;
      try {
        await loadHistoricalMatchRecordsForReplayValidation();
      } catch (error) {
        threw = true;
        assert(error instanceof ReplayValidationConfigurationError, "config error type");
        assert(
          error.message.includes("Replay validation configuration error:"),
          "config error header"
        );
        assert(error.message.includes("SUPABASE_URL is missing"), "missing url message");
        assert(
          error.message.includes("SUPABASE_SERVICE_ROLE_KEY is missing"),
          "missing key message"
        );
      }
      assert(threw, "missing env should fail");
    }
  );
}

async function testFetchFailureDoesNotReturnEmptyArray(): Promise<void> {
  const secretKey = "sb_secret_test_key_do_not_leak";

  await withEnv(
    {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: secretKey,
    },
    async () => {
      let threw = false;
      try {
        await loadHistoricalMatchRecordsForReplayValidation({
          fetchPage: async () => {
            throw new TypeError("fetch failed");
          },
          sleep: async () => undefined,
        });
      } catch (error) {
        threw = true;
        assert(error instanceof ReplayValidationLoadError, "load error type");
        assert(error.details.stage === "loadHistoricalMatchRecords", "stage set");
        assert(error.details.errorName === "TypeError", "error name");
        assert(error.details.errorMessage.includes("fetch failed"), "error message");
        assert(error.details.hasSupabaseUrl, "url present flag");
        assert(error.details.hasSupabaseServiceRoleKey, "key present flag");
        assert(!error.message.includes(secretKey), "must not leak service role key");
        assert(!error.message.includes("example.supabase.co"), "must not leak full url");
      }
      assert(threw, "fetch failure should throw");
    }
  );
}

async function testSuccessfulLoadReturnsRecords(): Promise<void> {
  const records = [buildSampleRecord("replay-loader-1"), buildSampleRecord("replay-loader-2")];
  records[1].status = "PENDING";
  records[1].result = null;

  await withEnv(TEST_ENV, async () => {
    const loaded = await loadHistoricalMatchRecordsForReplayValidation({
      fetchPage: createPagedFetcher(records, 50),
    });

    assert(loaded.records.length === 2, "records returned");
    assert(loaded.summary.loadedRecords === 2, "loaded summary count");
    assert(loaded.summary.verifiedRecords === 1, "verified summary count");
    assert(loaded.summary.pageCount === 1, "single page");
    assert(loaded.summary.pageLoads[0]?.loadedCount === 2, "page load count");
    assert(
      formatReplayValidationLoadSummary(loaded.summary).includes("Total loaded: 2"),
      "load summary format"
    );
  });
}

async function testMultiPageLoad(): Promise<void> {
  const records = buildPagedDataset(120);

  await withEnv(TEST_ENV, async () => {
    const loaded = await loadHistoricalMatchRecordsForReplayValidation({
      pageSize: 50,
      fetchPage: createPagedFetcher(records, 50),
    });

    assert(loaded.records.length === 120, "all pages loaded");
    assert(loaded.summary.pageCount === 3, "three pages");
    assert(loaded.summary.pageLoads[0]?.loadedCount === 50, "page 1 count");
    assert(loaded.summary.pageLoads[1]?.loadedCount === 50, "page 2 count");
    assert(loaded.summary.pageLoads[2]?.loadedCount === 20, "final partial page count");
    assert(loaded.summary.pageLoads[0]?.rangeFrom === 0, "page 1 range from");
    assert(loaded.summary.pageLoads[0]?.rangeTo === 49, "page 1 range to");
    assert(loaded.summary.pageLoads[2]?.rangeFrom === 100, "page 3 range from");
    assert(loaded.summary.pageLoads[2]?.rangeTo === 149, "page 3 range to");
  });
}

async function testRetrySucceedsOnSecondAttempt(): Promise<void> {
  const records = buildPagedDataset(10);
  const failureLogs: ReplayValidationPageLoadFailureDetails[] = [];
  let attempts = 0;

  await withEnv(TEST_ENV, async () => {
    const loaded = await loadHistoricalMatchRecordsForReplayValidation({
      pageSize: 50,
      fetchPage: async (input) => {
        attempts += 1;
        if (attempts === 1) {
          throw new TypeError("fetch failed");
        }
        return records.slice(input.rangeFrom, input.rangeTo + 1);
      },
      sleep: async () => undefined,
      logPageLoadFailure: (details) => {
        failureLogs.push(details);
      },
    });

    assert(loaded.records.length === 10, "records loaded after retry");
    assert(loaded.summary.totalRetries === 1, "one retry recorded");
    assert(loaded.summary.pageLoads[0]?.retryCount === 1, "page retry count");
    assert(failureLogs.length === 1, "one failure log");
    assert(failureLogs[0]?.attempt === 1, "first attempt logged");
    assert(failureLogs[0]?.pageNumber === 1, "page number logged");
    assert(failureLogs[0]?.rangeFrom === 0, "range from logged");
    assert(failureLogs[0]?.rangeTo === 49, "range to logged");
  });
}

async function testAllRetriesFail(): Promise<void> {
  const failureLogs: ReplayValidationPageLoadFailureDetails[] = [];
  let attempts = 0;

  await withEnv(TEST_ENV, async () => {
    let threw = false;
    try {
      await loadHistoricalMatchRecordsForReplayValidation({
        fetchPage: async () => {
          attempts += 1;
          throw new TypeError("fetch failed");
        },
        sleep: async () => undefined,
        logPageLoadFailure: (details) => {
          failureLogs.push(details);
        },
      });
    } catch (error) {
      threw = true;
      assert(error instanceof ReplayValidationLoadError, "load error");
      assert(error.details.errorMessage.includes("fetch failed"), "fetch failed message");
    }

    assert(threw, "all retries should fail");
    assert(attempts === REPLAY_VALIDATION_PAGE_MAX_ATTEMPTS, "max attempts used");
    assert(failureLogs.length === REPLAY_VALIDATION_PAGE_MAX_ATTEMPTS, "all attempts logged");
    assert(failureLogs[0]?.attempt === 1, "attempt 1 logged");
    assert(failureLogs[1]?.attempt === 2, "attempt 2 logged");
    assert(failureLogs[2]?.attempt === 3, "attempt 3 logged");
  });
}

async function testDoesNotReturnPartialDataset(): Promise<void> {
  const pageOneRecords = buildPagedDataset(50);
  let pageTwoAttempts = 0;

  await withEnv(TEST_ENV, async () => {
    let threw = false;
    try {
      await loadHistoricalMatchRecordsForReplayValidation({
        pageSize: 50,
        fetchPage: async (input) => {
          if (input.rangeFrom === 0) {
            return pageOneRecords;
          }
          pageTwoAttempts += 1;
          throw new TypeError("fetch failed");
        },
        sleep: async () => undefined,
      });
    } catch (error) {
      threw = true;
      assert(error instanceof ReplayValidationLoadError, "load error");
    }

    assert(threw, "second page failure should abort");
    assert(
      pageTwoAttempts === REPLAY_VALIDATION_PAGE_MAX_ATTEMPTS,
      "second page retried max times"
    );
  });
}

async function testStableOrderingUsesExpectedRanges(): Promise<void> {
  const records = buildPagedDataset(75);
  const requestedRanges: ReplayValidationPageFetchInput[] = [];

  await withEnv(TEST_ENV, async () => {
    await loadHistoricalMatchRecordsForReplayValidation({
      pageSize: 50,
      fetchPage: async (input) => {
        requestedRanges.push(input);
        return records.slice(input.rangeFrom, input.rangeTo + 1);
      },
    });

    assert(requestedRanges.length === 2, "two page requests");
    assert(requestedRanges[0]?.rangeFrom === 0 && requestedRanges[0]?.rangeTo === 49, "page 1 range");
    assert(requestedRanges[1]?.rangeFrom === 50 && requestedRanges[1]?.rangeTo === 99, "page 2 range");
  });
}

function testDuplicateIdGuard(): void {
  let threw = false;
  try {
    assertReplayValidationRecordIdsUnique([
      buildSampleRecord("duplicate-id"),
      buildSampleRecord("duplicate-id"),
    ]);
  } catch (error) {
    threw = true;
    assert(error instanceof Error, "duplicate guard throws");
    assert(error.message.includes("duplicate-id"), "duplicate id in message");
  }
  assert(threw, "duplicate ids should fail");
}

async function testDuplicateIdGuardDuringLoad(): Promise<void> {
  const records = [
    buildSampleRecord("duplicate-id"),
    buildSampleRecord("duplicate-id"),
  ];

  await withEnv(TEST_ENV, async () => {
    let threw = false;
    try {
      await loadHistoricalMatchRecordsForReplayValidation({
        fetchPage: createPagedFetcher(records, 50),
      });
    } catch (error) {
      threw = true;
      assert(error instanceof ReplayValidationLoadError, "wrapped load error");
      assert(
        error.details.errorMessage.includes("Duplicate match record id detected"),
        "duplicate message"
      );
    }
    assert(threw, "duplicate ids during load should fail");
  });
}

function testEnvLoaderUsesNextEnv(): void {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    loadNextEnvForReplayValidation(process.cwd());
    assert(Boolean(process.env.SUPABASE_URL?.trim()), ".env.local should expose SUPABASE_URL");
    assert(
      Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
      ".env.local should expose SUPABASE_SERVICE_ROLE_KEY"
    );
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
}

function testReplayValidationCoreUnchanged(): void {
  const records = [buildSampleRecord("replay-loader-core-1")];
  const run = runDecisionV3ReplayValidation({
    records,
    options: { includeMockFixtures: false },
  });

  assert(run.report.dataset.totalRecords === 1, "core validation total unchanged");
  assert(typeof run.report.verdict === "string", "core validation verdict unchanged");
}

function testAssertReplayValidationSupabaseEnv(): void {
  assertReplayValidationSupabaseEnv({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test_key",
  });
}

function testRetryBackoffConstants(): void {
  assert(REPLAY_VALIDATION_PAGE_SIZE === 50, "page size constant");
  assert(REPLAY_VALIDATION_PAGE_MAX_ATTEMPTS === 3, "max attempts constant");
  assert(
    REPLAY_VALIDATION_PAGE_RETRY_BACKOFF_MS.join(",") === "500,1000,2000",
    "retry backoff constant"
  );
}

export async function runDecisionV3ReplayValidationLoaderTests(): Promise<void> {
  testEnvLoaderUsesNextEnv();
  testAssertReplayValidationSupabaseEnv();
  testRetryBackoffConstants();
  testDuplicateIdGuard();
  testReplayValidationCoreUnchanged();
  await testMissingEnvFails();
  await testFetchFailureDoesNotReturnEmptyArray();
  await testSuccessfulLoadReturnsRecords();
  await testMultiPageLoad();
  await testRetrySucceedsOnSecondAttempt();
  await testAllRetriesFail();
  await testDoesNotReturnPartialDataset();
  await testStableOrderingUsesExpectedRanges();
  await testDuplicateIdGuardDuringLoad();
}

void runDecisionV3ReplayValidationLoaderTests()
  .then(() => {
    console.log("Decision v3 replay validation loader tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
