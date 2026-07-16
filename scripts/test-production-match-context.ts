import { resetFeatureRecommendationPipelineForTests } from "@/lib/analysis/featureRecommendationPipeline";
import {
  extractOfficialMatchContextFields,
  countConfirmedMatchContextFields,
  buildMatchContextSnapshotFromOfficialFields,
  resolveRestDaysForSnapshot,
} from "@/lib/providers/matchContext/matchContextNormalizer";
import { computeMatchContextProviderConfidence } from "@/lib/providers/matchContext/matchContextConfidence";
import { hasOfficialCitation } from "@/lib/providers/matchContext/matchContextOfficialSource";
import { clearProductionMatchContextCacheForTests } from "@/lib/providers/matchContext/matchContextCache";
import {
  prefetchProductionMatchContext,
  prepareProductionMatchContextContext,
  resetProductionMatchContextContext,
} from "@/lib/providers/matchContext/productionMatchContextProvider";
import { resolveMatchContextFromGoogleSearch } from "@/lib/providers/matchContext/matchContextGoogleSource";
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
      citations: [{ url: "https://www.premierleague.com/news/match-preview" }],
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
    citations: [{ url: "https://www.premierleague.com/news/match-preview" }],
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
                  recentFormLast10Official: [
                    {
                      matchDate: "2026-07-10",
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
                      sourceUrl: "https://www.premierleague.com/match/12345",
                    },
                    {
                      matchDate: "2026-07-09",
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
                      sourceUrl: "https://www.premierleague.com/match/67890",
                    },
                  ],
                  recentFormLast5Home: [],
                  recentFormLast5Away: [],
                  includesFriendlies: false,
                  includesExtraTime: false,
                  includesPenalties: false,
                  h2hLast5Official: [],
                  standings: [],
                  homeMetrics: null,
                  awayMetrics: null,
                  injuries: [],
                  suspensions: [],
                  matchStatus: {
                    importance: "title_race",
                    mustWin: true,
                    alreadyQualified: false,
                    alreadyEliminated: false,
                    weather: "heavy_rain",
                    longTravelAway: null,
                    congestedSchedule: true,
                    coachNews: null,
                    officialNews: null,
                    rotation: null,
                  },
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
  clearProductionMatchContextCacheForTests();

  assert(
    hasOfficialCitation([{ url: "https://www.premierleague.com/news/match-preview" }]),
    "official league URL should pass citation check"
  );
  assert(
    !hasOfficialCitation([{ url: "https://www.transfermarkt.com/news/rumor" }]),
    "rumor site should fail citation check"
  );

  const fields = extractOfficialMatchContextFields({
    matchStatus: {
      importance: "title_race",
      mustWin: true,
      alreadyQualified: false,
      alreadyEliminated: false,
      weather: "heavy_rain",
      congestedSchedule: true,
    },
    homeTeam: HOME,
    awayTeam: AWAY,
    recentFormRecords: [
      {
        matchDate: "2026-07-10",
        homeTeam: HOME,
        awayTeam: "Liverpool",
        sourceUrl: "https://www.premierleague.com/match/12345",
      },
      {
        matchDate: "2026-07-09",
        homeTeam: "Brighton",
        awayTeam: AWAY,
        sourceUrl: "https://www.premierleague.com/match/67890",
      },
    ],
    referenceDate: MATCH_DATE,
  });
  assert(countConfirmedMatchContextFields(fields) >= 5, "should count confirmed fields");
  assert(fields.mustWin === true, "mustWin should be explicit boolean");
  assert(fields.restDays === 7, "restDays should average official recent form gaps");

  const restDays = resolveRestDaysForSnapshot({
    homeTeam: HOME,
    awayTeam: AWAY,
    recentFormRecords: [
      {
        matchDate: "2026-07-10",
        homeTeam: HOME,
        awayTeam: "Liverpool",
        sourceUrl: "https://www.premierleague.com/match/12345",
      },
      {
        matchDate: "2026-07-09",
        homeTeam: "Brighton",
        awayTeam: AWAY,
        sourceUrl: "https://www.premierleague.com/match/67890",
      },
    ],
    referenceDate: MATCH_DATE,
  });
  const snapshot = buildMatchContextSnapshotFromOfficialFields({
    fields,
    homeRestDays: restDays.homeRestDays,
    awayRestDays: restDays.awayRestDays,
    referenceDate: MATCH_DATE,
    sourceTimestamp: new Date().toISOString(),
  });
  assert(snapshot.matchImportance === "title_race", "matchImportance should be preserved");
  assert(snapshot.weatherImpact === "heavy_rain", "weatherImpact should be preserved");
  assert((snapshot.sampleSize ?? 0) > 0, "sampleSize should be positive");

  const confidence = computeMatchContextProviderConfidence({
    sampleSize: snapshot.sampleSize ?? 0,
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

  const googleResolution = resolveMatchContextFromGoogleSearch({
    request: { homeTeam: HOME, awayTeam: AWAY, matchDate: MATCH_DATE },
    referenceDate: MATCH_DATE,
  });
  assert(googleResolution !== null, "google resolution should succeed with official data");
  assert(googleResolution!.source === "googleSearch", "source should be googleSearch");
  assert(googleResolution!.snapshot.mustWin === true, "mustWin should resolve from google");

  await prefetchProductionMatchContext({
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

  prepareProductionMatchContextContext({
    homeTeam: HOME,
    awayTeam: AWAY,
    matchDate: MATCH_DATE,
    matchRecords: [],
  });
  const registry = getFeatureProviderRegistry();
  const response = registry.resolveSync("matchContext", {
    homeTeam: HOME,
    awayTeam: AWAY,
    matchDate: MATCH_DATE,
  });
  const source = resolveEffectiveProviderSource(response);
  assert(source === "googleSearch", "production path should resolve googleSearch");
  assert(source !== "mock" && source !== "cache", "production must not use mock or cache");
  assert(response.data.mustWin === true, "registry data should include production metrics");
  resetProductionMatchContextContext();

  prepareProductionMatchContextContext({
    homeTeam: "Empty Home",
    awayTeam: "Empty Away",
    matchDate: MATCH_DATE,
    matchRecords: [],
  });
  clearProductionMatchContextCacheForTests();
  const unavailableResponse = registry.resolveSync("matchContext", {
    homeTeam: "Empty Home",
    awayTeam: "Empty Away",
    matchDate: MATCH_DATE,
  });
  assert(
    resolveEffectiveProviderSource(unavailableResponse) === "unavailable",
    "missing official data should be unavailable"
  );
  resetProductionMatchContextContext();

  process.env.FOOTBALL_RECOMMENDATION_MODE = previousMode;
  process.env.ALLOW_MOCK_PROVIDERS = previousAllowMock;

  console.log("Production Match Context tests passed.");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});

export {};
