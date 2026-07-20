import {
  assessRecommendationDataCompleteness,
  isGroundingRequiredForRecommendation,
} from "@/lib/analysis/analysisDataCompleteness";
import type { AnalysisReport } from "@/lib/analysis/types";
import type { TeamProfile } from "@/lib/teamProfile/teamProfileTypes";
import {
  beginGroundingRequestBudgetBatch,
  getGroundingRequestBudgetPerBatch,
  getGroundingRequestBudgetSnapshot,
  isGroundingRateLimitCooldownActive,
  resetGroundingRequestBudgetForTests,
} from "@/lib/providers/googleSearch/groundingRequestBudget";
import {
  prefetchProductionCombinedGrounding,
  resetCombinedGroundingPrefetchGuardForTests,
} from "@/lib/providers/googleSearch/combinedGroundingProvider";
import {
  buildCombinedGroundingCacheKey,
  getCachedGoogleRecord,
  rememberGoogleLiveResult,
  resetGoogleSearchCacheForTests,
} from "@/lib/providers/googleSearch/googleSearchCache";
import { fetchGoogleLiveResultWithOutcome } from "@/lib/providers/googleSearch/googleSearchService";
import {
  resetGoogleSearchProviderForTests,
  setGeminiFetchForTests,
} from "@/lib/providers/googleSearch/googleSearchProvider";
import { resolveSquadAvailabilityFromGoogleSearch } from "@/lib/providers/squadAvailability/squadAvailabilityGoogleSource";
import { resolveMatchContextFromGoogleSearch } from "@/lib/providers/matchContext/matchContextGoogleSource";
import { shouldSkipGroundingDeferredRetry } from "@/lib/providers/googleSearch/groundingDeferredPolicy";
import {
  getResultUpdateReservedDailyQuota,
  resetApiFootballQuotaForTests,
} from "@/lib/providers/apiFootball/apiFootballQuota";
import { resetGroundingRuntimeMetricsForTests } from "@/lib/admin/groundingRuntimeMetrics";
import { buildDailyAnalysisObservabilityDiagnostics } from "@/lib/scheduler/executionDiagnostics";
import { buildProductionBaselineWeightConfig } from "@/lib/recommendation/productionWeightConfig";
import { buildWeightConfigSnapshotMetadata } from "@/lib/recommendation/weightConfigRuntime";
import { clearProductionSquadAvailabilityCacheForTests } from "@/lib/providers/squadAvailability/squadAvailabilityCache";
import { clearProductionMatchContextCacheForTests } from "@/lib/providers/matchContext/matchContextCache";
import type { GeminiGenerateContentResponse } from "@/lib/providers/googleSearch/googleSearchTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const FIXTURE = {
  fixtureId: 101,
  homeTeam: "Arsenal",
  awayTeam: "Liverpool",
  matchDate: "2026-07-20",
  kickoffTime: "2026-07-20T15:00:00.000Z",
};

const STRUCTURED = {
  recentFormLast10Official: [],
  recentFormLast5Home: [],
  recentFormLast5Away: [],
  includesFriendlies: false,
  includesExtraTime: false,
  includesPenalties: false,
  h2hLast5Official: [],
  standings: [],
  injuries: [
    {
      teamName: "Arsenal",
      playerName: "Player A",
      reason: "Knee",
      status: "Out",
      sourceUrl: "https://example.com/injury",
    },
  ],
  suspensions: [],
  matchStatus: {
    importance: "High",
    mustWin: true,
    alreadyQualified: false,
    alreadyEliminated: false,
    weather: "Clear",
    longTravelAway: false,
    congestedSchedule: false,
    coachNews: "Rotation expected",
    officialNews: null,
    rotation: "2 changes",
  },
};

