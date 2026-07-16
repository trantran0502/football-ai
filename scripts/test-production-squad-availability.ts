import { resetFeatureRecommendationPipelineForTests } from "@/lib/analysis/featureRecommendationPipeline";
import {
  buildSquadAvailabilitySnapshotFromOfficialRecords,
  normalizeOfficialGooglePlayerRecords,
} from "@/lib/providers/squadAvailability/squadAvailabilityNormalizer";
import { computeSquadAvailabilityProviderConfidence } from "@/lib/providers/squadAvailability/squadAvailabilityConfidence";
import { isOfficialAnnouncementUrl } from "@/lib/providers/squadAvailability/squadAvailabilityOfficialSource";
import { clearProductionSquadAvailabilityCacheForTests } from "@/lib/providers/squadAvailability/squadAvailabilityCache";
import {
  prefetchProductionSquadAvailability,
  prepareProductionSquadAvailabilityContext,
  resetProductionSquadAvailabilityContext,
} from "@/lib/providers/squadAvailability/productionSquadAvailabilityProvider";
import { resolveSquadAvailabilityFromGoogleSearch } from "@/lib/providers/squadAvailability/squadAvailabilityGoogleSource";
import {
  getFeatureProviderRegistry,
  resetFeatureProviderRegistryForTests,
} from "@/lib/providers/registry";
import { resolveEffectiveProviderSource } from "@/lib/providers/registry/types";
import {
  buildGoogleSearchCacheKey,
  rememberGoogleLiveResult,
} from "@/lib/providers/googleSearch/googleSearchCache";
import { TEAM_CONTEXT_QUERY } from "@/lib/providers/googleSearch/googleSearchService";
import type { GoogleSearchLiveResult } from "@/lib/providers/googleSearch/googleSearchTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const HOME = "Arsenal";
const AWAY = "Chelsea";
const MATCH_DATE = "2026-07-16";

function buildGoogleResult(): GoogleSearchLiveResult {
  const searchTime = new Date().toISOString();
  return {
    payload: {
      source: "googleSearch",
      fetchedAt: searchTime,
      confidence: 0.8,
      citations: [{ url: "https://www.arsenal.com/news/injury-update" }],
      queries: [TEAM_CONTEXT_QUERY],
      homeTeam: HOME,
      awayTeam: AWAY,
      matchDate: MATCH_DATE,
      recentFormLast10Official: [],
      recentFormLast5Home: [],
      recentFormLast5Away: [],
      includesFriendlies: false,
      includesExtraTime: false,
      includesPenalties: false,
      h2hLast5Official: [],
      standings: [],
      injuries: [],
      suspensions: [],
      homeMetrics: null,
      awayMetrics: null,
      matchStatus: null,
    },
    citations: [{ url: "https://www.arsenal.com/news/injury-update" }],
    confidence: 0.8,
    searchTime,
    query: TEAM_CONTEXT_QUERY,
    rawResponse: {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  recentFormLast10Official: [],
                  recentFormLast5Home: [],
                  recentFormLast5Away: [],
                  includesFriendlies: false,
                  includesExtraTime: false,
                  includesPenalties: false,
                  h2hLast5Official: [],
                  standings: [],
                  homeMetrics: null,
                  awayMetrics: null,
                  injuries: [
                    {
                      teamName: HOME,
                      playerName: "Bukayo Saka",
                      reason: "hamstring injury",
                      status: "out",
                      sourceUrl: "https://www.arsenal.com/news/injury-update",
                    },
                  ],
                  suspensions: [
                    {
                      teamName: AWAY,
                      playerName: "Cole Palmer",
                      reason: "red card suspension",
                      status: "suspended",
                      sourceUrl: "https://www.chelseafc.com/en/news/suspension-update",
                    },
                  ],
                  matchStatus: null,
                }),
              },
            ],
          },
        },
      ],
    },
  };
}

