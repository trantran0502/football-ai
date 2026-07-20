import {
  resetApiFootballQuotaForTests,
  setApiFootballQuotaForTests,
  canMakeProfileApiFootballRequest,
  getGeneralDailyQuotaLimit,
  getResultUpdateReservedDailyQuota,
  canMakeApiFootballRequestForResultUpdate,
  getProfileApiMinuteBudget,
} from "@/lib/providers/apiFootball/apiFootballQuota";
import {
  beginGroundingRuntimeMetricsBatch,
  getGroundingRuntimeMetricsSnapshot,
} from "@/lib/admin/groundingRuntimeMetrics";
import {
  buildDailyAnalysisObservabilityDiagnostics,
  observabilityDiagnosticsToExecutionContext,
} from "@/lib/scheduler/executionDiagnostics";
import { buildWeightConfigSnapshotMetadata } from "@/lib/recommendation/weightConfigRuntime";
import {
  buildProductionBaselineWeightConfig,
  PRODUCTION_BASELINE_WEIGHT_CONFIG_VERSION,
} from "@/lib/recommendation/productionWeightConfig";
import { loadRuntimeWeightConfigForProduction } from "@/lib/recommendation/runtimeWeightConfigLoader";
import { buildFallbackWeightConfig } from "@/lib/recommendation/weightConfigRuntime";
import {
  cachePlanSeasonRestriction,
  resetPlanCapabilityCacheForTests,
  resolveProfileFetchSeason,
  getPlanCapabilityMetricsSnapshot,
} from "@/lib/teamProfile/planCapabilityCache";
import {
  beginProfileCacheMetricsBatch,
  getProfileCacheMetricsSnapshot,
  recordProfileCacheHit,
  resetProfileCacheMetricsForTests,
} from "@/lib/teamProfile/profileCacheMetrics";
import { enableTeamProfileMemoryStoreForTests, disableTeamProfileMemoryStoreForTests, upsertTeamProfile } from "@/lib/teamProfile/teamProfileRepository";
import { refreshTeamProfile, resetTeamProfileRefreshDedupeForTests } from "@/lib/teamProfile/teamProfileService";
import type { TeamProfile } from "@/lib/teamProfile/teamProfileTypes";
import { fetchGoogleLiveResultWithOutcome } from "@/lib/providers/googleSearch/googleSearchService";
import {
  resetGoogleSearchProviderForTests,
  setGoogleSearchProviderForTests,
  type GoogleSearchProvider,
} from "@/lib/providers/googleSearch/googleSearchProvider";
import { resetGroundingRuntimeMetricsForTests } from "@/lib/admin/groundingRuntimeMetrics";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function buildCompleteProfile(teamId: number): TeamProfile {
  const now = new Date().toISOString();
  return {
    id: `profile-${teamId}`,
    teamId,
    teamName: `Team ${teamId}`,
    leagueId: 39,
    leagueName: "Premier League",
    season: 2026,
    requestedSeason: 2026,
    isHistoricalBaseline: false,
    stalenessYears: 0,
    sampleSize: 10,
    recent10Wins: 4,
    recent10Draws: 3,
    recent10Losses: 3,
    recent10PointsPerGame: 1.5,
    recent10AvgGoals: 1.4,
    recent10AvgConceded: 1.2,
    home5Matches: 5,
    home5WinRate: 0.4,
    home5AvgGoals: 1.6,
    home5AvgConceded: 1.0,
    away5Matches: 5,
    away5WinRate: 0.2,
    away5AvgGoals: 1.2,
    away5AvgConceded: 1.4,
    bttsRate: 0.5,
    over25Rate: 0.5,
    over35Rate: 0.2,
    under25Rate: 0.5,
    cleanSheetRate: 0.3,
    failedToScoreRate: 0.2,
    avgShots: 12,
    avgShotsOnTarget: 4,
    avgPossession: 50,
    avgXg: null,
    avgXga: null,
    formScore: 55,
    momentumScore: 50,
    dataCompleteness: 90,
    source: "api-football",
    calculatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

async function testPlanCapabilitySkipsRestrictedSeasonAfterCache(): Promise<void> {
  resetPlanCapabilityCacheForTests();
  cachePlanSeasonRestriction({
    leagueId: 39,
    requestedSeason: 2026,
    planRange: { minSeason: 2022, maxSeason: 2024, message: "free plan restricted" },
  });

  const first = resolveProfileFetchSeason({ leagueId: 39, requestedSeason: 2026 });
  assert(first.skipRequestedSeasonAttempt === true, "cached restriction should skip requested season");
  assert(first.initialFetchSeason === 2024, "should use max allowed season");

  const second = resolveProfileFetchSeason({ leagueId: 39, requestedSeason: 2026 });
  const metrics = getPlanCapabilityMetricsSnapshot();
  assert(second.capabilityCacheHit === true, "second lookup should hit capability cache");
  assert(metrics.planRestrictedRequestsAvoided >= 1, "should count avoided restricted requests");
}

async function testCachedCompleteProfileSkipsApi(): Promise<void> {
  resetProfileCacheMetricsForTests();
  resetTeamProfileRefreshDedupeForTests();
  enableTeamProfileMemoryStoreForTests();
  beginProfileCacheMetricsBatch();

  const profile = buildCompleteProfile(42);
  await upsertTeamProfile(profile);

  const apiCalls: string[] = [];
  const originalFetch = global.fetch;
  global.fetch = async () => {
    apiCalls.push("api");
    return new Response(JSON.stringify({ response: [] }), { status: 200 });
  };

  try {
    const result = await refreshTeamProfile({
      teamId: 42,
      teamName: "Team 42",
      leagueId: 39,
      leagueName: "Premier League",
      season: 2026,
      allowApiFetch: true,
      waitForQuota: false,
    });
    assert(result.skippedReason === "fresh_profile", "complete cached profile should skip API");
    assert(apiCalls.length === 0, "cached complete profile must not call API");
    const metrics = getProfileCacheMetricsSnapshot();
    assert(metrics.profileCacheHit >= 1, "should record profile cache hit");
  } finally {
    global.fetch = originalFetch;
    disableTeamProfileMemoryStoreForTests();
  }
}

function testProfileMinuteBudgetDefersBeforeHardLimit(): void {
  resetApiFootballQuotaForTests();
  setApiFootballQuotaForTests({ minuteCount: getProfileApiMinuteBudget() });
  assert(canMakeProfileApiFootballRequest() === false, "profile budget should stop before minute hard limit");
  assert(getProfileApiMinuteBudget() < 10, "profile budget should leave headroom for result update");
}

function testGroundingConfiguredWhenGeminiKeyPresent(): void {
  resetGroundingRuntimeMetricsForTests();
  const previous = process.env.GOOGLE_GEMINI_API_KEY;
  process.env.GOOGLE_GEMINI_API_KEY = "test-key";
  beginGroundingRuntimeMetricsBatch(true);
  const metrics = getGroundingRuntimeMetricsSnapshot();
  if (previous) {
    process.env.GOOGLE_GEMINI_API_KEY = previous;
  } else {
    delete process.env.GOOGLE_GEMINI_API_KEY;
  }
  assert(metrics.groundingConfigured === true, "groundingConfigured should be true when key exists");
}

async function testGroundingSuccessPersistsCitations(): Promise<void> {
  resetGroundingRuntimeMetricsForTests();
  resetGoogleSearchProviderForTests();
  process.env.GOOGLE_GEMINI_API_KEY = "test-key";

  const mockProvider = {
    isConfigured: () => true,
    canMakeRequest: () => true,
    fetchTeamContext: async () => ({
      payload: { injuries: [] },
      citations: [{ title: "Example", url: "https://example.com" }],
      confidence: 0.8,
      searchTime: "2026-07-20T00:00:00.000Z",
      query: "team context grounding",
      rawResponse: {},
      model: "gemini-2.0-flash",
    }),
    fetchTeamContextWithDiagnostics: async () => ({
      result: {
        payload: { injuries: [] },
        citations: [{ title: "Example", url: "https://example.com" }],
        confidence: 0.8,
        searchTime: "2026-07-20T00:00:00.000Z",
        query: "team context grounding",
        rawResponse: {},
        model: "gemini-2.0-flash",
      },
      diagnostics: {
        httpStatus: 200,
        model: "gemini-2.0-flash",
        groundingFallbackUsed: false,
        geminiErrorCode: null,
        geminiErrorMessage: null,
        candidateCount: 1,
        finishReason: "STOP",
        safetyBlockReason: null,
        hasResponseText: true,
        hasGroundingMetadata: true,
        parseFailureReason: null,
        failureReason: null,
        groundingChunksCount: 1,
        groundingSupportsCount: 0,
        webSearchQueriesCount: 1,
      },
    }),
  } as unknown as GoogleSearchProvider;
  setGoogleSearchProviderForTests(mockProvider);

  try {
    const outcome = await fetchGoogleLiveResultWithOutcome({
      homeTeam: "A",
      awayTeam: "B",
      matchDate: "2026-07-20",
    });
    assert(outcome.result?.citations.length === 1, "grounding success should include citations");
    const raw = outcome.result?.rawResponse as Record<string, unknown> | undefined;
    assert(raw?.capturedAt != null || raw?.citations != null, "grounding success should persist normalized payload");
  } finally {
    resetGoogleSearchProviderForTests();
    delete process.env.GOOGLE_GEMINI_API_KEY;
  }
}

async function testGroundingFailureHasReason(): Promise<void> {
  resetGroundingRuntimeMetricsForTests();
  resetGoogleSearchProviderForTests();
  process.env.GOOGLE_GEMINI_API_KEY = "test-key";

  const mockProvider = {
    isConfigured: () => true,
    canMakeRequest: () => true,
    fetchTeamContext: async () => null,
    fetchTeamContextWithDiagnostics: async () => ({
      result: null,
      diagnostics: {
        httpStatus: 200,
        model: "gemini-2.0-flash",
        groundingFallbackUsed: false,
        geminiErrorCode: null,
        geminiErrorMessage: null,
        candidateCount: 1,
        finishReason: "STOP",
        safetyBlockReason: null,
        hasResponseText: false,
        hasGroundingMetadata: false,
        parseFailureReason: "metadata_only_no_text",
        failureReason: "empty_text",
        groundingChunksCount: 0,
        groundingSupportsCount: 0,
        webSearchQueriesCount: 0,
      },
    }),
  } as unknown as GoogleSearchProvider;
  setGoogleSearchProviderForTests(mockProvider);

  try {
    const outcome = await fetchGoogleLiveResultWithOutcome({
      homeTeam: "A",
      awayTeam: "B",
      matchDate: "2026-07-20",
    });
    assert(outcome.failureReason != null, "grounding failure must expose failureReason");
    const metrics = getGroundingRuntimeMetricsSnapshot();
    assert(metrics.groundingFailureReason != null, "metrics should record failure reason");
  } finally {
    resetGoogleSearchProviderForTests();
    delete process.env.GOOGLE_GEMINI_API_KEY;
  }
}

function testExecutionAndResponseDiagnosticsShape(): void {
  beginProfileCacheMetricsBatch();
  recordProfileCacheHit();
  const weightConfig = buildWeightConfigSnapshotMetadata({
    ...buildProductionBaselineWeightConfig(),
    loadedAt: "2026-07-20T00:00:00.000Z",
  });
  const diagnostics = buildDailyAnalysisObservabilityDiagnostics({ weightConfig });
  const context = observabilityDiagnosticsToExecutionContext(diagnostics);
  assert(typeof context.groundingConfigured === "boolean", "execution context should include groundingConfigured");
  assert(typeof context.profileCacheHit === "number", "execution context should include profileCacheHit");
  assert(typeof context.groundingHttpStatus !== "undefined", "execution context should include groundingHttpStatus");
  assert(typeof context.groundingFallbackUsed === "boolean", "execution context should include groundingFallbackUsed");
  assert(context.diagnostics != null, "execution context should include nested diagnostics");
}

async function testSchedulerLoadsProductionBaseline(): Promise<void> {
  const config = await loadRuntimeWeightConfigForProduction({
    now: () => Date.parse("2026-07-20T00:00:00.000Z"),
    getActiveWeightConfig: async () => buildProductionBaselineWeightConfig(),
  });
  const metadata = buildWeightConfigSnapshotMetadata(config);
  assert(metadata.source === "production_baseline", "batch weight config should use production_baseline");
  assert(
    metadata.versionLabel === PRODUCTION_BASELINE_WEIGHT_CONFIG_VERSION,
    "batch weight config should expose production-baseline-v1"
  );
}

function testResultUpdateReservedQuotaUnaffected(): void {
  resetApiFootballQuotaForTests();
  setApiFootballQuotaForTests({ dailyCount: getGeneralDailyQuotaLimit() });
  assert(canMakeProfileApiFootballRequest() === false, "general/profile budget should be exhausted first");
  assert(canMakeApiFootballRequestForResultUpdate() === true, "result update reserve should remain available");
  assert(getResultUpdateReservedDailyQuota() > 0, "result update reserve must stay configured");
}

async function runTests(): Promise<void> {
  await testPlanCapabilitySkipsRestrictedSeasonAfterCache();
  await testCachedCompleteProfileSkipsApi();
  testProfileMinuteBudgetDefersBeforeHardLimit();
  testGroundingConfiguredWhenGeminiKeyPresent();
  await testGroundingSuccessPersistsCitations();
  await testGroundingFailureHasReason();
  testExecutionAndResponseDiagnosticsShape();
  await testSchedulerLoadsProductionBaseline();
  testResultUpdateReservedQuotaUnaffected();
  void buildFallbackWeightConfig;
  console.log("productionDataCompletenessPhase2Fix.test.ts passed");
}

void runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
