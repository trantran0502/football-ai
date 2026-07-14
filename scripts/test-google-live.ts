import {
  fetchGoogleLiveResult,
  getCachedGoogleRecord,
  GoogleSearchProvider,
  mapGeminiStructuredToHybridPayload,
  parseGeminiStructuredJson,
  rememberGoogleLiveResult,
  resetGoogleSearchCacheForTests,
  resetGoogleSearchProviderForTests,
  setGeminiFetchForTests,
  buildGoogleSearchCacheKey,
  TEAM_CONTEXT_QUERY,
  type GeminiGenerateContentResponse,
} from "@/lib/providers/googleSearch";
import {
  createFeatureProviderRegistry,
  resetFeatureProviderRegistryForTests,
} from "@/lib/providers/registry";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const HOME = "Arsenal";
const AWAY = "Chelsea";
const MATCH_DATE = "2026-07-10";

const LIVE_STRUCTURED = {
  recentFormLast10Official: [
    {
      matchDate: "2026-07-05",
      homeTeam: HOME,
      awayTeam: "Liverpool",
      homeGoals: 2,
      awayGoals: 1,
      competition: "Premier League",
      competitionType: "league",
      venue: "home",
      neutralVenue: false,
      includesExtraTime: false,
      includesPenalties: false,
      sourceUrl: "https://example.com/arsenal-liverpool",
    },
  ],
  recentFormLast5Home: [
    {
      matchDate: "2026-07-05",
      homeTeam: HOME,
      awayTeam: "Liverpool",
      homeGoals: 2,
      awayGoals: 1,
      competition: "Premier League",
      competitionType: "league",
      venue: "home",
      neutralVenue: false,
      includesExtraTime: false,
      includesPenalties: false,
      sourceUrl: "https://example.com/arsenal-liverpool",
    },
  ],
  recentFormLast5Away: [
    {
      matchDate: "2026-06-28",
      homeTeam: "Brighton",
      awayTeam: AWAY,
      homeGoals: 0,
      awayGoals: 2,
      competition: "Premier League",
      competitionType: "league",
      venue: "away",
      neutralVenue: false,
      includesExtraTime: false,
      includesPenalties: false,
      sourceUrl: "https://example.com/brighton-chelsea",
    },
  ],
  includesFriendlies: false,
  includesExtraTime: false,
  includesPenalties: false,
  h2hLast5Official: [
    {
      matchDate: "2026-04-01",
      homeTeam: HOME,
      awayTeam: AWAY,
      homeGoals: 1,
      awayGoals: 1,
      competition: "Premier League",
      competitionType: "league",
      venue: "home",
      neutralVenue: false,
      includesExtraTime: false,
      includesPenalties: false,
      sourceUrl: "https://example.com/h2h",
    },
  ],
  standings: [
    {
      teamName: HOME,
      rank: 2,
      played: 10,
      points: 22,
      goalsFor: 18,
      goalsAgainst: 8,
      sourceUrl: "https://example.com/standings",
    },
  ],
  homeMetrics: {
    goalsFor: 18,
    goalsAgainst: 8,
    xg: 1.8,
    xga: 0.9,
    shots: 120,
    shotsOnTarget: 45,
    possession: 58,
    cleanSheets: 4,
    failedToScore: 1,
  },
  awayMetrics: {
    goalsFor: 14,
    goalsAgainst: 12,
    xg: 1.4,
    xga: 1.1,
    shots: 100,
    shotsOnTarget: 36,
    possession: 52,
    cleanSheets: 3,
    failedToScore: 2,
  },
  injuries: [
    {
      teamName: HOME,
      playerName: "Player A",
      reason: "Knee",
      status: "Out",
      sourceUrl: "https://example.com/injury",
    },
  ],
  suspensions: [],
  matchStatus: {
    importance: "Title race",
    mustWin: true,
    alreadyQualified: false,
    alreadyEliminated: false,
    weather: "Clear",
    longTravelAway: false,
    congestedSchedule: true,
    coachNews: "Manager expects rotation",
    officialNews: "Club confirms travel plan",
    rotation: "2 changes expected",
  },
};

