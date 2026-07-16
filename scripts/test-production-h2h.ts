import { runFeatureRecommendationPipeline } from "@/lib/analysis/featureRecommendationPipeline";
import { resetFeatureRecommendationPipelineForTests } from "@/lib/analysis/featureRecommendationPipeline";
import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import { createAnalysisSnapshotFromReport } from "@/lib/database/matchSchema";
import type { HistoricalMatchRecord, MatchResult } from "@/lib/database/matchSchema";
import { parseOdds } from "@/lib/parser/parser";
import { normalizeMarketSelections } from "@/lib/parser/normalizeMarketSelections";
import {
  ApiFootballClient,
  setApiFootballClientForTests,
} from "@/lib/providers/apiFootball/apiFootballClient";
import {
  resetApiFootballQuotaForTests,
  setApiFootballQuotaForTests,
} from "@/lib/providers/apiFootball/apiFootballQuota";
import {
  buildH2HSnapshotFromMatches,
  findH2HMatchRecordsFromHistory,
} from "@/lib/providers/h2h/h2hNormalizer";
import { computeH2HProviderConfidence } from "@/lib/providers/h2h/h2hConfidence";
import { getFeatureProviderRegistry } from "@/lib/providers/registry";
import { clearProductionH2HCacheForTests } from "@/lib/providers/h2h/h2hCache";
import {
  prefetchProductionH2H,
} from "@/lib/providers/h2h/productionH2HProvider";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const SAMPLE_ODDS = `Arsenal vs Chelsea
獨贏
主 1.85
和 3.4
客 4.2
全場讓分
主-0.5 0.92
客+0.5 0.98
全場大小
大(2.5) 0.90
小(2.5) 0.96
雙方進球
是 0.82
否 1.02`;

const MATCH_DATE = "2026-07-16";

