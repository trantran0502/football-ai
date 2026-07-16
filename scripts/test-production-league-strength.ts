import { runFeatureRecommendationPipeline } from "@/lib/analysis/featureRecommendationPipeline";
import { resetFeatureRecommendationPipelineForTests } from "@/lib/analysis/featureRecommendationPipeline";
import type { HistoricalMatchRecord, MatchResult } from "@/lib/database/matchSchema";
import { parseOdds } from "@/lib/parser/parser";
import { normalizeMarketSelections } from "@/lib/parser/normalizeMarketSelections";
import { computeLeagueStrengthProviderConfidence } from "@/lib/providers/leagueStrength/leagueStrengthConfidence";
import {
  buildLeagueStrengthSnapshotFromMatches,
  findLeagueMatchRecordsFromHistory,
} from "@/lib/providers/leagueStrength/leagueStrengthNormalizer";
import { clearProductionLeagueStrengthCacheForTests } from "@/lib/providers/leagueStrength/leagueStrengthCache";
import {
  fetchProductionLeagueStrengthSourceData,
  prefetchProductionLeagueStrength,
  prepareProductionLeagueStrengthContext,
  resetProductionLeagueStrengthContext,
} from "@/lib/providers/leagueStrength/productionLeagueStrengthProvider";
import {
  getFeatureProviderRegistry,
  resetFeatureProviderRegistryForTests,
} from "@/lib/providers/registry";
import { resolveEffectiveProviderSource } from "@/lib/providers/registry/types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const LEAGUE = "Premier League";
const MATCH_DATE = "2026-07-16";
const SAMPLE_ODDS = `Arsenal vs Chelsea
獨贏
主 1.85
和 3.4
客 4.2`;

function buildResult(homeGoals: number, awayGoals: number): MatchResult {
  return {
    fullTimeHomeGoals: homeGoals,
    fullTimeAwayGoals: awayGoals,
    halfTimeHomeGoals: 0,
    halfTimeAwayGoals: 0,
    winner: homeGoals > awayGoals ? "home" : homeGoals < awayGoals ? "away" : "draw",
    totalGoals: homeGoals + awayGoals,
    bothTeamsScored: homeGoals > 0 && awayGoals > 0,
  };
}

function buildRecord(input: {
  id: string;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  league?: string;
  status?: HistoricalMatchRecord["status"];
}): HistoricalMatchRecord {
  return {
    id: input.id,
    date: input.matchDate,
    matchDate: input.matchDate,
    league: input.league ?? LEAGUE,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    rawOdds: "",
    marketSelections: [],
    result: buildResult(input.homeGoals, input.awayGoals),
    analysisSnapshot: null,
    candidates: [],
    status: input.status ?? "VERIFIED",
    verificationResult: null,
    createdAt: input.matchDate,
    updatedAt: input.matchDate,
  };
}

function buildLeagueRecords(count: number): HistoricalMatchRecord[] {
  return Array.from({ length: count }, (_, index) =>
    buildRecord({
      id: `pl-${index + 1}`,
      matchDate: `2026-07-${String(Math.min(index + 1, 15)).padStart(2, "0")}`,
      homeTeam: `Home ${index + 1}`,
      awayTeam: `Away ${index + 1}`,
      homeGoals: 2 + (index % 2),
      awayGoals: 1,
    })
  );
}

