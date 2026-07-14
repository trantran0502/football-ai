import {
  FEATURE_PROVIDER_KEYS,
  MemoryProviderCache,
  ProviderCacheManager,
  buildProviderCacheKey,
  createFeatureProviderRegistry,
  createRegistryRecentFormProvider,
  createTimestamps,
  fetchApiFootballSourceData,
  fetchGoogleSearchSourceData,
  fetchMockSourceData,
  isExpired,
  resetFeatureProviderRegistryForTests,
  setFeatureProviderRegistryForTests,
  type CachedProviderPayload,
  type ProviderResponse,
} from "@/lib/providers/registry";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertResponseShape<T>(response: ProviderResponse<T>): void {
  assert(response.data !== undefined, "response.data should exist");
  assert(
    ["cache", "apiFootball", "googleSearch", "mock"].includes(response.source),
    "response.source should be valid"
  );
  assert(Boolean(response.fetchedAt), "response.fetchedAt should exist");
  assert(Boolean(response.expiresAt), "response.expiresAt should exist");
  assert(
    response.confidence >= 0 && response.confidence <= 1,
    "response.confidence should stay within [0, 1]"
  );
  assert(Array.isArray(response.warnings), "response.warnings should be an array");
}

function runTests(): void {
  resetFeatureProviderRegistryForTests();

  const request = {
    homeTeam: "Strong-Home FC",
    awayTeam: "Weak-Away FC",
  };

  assert(
    fetchApiFootballSourceData("recentForm", request) === null,
    "API-Football source should remain stubbed in this phase"
  );
  assert(
    fetchGoogleSearchSourceData("recentForm", request) === null,
    "Google Search source should remain stubbed in this phase"
  );

  const registry = createFeatureProviderRegistry();
  setFeatureProviderRegistryForTests(registry);

  const first = registry.resolveSync("recentForm", request);
  assertResponseShape(first);
  assert(first.source === "mock", "first resolve should fall back to mock");
  assert(first.confidence === 0.45, "mock confidence should be 0.45");
  assert(
    first.warnings.includes("Data sourced from mock provider fallback."),
    "mock fallback should include warning"
  );
  assert(first.data.home.teamName === "Strong-Home FC", "mock data should preserve home team");

  const second = registry.resolveSync("recentForm", request);
  assert(second.source === "cache", "second resolve should come from memory cache");
  assert(second.data.home.sampleSize === first.data.home.sampleSize, "cache should preserve data");

  for (const providerKey of FEATURE_PROVIDER_KEYS) {
    const response = registry.resolveSync(providerKey, buildRequest(providerKey));
    assertResponseShape(response);
    assert(response.data !== null && response.data !== undefined, `${providerKey} should resolve`);
  }

  const apiRegistry = createFeatureProviderRegistry({
    sourceResolvers: {
      apiFootball: (providerKey, providerRequest) => {
        if (providerKey !== "recentForm") {
          return null;
        }
        return {
          home: {
            teamName: (providerRequest as { homeTeam: string }).homeTeam,
            sampleSize: 10,
            wins: 8,
            draws: 1,
            losses: 1,
            goalsFor: 24,
            goalsAgainst: 8,
            winRate: 0.8,
            avgGoalsFor: 2.4,
            avgGoalsAgainst: 0.8,
            goalDifferencePerMatch: 1.6,
            venueWinRate: 0.85,
            momentum: 0.6,
            cleanSheetRate: 0.5,
            failedToScoreRate: 0.1,
          },
          away: fetchMockSourceData("recentForm", providerRequest as typeof request).away,
        };
      },
    },
  });
  apiRegistry.clearCache();
  const apiResponse = apiRegistry.resolveSync("recentForm", request);
  assert(apiResponse.source === "apiFootball", "API resolver should win over mock when provided");
  assert(apiResponse.confidence === 0.85, "API confidence should be 0.85");

  const memoryCache = new MemoryProviderCache();
  const cacheKey = buildProviderCacheKey("recentForm", request);
  const expiredPayload: CachedProviderPayload<unknown> = {
    data: { expired: true },
    source: "mock",
    confidence: 0.45,
    warnings: [],
    ...createTimestamps(-1000),
  };
  memoryCache.set(cacheKey, expiredPayload);
  assert(isExpired(expiredPayload.expiresAt), "expired payload should be detected");
  assert(memoryCache.get(cacheKey) === null, "expired cache entries should be evicted on read");

  const cacheManager = new ProviderCacheManager(memoryCache);
  const asyncRegistry = createFeatureProviderRegistry();
  asyncRegistry.clearCache();
  setFeatureProviderRegistryForTests(asyncRegistry);

  void cacheManager
    .getSupabase("unused")
    .then((value) => {
      assert(value === null, "supabase cache should fail closed without schema");
    })
    .catch(() => {
      throw new Error("supabase cache lookup should not throw");
    });

  const provider = createRegistryRecentFormProvider(asyncRegistry);
  const matchup = provider.getRecentForm(request);
  assert(matchup.home.teamName === request.homeTeam, "registry-backed provider should return data");

  resetFeatureProviderRegistryForTests();

  console.log("Provider Registry tests passed.");
}

function buildRequest(providerKey: (typeof FEATURE_PROVIDER_KEYS)[number]) {
  switch (providerKey) {
    case "leagueStrength":
      return { leagueName: "Premier League" };
    case "recentForm":
    case "homeAway":
    case "goalsXg":
    case "scoringPattern":
    case "h2h":
    case "squadAvailability":
    case "matchContext":
      return {
        homeTeam: "Strong-Home FC",
        awayTeam: "Weak-Away FC",
      };
  }
}

runTests();