function buildGeminiResponse(): GeminiGenerateContentResponse {
  return {
    candidates: [
      {
        content: {
          parts: [{ text: JSON.stringify(LIVE_STRUCTURED) }],
        },
        groundingMetadata: {
          webSearchQueries: [`${HOME} vs ${AWAY} recent form`],
          groundingChunks: [
            {
              web: {
                uri: "https://example.com/arsenal-liverpool",
                title: "Arsenal beat Liverpool",
              },
            },
          ],
        },
      },
    ],
  };
}

async function runTests(): Promise<void> {
  resetGoogleSearchCacheForTests();
  resetGoogleSearchProviderForTests();
  resetFeatureProviderRegistryForTests();

  process.env.GOOGLE_GEMINI_API_KEY = "test-key";

  let fetchCount = 0;
  setGeminiFetchForTests(async () => {
    fetchCount += 1;
    return new Response(JSON.stringify(buildGeminiResponse()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  const provider = new GoogleSearchProvider({ apiKey: "test-key" });
  const live = await provider.fetchTeamContext({
    homeTeam: HOME,
    awayTeam: AWAY,
    matchDate: MATCH_DATE,
    leagueName: "Premier League",
  });

  assert(Boolean(live), "live Gemini response should map to structured result");
  assert(
    live!.payload.recentFormLast10Official.length === 1,
    "live response should include recent form"
  );
  assert(
    live!.payload.homeMetrics?.cleanSheets === 4,
    "live response should include clean sheets metric"
  );
  assert(
    live!.payload.matchStatus?.coachNews?.includes("rotation") ?? false,
    "live response should include coach news"
  );
  assert(live!.citations.length >= 1, "citations should be preserved");
  assert(Boolean(live!.rawResponse), "rawResponse should be preserved");
  assert(Boolean(live!.searchTime), "searchTime should be set");
  assert(live!.query.includes(HOME), "query should include home team");

  const cacheKey = buildGoogleSearchCacheKey({
    homeTeam: HOME,
    awayTeam: AWAY,
    matchDate: MATCH_DATE,
    query: TEAM_CONTEXT_QUERY,
  });

  rememberGoogleLiveResult(cacheKey, live!);
  const cacheHit = getCachedGoogleRecord(cacheKey);
  assert(Boolean(cacheHit), "cache hit should return stored record");
  assert(
    cacheHit!.payload.recentFormLast10Official.length === 1,
    "cache hit should preserve structured payload"
  );
  assert(
    cacheHit!.citations.length >= 1,
    "cache hit should preserve citations"
  );

  const beforeFetchCount = fetchCount;
  const cachedFetch = await fetchGoogleLiveResult({
    homeTeam: HOME,
    awayTeam: AWAY,
    matchDate: MATCH_DATE,
    leagueName: "Premier League",
  });
  assert(Boolean(cachedFetch), "cached fetch should return result");
  assert(fetchCount === beforeFetchCount, "cache hit should not repeat Gemini search");

  resetGoogleSearchCacheForTests();
  const missFetch = await fetchGoogleLiveResult({
    homeTeam: HOME,
    awayTeam: AWAY,
    matchDate: MATCH_DATE,
    leagueName: "Premier League",
  });
  assert(Boolean(missFetch), "cache miss should fetch Gemini again");
  assert(fetchCount === beforeFetchCount + 1, "cache miss should trigger one new search");

  resetGoogleSearchCacheForTests();
  setGeminiFetchForTests(async () =>
    Response.json({
      candidates: [{ content: { parts: [{ text: "{}" }] } }],
    })
  );
  const emptySearch = await new GoogleSearchProvider({
    apiKey: "test-key",
  }).fetchTeamContext({
    homeTeam: HOME,
    awayTeam: AWAY,
    matchDate: MATCH_DATE,
  });
  assert(Boolean(emptySearch), "empty structured search should still parse");
  assert(
    emptySearch!.payload.recentFormLast10Official.length === 0,
    "empty search should return empty arrays"
  );

  const limitedProvider = new GoogleSearchProvider({
    apiKey: "test-key",
    maxRequestsPerMinute: 1,
  });
  setGeminiFetchForTests(async () =>
    Response.json(buildGeminiResponse(), { status: 200 })
  );
  await limitedProvider.fetchTeamContext({
    homeTeam: HOME,
    awayTeam: AWAY,
    matchDate: MATCH_DATE,
  });
  let rateLimitHit = false;
  try {
    await limitedProvider.fetchTeamContext({
      homeTeam: HOME,
      awayTeam: AWAY,
      matchDate: MATCH_DATE,
    });
  } catch (error) {
    rateLimitHit =
      error instanceof Error && error.message.includes("rate limit");
  }
  assert(rateLimitHit, "rate limit should block repeated Gemini requests");

  setGeminiFetchForTests(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        if (init.signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      })
  );
  const timeoutProvider = new GoogleSearchProvider({
    apiKey: "test-key",
    timeoutMs: 20,
  });
  let timeoutHit = false;
  try {
    await timeoutProvider.fetchTeamContext({
      homeTeam: HOME,
      awayTeam: AWAY,
      matchDate: MATCH_DATE,
    });
  } catch (error) {
    timeoutHit = error instanceof Error && error.message.includes("timed out");
  }
  assert(timeoutHit, "timeout should abort Gemini request");

  resetGoogleSearchCacheForTests();
  resetGoogleSearchProviderForTests();
  delete process.env.GOOGLE_GEMINI_API_KEY;

  setGeminiFetchForTests(async () => {
    throw new Error("should not be called when API fallback is used");
  });

  const registry = createFeatureProviderRegistry({
    sourceResolvers: {
      googleSearch: () => null,
      apiFootball: () => ({
        home: {
          teamName: HOME,
          sampleSize: 5,
          wins: 3,
          draws: 1,
          losses: 1,
          goalsFor: 10,
          goalsAgainst: 5,
          winRate: 0.6,
          avgGoalsFor: 2,
          avgGoalsAgainst: 1,
          goalDifferencePerMatch: 1,
          venueWinRate: 0.6,
          momentum: 0.4,
          cleanSheetRate: 0.4,
          failedToScoreRate: 0.1,
        },
        away: {
          teamName: AWAY,
          sampleSize: 5,
          wins: 2,
          draws: 2,
          losses: 1,
          goalsFor: 8,
          goalsAgainst: 7,
          winRate: 0.4,
          avgGoalsFor: 1.6,
          avgGoalsAgainst: 1.4,
          goalDifferencePerMatch: 0.2,
          venueWinRate: 0.4,
          momentum: 0.2,
          cleanSheetRate: 0.2,
          failedToScoreRate: 0.2,
        },
      }),
    },
  });

  const fallback = registry.resolveSync("recentForm", {
    homeTeam: HOME,
    awayTeam: AWAY,
    matchDate: MATCH_DATE,
  });
  assert(
    fallback.source === "apiFootball",
    "when Google is unavailable registry should fallback to API-Football"
  );

  const mockRegistry = createFeatureProviderRegistry({
    sourceResolvers: {
      googleSearch: () => null,
      apiFootball: () => null,
    },
  });
  const mockFallback = mockRegistry.resolveSync("recentForm", {
    homeTeam: HOME,
    awayTeam: AWAY,
    matchDate: MATCH_DATE,
  });
  assert(mockFallback.source === "mock", "final fallback should use mock provider");

  const parsed = parseGeminiStructuredJson(JSON.stringify(LIVE_STRUCTURED));
  const mapped = mapGeminiStructuredToHybridPayload(
    { homeTeam: HOME, awayTeam: AWAY, matchDate: MATCH_DATE },
    parsed,
    buildGeminiResponse().candidates?.[0]?.groundingMetadata,
    new Date().toISOString(),
    `${HOME} vs ${AWAY}`,
    buildGeminiResponse()
  );
  assert(
    mapped.payload.suspensions.length === 0,
    "mapper should preserve suspensions array"
  );
  assert(
    mapped.payload.homeMetrics?.failedToScore === 1,
    "mapper should preserve failed to score metric"
  );

  console.log("Google live tests passed.");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