function buildProfile(source: TeamProfile["source"] = "api-football"): TeamProfile {
  return {
    teamId: 1,
    teamName: "Team",
    leagueId: 39,
    leagueName: "Premier League",
    season: 2026,
    requestedSeason: 2026,
    isHistoricalBaseline: false,
    stalenessYears: 0,
    sampleSize: 10,
    recent10Wins: 6,
    recent10Draws: 2,
    recent10Losses: 2,
    recent10PointsPerGame: 2,
    recent10AvgGoals: 1.8,
    recent10AvgConceded: 1.1,
    home5Matches: 5,
    home5WinRate: 0.6,
    home5AvgGoals: 2,
    home5AvgConceded: 1,
    away5Matches: 5,
    away5WinRate: 0.4,
    away5AvgGoals: 1.5,
    away5AvgConceded: 1.2,
    bttsRate: 0.5,
    over25Rate: 0.5,
    over35Rate: 0.2,
    under25Rate: 0.5,
    cleanSheetRate: 0.3,
    failedToScoreRate: 0.2,
    avgShots: 12,
    avgShotsOnTarget: 5,
    avgPossession: 52,
    avgXg: 1.5,
    avgXga: 1.1,
    formScore: 70,
    momentumScore: 65,
    source,
    dataCompleteness: 85,
    calculatedAt: "2026-07-19T10:00:00.000Z",
  };
}

function successGeminiResponse(): GeminiGenerateContentResponse {
  return {
    candidates: [
      {
        content: {
          parts: [{ text: JSON.stringify(STRUCTURED) }],
        },
        groundingMetadata: {
          webSearchQueries: ["Arsenal vs Liverpool"],
          groundingChunks: [
            {
              web: {
                uri: "https://example.com/source",
                title: "Example Source",
              },
            },
          ],
        },
      },
    ],
  };
}

function resetGroundingTestState(): void {
  resetGoogleSearchCacheForTests();
  resetGoogleSearchProviderForTests();
  resetGroundingRuntimeMetricsForTests();
  resetGroundingRequestBudgetForTests();
  resetCombinedGroundingPrefetchGuardForTests();
  clearProductionSquadAvailabilityCacheForTests();
  clearProductionMatchContextCacheForTests();
  delete process.env.GOOGLE_GROUNDING_REQUEST_BUDGET_PER_BATCH;
  delete process.env.REQUIRE_GROUNDING_FOR_RECOMMENDATION;
  setGeminiFetchForTests(null);
}

async function testSingleFixtureUsesOneGeminiRequest(): Promise<void> {
  resetGroundingTestState();
  beginGroundingRequestBudgetBatch();
  let calls = 0;
  setGeminiFetchForTests(async () => {
    calls += 1;
    return new Response(JSON.stringify(successGeminiResponse()), { status: 200 });
  });

  process.env.GOOGLE_GEMINI_API_KEY = "test-key";
  const result = await prefetchProductionCombinedGrounding(FIXTURE);
  assert(calls === 1, "combined prefetch should call Gemini once per fixture");
  assert(result.squadResolution != null, "squad resolution should be populated");
  assert(result.matchContextResolution != null, "match context resolution should be populated");
  assert(result.combinedGrounding.called === true, "combined grounding should be marked called");
  assert(result.squadGrounding.called === false, "squad channel should not count as separate HTTP call");
  assert(result.matchContextGrounding.called === false, "match context channel should not count as separate HTTP call");
  assert(
    result.squadGrounding.skippedReason === "combined_grounding_channel",
    "squad channel should reference combined grounding"
  );
  assert(
    result.matchContextGrounding.skippedReason === "combined_grounding_channel",
    "match context channel should reference combined grounding"
  );
  assert(result.combinedGroundingRequestId.length > 0, "combined request id should be present");
  delete process.env.GOOGLE_GEMINI_API_KEY;
}

async function testThreeFixturesWithBudgetTwoOnlyCallsTwice(): Promise<void> {
  resetGroundingTestState();
  process.env.GOOGLE_GROUNDING_REQUEST_BUDGET_PER_BATCH = "2";
  beginGroundingRequestBudgetBatch();
  let calls = 0;
  setGeminiFetchForTests(async () => {
    calls += 1;
    return new Response(JSON.stringify(successGeminiResponse()), { status: 200 });
  });
  process.env.GOOGLE_GEMINI_API_KEY = "test-key";

  const fixtures = [
    { ...FIXTURE, fixtureId: 101, homeTeam: "Arsenal", awayTeam: "Liverpool" },
    { ...FIXTURE, fixtureId: 102, homeTeam: "Chelsea", awayTeam: "Tottenham" },
    { ...FIXTURE, fixtureId: 103, homeTeam: "Man City", awayTeam: "Man Utd" },
  ];

  for (const fixture of fixtures) {
    await prefetchProductionCombinedGrounding(fixture);
  }

  assert(calls === 2, "budget=2 should allow only two live Gemini requests");
  const snapshot = getGroundingRequestBudgetSnapshot();
  assert(snapshot.groundingRequestsAvoidedByBudget >= 1, "third fixture should avoid request by budget");
  delete process.env.GOOGLE_GEMINI_API_KEY;
}