async function runTests(): Promise<void> {
  resetFeatureRecommendationPipelineForTests();
  clearProductionSquadAvailabilityCacheForTests();

  assert(
    isOfficialAnnouncementUrl("https://www.arsenal.com/news/injury-update"),
    "official club URL should pass"
  );
  assert(
    !isOfficialAnnouncementUrl("https://www.transfermarkt.com/player/123"),
    "rumor aggregator should be rejected"
  );

  const { records, stats } = normalizeOfficialGooglePlayerRecords({
    injuries: [
      {
        teamName: HOME,
        playerName: "Bukayo Saka",
        reason: "hamstring injury",
        status: "out",
        sourceUrl: "https://www.arsenal.com/news/injury-update",
      },
      {
        teamName: HOME,
        playerName: "Unknown Player",
        reason: "maybe out",
        status: "unclear",
        sourceUrl: "https://www.arsenal.com/news/injury-update",
      },
    ],
    suspensions: [],
  });
  assert(records.length === 1, "unconfirmed status should be filtered out");
  assert(stats.filteredUnconfirmedCount === 1, "should count unconfirmed records");

  const snapshot = buildSquadAvailabilitySnapshotFromOfficialRecords({
    homeTeam: HOME,
    awayTeam: AWAY,
    records,
    referenceDate: MATCH_DATE,
    sourceTimestamp: `${MATCH_DATE}T10:00:00.000Z`,
  });
  assert(snapshot.sampleSize === 1, "snapshot sampleSize should match official records");
  assert(snapshot.injuredCount === 1, "injuredCount should be aggregated");
  assert(snapshot.dataFreshnessDays === 0, "same-day source should be fresh");

  const confidence = computeSquadAvailabilityProviderConfidence({
    sampleSize: 1,
    dataFreshnessDays: 0,
    source: "googleSearch",
  });
  assert(confidence > 0.5, "fresh official data should have reasonable confidence");

  const cacheKey = buildGoogleSearchCacheKey({
    homeTeam: HOME,
    awayTeam: AWAY,
    matchDate: MATCH_DATE,
    query: TEAM_CONTEXT_QUERY,
  });
  rememberGoogleLiveResult(cacheKey, buildGoogleResult());

  const googleResolution = resolveSquadAvailabilityFromGoogleSearch({
    request: { homeTeam: HOME, awayTeam: AWAY, matchDate: MATCH_DATE },
    referenceDate: MATCH_DATE,
  });
  assert(googleResolution !== null, "google resolution should succeed with official data");
  assert(googleResolution!.source === "googleSearch", "source should be googleSearch");
  assert(googleResolution!.snapshot.sampleSize === 2, "should include injury and suspension");

  await prefetchProductionSquadAvailability({
    homeTeam: HOME,
    awayTeam: AWAY,
    matchDate: MATCH_DATE,
    matchRecords: [],
  });

  const previousMode = process.env.FOOTBALL_RECOMMENDATION_MODE;
  const previousAllowMock = process.env.ALLOW_MOCK_PROVIDERS;
  process.env.FOOTBALL_RECOMMENDATION_MODE = "production";
  process.env.ALLOW_MOCK_PROVIDERS = "false";
  resetFeatureProviderRegistryForTests();

  prepareProductionSquadAvailabilityContext({
    homeTeam: HOME,
    awayTeam: AWAY,
    matchDate: MATCH_DATE,
    matchRecords: [],
  });
  const registry = getFeatureProviderRegistry();
  const response = registry.resolveSync("squadAvailability", {
    homeTeam: HOME,
    awayTeam: AWAY,
    matchDate: MATCH_DATE,
  });
  const source = resolveEffectiveProviderSource(response);
  assert(source === "googleSearch", "production path should resolve googleSearch");
  assert(source !== "mock" && source !== "cache", "production must not use mock or cache");
  assert(response.data.sampleSize === 2, "registry data should include production metrics");
  resetProductionSquadAvailabilityContext();

  prepareProductionSquadAvailabilityContext({
    homeTeam: "Empty Home",
    awayTeam: "Empty Away",
    matchDate: MATCH_DATE,
    matchRecords: [],
  });
  clearProductionSquadAvailabilityCacheForTests();
  const unavailableResponse = registry.resolveSync("squadAvailability", {
    homeTeam: "Empty Home",
    awayTeam: "Empty Away",
    matchDate: MATCH_DATE,
  });
  assert(
    resolveEffectiveProviderSource(unavailableResponse) === "unavailable",
    "missing official data should be unavailable"
  );
  resetProductionSquadAvailabilityContext();

  process.env.FOOTBALL_RECOMMENDATION_MODE = previousMode;
  process.env.ALLOW_MOCK_PROVIDERS = previousAllowMock;

  console.log("Production Squad Availability tests passed.");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});

export {};