function buildResult(
  homeGoals: number,
  awayGoals: number
): MatchResult {
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
    league: input.league ?? "Premier League",
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

function buildFiveMatchRecords(): HistoricalMatchRecord[] {
  return [
    buildRecord({
      id: "h2h-1",
      matchDate: "2026-01-10",
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      homeGoals: 2,
      awayGoals: 1,
    }),
    buildRecord({
      id: "h2h-2",
      matchDate: "2025-08-20",
      homeTeam: "Chelsea",
      awayTeam: "Arsenal",
      homeGoals: 1,
      awayGoals: 2,
    }),
    buildRecord({
      id: "h2h-3",
      matchDate: "2025-03-05",
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      homeGoals: 1,
      awayGoals: 1,
    }),
    buildRecord({
      id: "h2h-4",
      matchDate: "2024-11-12",
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      homeGoals: 3,
      awayGoals: 2,
    }),
    buildRecord({
      id: "h2h-5",
      matchDate: "2024-04-01",
      homeTeam: "Chelsea",
      awayTeam: "Arsenal",
      homeGoals: 0,
      awayGoals: 2,
    }),
  ];
}

class TrackingApiFootballClient extends ApiFootballClient {
  h2hCalls = 0;

  constructor() {
    super({ apiKey: "test-key" });
  }

  isConfigured(): boolean {
    return true;
  }

  async getHeadToHead(
    homeTeamId: number,
    awayTeamId: number,
    last = 10
  ): Promise<ApiFootballFixtureRecord[]> {
    void homeTeamId;
    void awayTeamId;
    void last;
    this.h2hCalls += 1;
    return [
      {
        fixtureId: 9001,
        date: "2025-12-01",
        kickoffTime: "2025-12-01T15:00:00.000Z",
        league: "Premier League",
        leagueId: 39,
        season: 2025,
        homeTeam: "Arsenal",
        awayTeam: "Chelsea",
        homeTeamId: 42,
        awayTeamId: 49,
        status: "FT",
        homeGoals: 2,
        awayGoals: 0,
        halfTimeHome: 1,
        halfTimeAway: 0,
        venue: "Emirates Stadium",
        neutralVenue: false,
      },
    ];
  }
}

export async function runProductionH2HTests(): Promise<void> {
  resetFeatureRecommendationPipelineForTests();
  clearProductionH2HCacheForTests();
  resetApiFootballQuotaForTests();
  setApiFootballClientForTests(null);

  const match = parseOdds(SAMPLE_ODDS);
  const markets = normalizeMarketSelections(match.marketSelections);
  const h2hContext = {
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    matchDate: MATCH_DATE,
    homeTeamId: 42,
    awayTeamId: 49,
  };

  const trackingClient = new TrackingApiFootballClient();
  setApiFootballClientForTests(trackingClient);

  const fiveRecords = buildFiveMatchRecords();
  const resolutionFromRecords = await prefetchProductionH2H({
    ...h2hContext,
    matchRecords: fiveRecords,
  });

  assert(trackingClient.h2hCalls === 0, "five match_records should skip API");
  assert(resolutionFromRecords?.source === "matchRecords", "source should be matchRecords");
  assert(
    resolutionFromRecords?.snapshot.sampleSize === 5,
    "match_records should provide five H2H matches"
  );
  assert(
    resolutionFromRecords?.snapshot.homeWinRate === 0.8,
    "home win rate should be normalized to current home team"
  );
  assert(
    resolutionFromRecords?.snapshot.drawRate === 0.2,
    "draw rate should be computed from normalized perspective"
  );
  assert(
    resolutionFromRecords?.snapshot.bttsRate === 0.8,
    "BTTS rate should be computed correctly"
  );
  assert(
    resolutionFromRecords?.snapshot.over25Rate === 0.6,
    "Over 2.5 rate should be computed correctly"
  );

  resetFeatureRecommendationPipelineForTests();
  await prefetchProductionH2H({
    ...h2hContext,
    matchRecords: fiveRecords,
  });

  const pipeline = runFeatureRecommendationPipeline(
    { ...match, marketSelections: markets },
    markets,
    { matchDate: MATCH_DATE, h2hContext }
  );
  const h2hProvider = pipeline.providerAudit?.resolved.find((entry) => entry.key === "h2h");
  assert(h2hProvider?.source === "matchRecords", "pipeline h2h provider should use match records");

  const swappedSnapshot = buildH2HSnapshotFromMatches({
    matches: [
      {
        matchDate: "2025-01-01",
        homeTeam: "Chelsea",
        awayTeam: "Arsenal",
        homeGoals: 2,
        awayGoals: 0,
        venue: "Stamford Bridge",
        competition: "Premier League",
        neutralVenue: false,
      },
    ],
    referenceDate: MATCH_DATE,
    currentHomeTeam: "Arsenal",
    currentAwayTeam: "Chelsea",
  });
  assert(
    swappedSnapshot.homeWinRate === 0,
    "swapped historical home/away should not count as current home win"
  );
  assert(
    swappedSnapshot.awayWinRate === 1,
    "swapped historical home/away should count as current away win"
  );

  const filteredRecords = [
    ...fiveRecords,
    buildRecord({
      id: "friendly",
      matchDate: "2025-02-01",
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      homeGoals: 5,
      awayGoals: 5,
      league: "Club Friendly",
    }),
    buildRecord({
      id: "incomplete",
      matchDate: "2025-01-01",
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      homeGoals: 1,
      awayGoals: 1,
      status: "PENDING",
    }),
  ];
  const filtered = findH2HMatchRecordsFromHistory(
    filteredRecords,
    "Arsenal",
    "Chelsea",
    MATCH_DATE
  );
  assert(filtered.stats.filteredFriendlyCount >= 1, "friendlies should be filtered");
  assert(filtered.stats.filteredIncompleteCount >= 1, "incomplete records should be filtered");

  const lowSampleConfidence = computeH2HProviderConfidence(
    { matches: [], sampleSize: 2, dataFreshnessDays: 30 },
    "matchRecords"
  );
  const fullSampleConfidence = computeH2HProviderConfidence(
    { matches: [], sampleSize: 5, dataFreshnessDays: 30 },
    "matchRecords"
  );
  assert(
    lowSampleConfidence < fullSampleConfidence,
    "sampleSize below 3 should reduce provider confidence"
  );

  clearProductionH2HCacheForTests();
  trackingClient.h2hCalls = 0;
  const apiResolution = await prefetchProductionH2H({
    ...h2hContext,
    matchRecords: [],
  });
  assert(trackingClient.h2hCalls === 1, "API fallback should make exactly one H2H request");
  assert(apiResolution?.source === "apiFootball", "API fallback source should be apiFootball");
  assert(
    apiResolution?.diagnostics.requestUrl === "/fixtures?h2h=42-49&last=10",
    "diagnostics should include H2H request URL"
  );

  resetApiFootballQuotaForTests();
  setApiFootballQuotaForTests({ dailyCount: 100, minuteCount: 10 });
  clearProductionH2HCacheForTests();
  trackingClient.h2hCalls = 0;
  const quotaResolution = await prefetchProductionH2H({
    ...h2hContext,
    matchRecords: [],
  });
  assert(quotaResolution === null, "quota exhausted should return unavailable resolution");
  assert(trackingClient.h2hCalls === 0, "quota exhausted should not call API");

  process.env.FOOTBALL_RECOMMENDATION_MODE = "production";
  process.env.ALLOW_MOCK_PROVIDERS = "false";
  resetFeatureRecommendationPipelineForTests();
  clearProductionH2HCacheForTests();

  const productionPipeline = runFeatureRecommendationPipeline(
    { ...match, marketSelections: markets },
    markets,
    { matchDate: MATCH_DATE, h2hContext }
  );
  const productionH2h = productionPipeline.providerAudit?.resolved.find(
    (entry) => entry.key === "h2h"
  );
  assert(
    productionH2h?.source === "unavailable",
    "production without H2H data should be unavailable, not mock"
  );

  await prefetchProductionH2H({ ...h2hContext, matchRecords: fiveRecords });
  getFeatureProviderRegistry().clearCache();

  const report = analyzeMatch(SAMPLE_ODDS, {
    matchDate: MATCH_DATE,
    h2hContext,
  });
  const snapshot = createAnalysisSnapshotFromReport(
    report,
    `${MATCH_DATE}T00:00:00.000Z`,
    "match-h2h-1",
    MATCH_DATE
  );
  const replayH2h = snapshot.replay?.providers.find((provider) => provider.key === "h2h");
  const replayFeature = snapshot.replay?.features.find((feature) =>
    feature.id.startsWith("h2h.")
  );
  assert(replayH2h?.source === "match-records", "replay provider source should be match-records");
  assert(
    replayFeature?.source === "match-records",
    "replay feature source should match provider source"
  );

  delete process.env.FOOTBALL_RECOMMENDATION_MODE;
  delete process.env.ALLOW_MOCK_PROVIDERS;
  setApiFootballClientForTests(null);
  resetApiFootballQuotaForTests();
  resetFeatureRecommendationPipelineForTests();
  clearProductionH2HCacheForTests();
}

if (require.main === module) {
  runProductionH2HTests()
    .then(() => {
      console.log("All production H2H tests passed.");
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