async function test429StopsSubsequentRequests(): Promise<void> {
  resetGroundingTestState();
  process.env.GOOGLE_GROUNDING_REQUEST_BUDGET_PER_BATCH = "5";
  beginGroundingRequestBudgetBatch();
  let calls = 0;
  setGeminiFetchForTests(async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: { message: "rate limit", code: 429 } }), {
      status: 429,
    });
  });
  process.env.GOOGLE_GEMINI_API_KEY = "test-key";

  await prefetchProductionCombinedGrounding(FIXTURE);
  await prefetchProductionCombinedGrounding({ ...FIXTURE, fixtureId: 102 });
  await prefetchProductionCombinedGrounding({ ...FIXTURE, fixtureId: 103 });

  assert(calls === 1, "429 should stop further Gemini requests in same execution");
  assert(isGroundingRateLimitCooldownActive(), "429 should activate cooldown");
  const snapshot = getGroundingRequestBudgetSnapshot();
  assert(snapshot.groundingRateLimitTriggered === true, "rate limit flag should be set");
  delete process.env.GOOGLE_GEMINI_API_KEY;
}

async function testCacheHitDoesNotCallGemini(): Promise<void> {
  resetGroundingTestState();
  beginGroundingRequestBudgetBatch();
  const cacheFixture = { ...FIXTURE, fixtureId: 999 };
  const cacheKey = buildCombinedGroundingCacheKey(cacheFixture);
  const searchTime = new Date().toISOString();
  rememberGoogleLiveResult(cacheKey, {
    payload: {
      fetchedAt: searchTime,
      source: "googleSearch",
      queries: ["combined"],
      citations: [
        {
          title: "Example Source",
          url: "https://example.com/injury",
          snippet: "snippet",
        },
      ],
      confidence: 0.8,
      news: [],
      injuries: [
        {
          teamName: "Arsenal",
          playerName: "Player A",
          reason: "Knee",
          status: "Out",
        },
      ],
      weather: null,
      recentForm: [],
      h2h: [],
      homeTeam: FIXTURE.homeTeam,
      awayTeam: FIXTURE.awayTeam,
      matchDate: FIXTURE.matchDate,
      recentFormLast10Official: [],
      recentFormLast5Home: [],
      recentFormLast5Away: [],
      includesFriendlies: false,
      includesExtraTime: false,
      includesPenalties: false,
      h2hLast5Official: [],
      standings: [],
      suspensions: [],
      homeMetrics: null,
      awayMetrics: null,
      matchStatus: {
        importance: "High",
        mustWin: true,
        alreadyQualified: false,
        alreadyEliminated: false,
        weather: "Clear",
        longTravelAway: false,
        congestedSchedule: false,
        coachNews: "Rotation expected",
        officialNews: null,
        rotation: "2 changes",
      },
    },
    citations: [
      {
        title: "Example Source",
        url: "https://example.com/source",
        snippet: "snippet",
      },
    ],
    confidence: 0.8,
    searchTime,
    query: "combined fixture grounding",
    rawResponse: successGeminiResponse(),
  });

  assert(getCachedGoogleRecord(cacheKey) != null, "cache should be seeded before prefetch");

  let calls = 0;
  setGeminiFetchForTests(async () => {
    calls += 1;
    return new Response(JSON.stringify(successGeminiResponse()), { status: 200 });
  });
  process.env.GOOGLE_GEMINI_API_KEY = "test-key";

  await prefetchProductionCombinedGrounding(cacheFixture);
  assert(calls === 0, "cache hit should not call Gemini");
  const snapshot = getGroundingRequestBudgetSnapshot();
  assert(snapshot.groundingRequestsAvoidedByCache >= 1, "cache avoidance should be counted");
  delete process.env.GOOGLE_GEMINI_API_KEY;
}