async function runTests(): Promise<void> {
  resetFeatureRecommendationPipelineForTests();
  clearProductionLeagueStrengthCacheForTests();

  const twentyRecords = buildLeagueRecords(20);
  const { matches } = findLeagueMatchRecordsFromHistory(twentyRecords, LEAGUE);
  assert(matches.length === 20, "normalizer should keep 20 formal league matches");

  const snapshot = buildLeagueStrengthSnapshotFromMatches({
    leagueName: LEAGUE,
    matches,
    referenceDate: MATCH_DATE,
  });
  assert(snapshot.sampleSize === 20, "snapshot sampleSize should be 20");
  assert(snapshot.leagueTier === null, "must not fabricate league tier");
  assert(snapshot.leagueRanking === null, "must not fabricate league ranking");
  assert(snapshot.averageGoals !== null, "averageGoals should be computed");
  assert(snapshot.attackStrength !== null, "attackStrength should be computed");
  assert(snapshot.dataFreshnessDays !== null, "dataFreshnessDays should be computed");

  const normalConfidence = computeLeagueStrengthProviderConfidence(20, "matchRecords");
  const reducedConfidence = computeLeagueStrengthProviderConfidence(15, "matchRecords");
  const lowConfidence = computeLeagueStrengthProviderConfidence(5, "matchRecords");
  assert(normalConfidence > reducedConfidence, "20-match confidence should exceed 15-match");
  assert(reducedConfidence > lowConfidence, "15-match confidence should exceed sub-10");

  const resolution = await prefetchProductionLeagueStrength({
    leagueName: LEAGUE,
    matchDate: MATCH_DATE,
    matchRecords: twentyRecords,
  });
  assert(resolution !== null, "prefetch should resolve from match records");
  assert(resolution!.source === "matchRecords", "source should be matchRecords");
  assert(
    resolution!.snapshot.sampleSize === 20,
    "prefetched snapshot should include sampleSize"
  );

  const fetched = fetchProductionLeagueStrengthSourceData({ leagueName: LEAGUE });
  assert(fetched !== null, "registry fetch should return cached production snapshot");
  assert(fetched!.sampleSize === 20, "fetched snapshot should retain sampleSize");

  const registry = getFeatureProviderRegistry();
  const response = registry.resolveSync("leagueStrength", {
    leagueName: LEAGUE,
    matchDate: MATCH_DATE,
  });
  assert(
    resolveEffectiveProviderSource(response) === "matchRecords",
    "registry should resolve leagueStrength from matchRecords"
  );
  assert(response.data.sampleSize === 20, "registry data should include sampleSize");

  const nineRecords = buildLeagueRecords(9);
  clearProductionLeagueStrengthCacheForTests();
  await prefetchProductionLeagueStrength({
    leagueName: LEAGUE,
    matchDate: MATCH_DATE,
    matchRecords: nineRecords,
  });
  const belowThreshold = fetchProductionLeagueStrengthSourceData({ leagueName: LEAGUE });
  assert(belowThreshold === null, "sample size below 10 should be unavailable");

  clearProductionLeagueStrengthCacheForTests();
  await prefetchProductionLeagueStrength({
    leagueName: LEAGUE,
    matchDate: MATCH_DATE,
    matchRecords: buildLeagueRecords(12),
  });

  const match = parseOdds(SAMPLE_ODDS);
  const markets = normalizeMarketSelections(match.marketSelections);
  const pipeline = runFeatureRecommendationPipeline(
    { ...match, league: LEAGUE, marketSelections: markets },
    markets,
    {
      matchDate: MATCH_DATE,
      leagueStrengthContext: {
        leagueName: LEAGUE,
        matchDate: MATCH_DATE,
        matchRecords: buildLeagueRecords(12),
      },
    }
  );

  const leagueProvider = pipeline.providerAudit?.resolved.find(
    (entry) => entry.key === "leagueStrength"
  );
  assert(leagueProvider?.source === "matchRecords", "pipeline audit source should be matchRecords");
  assert(
    leagueProvider?.confidence !== undefined && leagueProvider.confidence < 0.84,
    "12-match sample should use reduced confidence"
  );

  const previousMode = process.env.FOOTBALL_RECOMMENDATION_MODE;
  const previousAllowMock = process.env.ALLOW_MOCK_PROVIDERS;
  process.env.FOOTBALL_RECOMMENDATION_MODE = "production";
  process.env.ALLOW_MOCK_PROVIDERS = "false";
  resetFeatureProviderRegistryForTests();
  clearProductionLeagueStrengthCacheForTests();

  const productionRegistry = getFeatureProviderRegistry();
  await prefetchProductionLeagueStrength({
    leagueName: LEAGUE,
    matchDate: MATCH_DATE,
    matchRecords: twentyRecords,
  });
  prepareProductionLeagueStrengthContext({
    leagueName: LEAGUE,
    matchDate: MATCH_DATE,
    matchRecords: twentyRecords,
  });
  const productionResponse = productionRegistry.resolveSync("leagueStrength", {
    leagueName: LEAGUE,
    matchDate: MATCH_DATE,
  });
  const productionSource = resolveEffectiveProviderSource(productionResponse);
  assert(
    productionSource === "matchRecords",
    "production leagueStrength must resolve to match-records only"
  );
  assert(
    productionSource !== "mock" && productionSource !== "cache",
    "production leagueStrength must not resolve to mock or cache"
  );
  resetProductionLeagueStrengthContext();

  clearProductionLeagueStrengthCacheForTests();
  prepareProductionLeagueStrengthContext({
    leagueName: "Empty League",
    matchDate: MATCH_DATE,
    matchRecords: [],
  });
  const unavailableResponse = productionRegistry.resolveSync("leagueStrength", {
    leagueName: "Empty League",
    matchDate: MATCH_DATE,
  });
  assert(
    resolveEffectiveProviderSource(unavailableResponse) === "unavailable",
    "production leagueStrength without records must be unavailable immediately"
  );
  resetProductionLeagueStrengthContext();

  process.env.FOOTBALL_RECOMMENDATION_MODE = previousMode;
  process.env.ALLOW_MOCK_PROVIDERS = previousAllowMock;

  console.log("Production League Strength tests passed.");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});

export {};