function testCombinedResponseSplitsSquadAndMatchContext(): void {
  resetGroundingTestState();
  const cacheKey = buildCombinedGroundingCacheKey(FIXTURE);
  const searchTime = new Date().toISOString();
  rememberGoogleLiveResult(cacheKey, {
    payload: {
      fetchedAt: searchTime,
      source: "googleSearch",
      queries: ["combined"],
      citations: [],
      confidence: 0.8,
      news: [],
      injuries: [
        {
          teamName: "Arsenal",
          playerName: "Player A",
          reason: "Knee",
          status: "Out",
        },
      ],
      weather: null,
      recentForm: [],
      h2h: [],
      homeTeam: FIXTURE.homeTeam,
      awayTeam: FIXTURE.awayTeam,
      matchDate: FIXTURE.matchDate,
      recentFormLast10Official: [],
      recentFormLast5Home: [],
      recentFormLast5Away: [],
      includesFriendlies: false,
      includesExtraTime: false,
      includesPenalties: false,
      h2hLast5Official: [],
      standings: [],
      suspensions: [],
      homeMetrics: null,
      awayMetrics: null,
      matchStatus: {
        importance: "High",
        mustWin: true,
        alreadyQualified: false,
        alreadyEliminated: false,
        weather: "Clear",
        longTravelAway: false,
        congestedSchedule: false,
        coachNews: "Rotation expected",
        officialNews: null,
        rotation: "2 changes",
      },
    },
    citations: [
      {
        title: "Example Source",
        url: "https://example.com/injury",
        snippet: "snippet",
      },
    ],
    confidence: 0.8,
    searchTime,
    query: "combined fixture grounding",
    rawResponse: successGeminiResponse(),
  });

  const squad = resolveSquadAvailabilityFromGoogleSearch({
    request: {
      homeTeam: FIXTURE.homeTeam,
      awayTeam: FIXTURE.awayTeam,
      matchDate: FIXTURE.matchDate,
    },
    fixtureId: FIXTURE.fixtureId,
    kickoffTime: FIXTURE.kickoffTime,
  });
  const matchContext = resolveMatchContextFromGoogleSearch({
    request: {
      homeTeam: FIXTURE.homeTeam,
      awayTeam: FIXTURE.awayTeam,
      matchDate: FIXTURE.matchDate,
    },
    fixtureId: FIXTURE.fixtureId,
    kickoffTime: FIXTURE.kickoffTime,
  });

  assert(squad != null, "combined cache should split squad availability");
  assert(matchContext != null, "combined cache should split match context");
  assert(squad.source === "googleSearch", "squad should come from google search");
  assert(matchContext.source === "googleSearch", "match context should come from google search");
}

function testGroundingFailureWithCompleteProfilesAllowsBasicAnalysis(): void {
  delete process.env.REQUIRE_GROUNDING_FOR_RECOMMENDATION;
  assert(isGroundingRequiredForRecommendation() === false, "grounding should not be required by default");

  const assessment = assessRecommendationDataCompleteness({
    report: {
      match: {
        homeTeam: "Home FC",
        awayTeam: "Away FC",
        league: "Premier League",
      },
      teamProfiles: {
        home: buildProfile("api-football"),
        away: buildProfile("api-football"),
      },
    } as AnalysisReport,
    matchId: "101",
    rawSources: {},
  });

  assert(assessment.groundingUnavailable === true, "grounding should be marked unavailable");
  assert(assessment.eligibleForRecommendation === true, "essential profiles should allow recommendation");
  assert(
    assessment.quotaWarnings.some((warning) => warning.includes("Google grounding supplemental")),
    "grounding unavailable should add warning not block"
  );
}

function testGroundingUnavailableDoesNotFabricateData(): void {
  resetGroundingTestState();
  const squad = resolveSquadAvailabilityFromGoogleSearch({
    request: {
      homeTeam: FIXTURE.homeTeam,
      awayTeam: FIXTURE.awayTeam,
      matchDate: FIXTURE.matchDate,
    },
    fixtureId: FIXTURE.fixtureId,
    kickoffTime: FIXTURE.kickoffTime,
  });
  assert(squad == null, "missing grounding cache must not fabricate squad data");
}

function testPastKickoffDeferredFixtureSkipsRetry(): void {
  const now = new Date("2026-07-20T16:00:00.000Z");
  assert(
    shouldSkipGroundingDeferredRetry({
      kickoffTime: "2026-07-20T15:00:00.000Z",
      now,
    }),
    "past kickoff deferred fixture should skip retry"
  );
  assert(
    shouldSkipGroundingDeferredRetry({
      kickoffTime: "2026-07-20T16:10:00.000Z",
      now,
    }),
    "kickoff within 15 minutes should skip retry"
  );
}

function testResultUpdateReservedQuotaUnaffected(): void {
  resetApiFootballQuotaForTests();
  beginGroundingRequestBudgetBatch();
  const reserved = getResultUpdateReservedDailyQuota();
  assert(reserved > 0, "result update reserved quota should remain configured");
  assert(
    getGroundingRequestBudgetPerBatch() === 2,
    "grounding budget should be independent from result update quota"
  );
}

async function testDuplicateCombinedPrefetchUsesSingleHttpRequest(): Promise<void> {
  resetGroundingTestState();
  beginGroundingRequestBudgetBatch();
  let calls = 0;
  setGeminiFetchForTests(async () => {
    calls += 1;
    return new Response(JSON.stringify(successGeminiResponse()), { status: 200 });
  });
  process.env.GOOGLE_GEMINI_API_KEY = "test-key";

  await prefetchProductionCombinedGrounding(FIXTURE);
  await prefetchProductionCombinedGrounding(FIXTURE);

  assert(calls === 1, "duplicate combined prefetch for same fixture must not refetch");
  delete process.env.GOOGLE_GEMINI_API_KEY;
}

function testObservabilityDiagnosticsIncludeBudgetFields(): void {
  resetGroundingTestState();
  beginGroundingRequestBudgetBatch();
  const diagnostics = buildDailyAnalysisObservabilityDiagnostics({
    weightConfig: buildWeightConfigSnapshotMetadata(
      buildProductionBaselineWeightConfig(new Date("2026-07-20T00:00:00.000Z"))
    ),
  });

  assert(diagnostics.groundingRequestBudget === 2, "groundingRequestBudget should default to 2");
  assert(typeof diagnostics.groundingRequestsUsed === "number", "groundingRequestsUsed required");
  assert(
    typeof diagnostics.groundingRequestsAvoidedByBudget === "number",
    "groundingRequestsAvoidedByBudget required"
  );
  assert(
    typeof diagnostics.groundingRateLimitTriggered === "boolean",
    "groundingRateLimitTriggered required"
  );
  assert(typeof diagnostics.groundingCooldownActive === "boolean", "groundingCooldownActive required");
  assert(typeof diagnostics.groundingDeferredCount === "number", "groundingDeferredCount required");
  assert(
    typeof diagnostics.combinedGroundingRequestCount === "number",
    "combinedGroundingRequestCount required"
  );
  assert(
    diagnostics.groundingCalled === diagnostics.groundingRequestsUsed,
    "groundingCalled must equal actual HTTP request count"
  );
  assert(
    diagnostics.groundingSearchCount === diagnostics.combinedGroundingRequestCount,
    "groundingSearchCount must equal combined request count"
  );
}

async function testCombinedSplitIncrementsGroundingCalledOnce(): Promise<void> {
  resetGroundingTestState();
  beginGroundingRequestBudgetBatch();
  setGeminiFetchForTests(async () =>
    new Response(JSON.stringify(successGeminiResponse()), { status: 200 })
  );
  process.env.GOOGLE_GEMINI_API_KEY = "test-key";

  await prefetchProductionCombinedGrounding(FIXTURE);
  const diagnostics = buildDailyAnalysisObservabilityDiagnostics({
    weightConfig: buildWeightConfigSnapshotMetadata(
      buildProductionBaselineWeightConfig(new Date("2026-07-20T00:00:00.000Z"))
    ),
  });

  assert(diagnostics.groundingCalled === 1, "combined split must count one HTTP request");
  assert(diagnostics.combinedGroundingRequestCount === 1, "combined request count must be 1");
  delete process.env.GOOGLE_GEMINI_API_KEY;
}

async function runTests(): Promise<void> {
  await testSingleFixtureUsesOneGeminiRequest();
  await testThreeFixturesWithBudgetTwoOnlyCallsTwice();
  await test429StopsSubsequentRequests();
  await testCacheHitDoesNotCallGemini();
  testCombinedResponseSplitsSquadAndMatchContext();
  testGroundingFailureWithCompleteProfilesAllowsBasicAnalysis();
  testGroundingUnavailableDoesNotFabricateData();
  testPastKickoffDeferredFixtureSkipsRetry();
  testResultUpdateReservedQuotaUnaffected();
  await testDuplicateCombinedPrefetchUsesSingleHttpRequest();
  testObservabilityDiagnosticsIncludeBudgetFields();
  await testCombinedSplitIncrementsGroundingCalledOnce();
  console.log("groundingRateLimit.test.ts passed");
}

void runTests();
