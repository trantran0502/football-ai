import { ApiFootballClient } from "@/lib/providers/apiFootball/apiFootballClient";
import {
  buildApiFootballCacheKey,
  getApiFootballCacheStore,
  resetApiFootballCacheStoreForTests,
} from "@/lib/providers/apiFootball/apiFootballCache";
import {
  mapHomeAwaySnapshot,
  mapRecentFormMatchup,
} from "@/lib/providers/apiFootball/apiFootballMapper";
import type { ApiFootballMatchBundle } from "@/lib/providers/apiFootball/apiFootballTypes";
import {
  buildApiFootballMatchBundle,
  fetchApiFootballSourceData,
  fetchApiFootballSourceDataAsync,
  prefetchApiFootballProviders,
  resetApiFootballProviderCacheForTests,
} from "@/lib/providers/apiFootball/apiFootballService";
import {
  setApiFootballClientForTests,
} from "@/lib/providers/apiFootball/apiFootballClient";
import {
  createFeatureProviderRegistry,
  resetFeatureProviderRegistryForTests,
} from "@/lib/providers/registry";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const SAMPLE_FIXTURE = {
  fixtureId: 1001,
  date: "2026-07-10",
  kickoffTime: "2026-07-10T15:00:00.000Z",
  league: "Premier League",
  leagueId: 39,
  season: 2025,
  homeTeam: "Arsenal",
  awayTeam: "Chelsea",
  homeTeamId: 42,
  awayTeamId: 49,
  status: "FT",
  homeGoals: 2,
  awayGoals: 1,
  halfTimeHome: 1,
  halfTimeAway: 0,
  venue: "Emirates Stadium",
  neutralVenue: false,
};

const SAMPLE_BUNDLE: ApiFootballMatchBundle = {
  homeTeam: { id: 42, name: "Arsenal", country: "England" },
  awayTeam: { id: 49, name: "Chelsea", country: "England" },
  fixture: SAMPLE_FIXTURE,
  homeForm: {
    teamId: 42,
    fixtures: [SAMPLE_FIXTURE],
  },
  awayForm: {
    teamId: 49,
    fixtures: [
      {
        ...SAMPLE_FIXTURE,
        homeTeam: "Chelsea",
        awayTeam: "Arsenal",
        homeTeamId: 49,
        awayTeamId: 42,
        homeGoals: 0,
        awayGoals: 2,
      },
    ],
  },
  headToHead: [SAMPLE_FIXTURE],
  standings: [
    {
      rank: 1,
      team: "Arsenal",
      teamId: 42,
      played: 10,
      won: 7,
      draw: 2,
      lost: 1,
      goalsFor: 22,
      goalsAgainst: 10,
      points: 23,
    },
  ],
  homeStatistics: {
    teamId: 42,
    leagueId: 39,
    season: 2025,
    form: "WWDLW",
    fixturesPlayed: 10,
    wins: 7,
    draws: 2,
    losses: 1,
    goalsFor: 22,
    goalsAgainst: 10,
    cleanSheets: 4,
    failedToScore: 1,
    averageGoalsFor: 2.2,
    averageGoalsAgainst: 1,
    shotsTotal: 150,
    shotsOnTarget: 60,
    expectedGoals: 2.1,
    expectedGoalsAgainst: 1.1,
  },
  awayStatistics: null,
  injuries: [{ teamId: 49, playerName: "Player A", type: "Missing", reason: "Knee" }],
};

class MockApiFootballClient extends ApiFootballClient {
  constructor() {
    super({ apiKey: "test-key" });
  }

  override isConfigured(): boolean {
    return true;
  }

  override async searchTeam(teamName: string) {
    if (teamName.toLowerCase().includes("arsenal")) {
      return SAMPLE_BUNDLE.homeTeam;
    }
    if (teamName.toLowerCase().includes("chelsea")) {
      return SAMPLE_BUNDLE.awayTeam;
    }
    return null;
  }

  override async getFixture() {
    return SAMPLE_FIXTURE;
  }

  override async getTeamForm(teamId: number) {
    return teamId === 42 ? SAMPLE_BUNDLE.homeForm : SAMPLE_BUNDLE.awayForm;
  }

  override async getHeadToHead() {
    return SAMPLE_BUNDLE.headToHead;
  }

  override async getStandings() {
    return SAMPLE_BUNDLE.standings;
  }

  override async getTeamStatistics(input: { teamId: number }) {
    return input.teamId === 42 ? SAMPLE_BUNDLE.homeStatistics : null;
  }

  override async getInjuries() {
    return SAMPLE_BUNDLE.injuries;
  }
}

async function runTests(): Promise<void> {
  resetFeatureProviderRegistryForTests();
  resetApiFootballCacheStoreForTests();
  resetApiFootballProviderCacheForTests();
  setApiFootballClientForTests(new MockApiFootballClient());

  const request = {
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    matchDate: "2026-07-15",
  };

  const recentForm = mapRecentFormMatchup(SAMPLE_BUNDLE);
  assert(recentForm.home.teamName === "Arsenal", "mapper should map home team");
  assert(recentForm.home.sampleSize === 1, "mapper should compute sample size");

  const homeAway = mapHomeAwaySnapshot(SAMPLE_BUNDLE);
  assert(homeAway.homeLast5[0] === "W", "home form should include win");

  const bundle = await buildApiFootballMatchBundle(request);
  assert(Boolean(bundle), "service should build bundle from mock client");

  const asyncData = await fetchApiFootballSourceDataAsync("recentForm", request);
  assert(asyncData !== null, "async source should return recent form data");
  assert(asyncData!.home.wins === 1, "async recent form should include wins");

  const syncData = fetchApiFootballSourceData("recentForm", request);
  assert(syncData !== null, "sync cache read should return warmed provider data");

  const cacheStore = getApiFootballCacheStore();
  const cacheKey = buildApiFootballCacheKey("teamForm", { teamId: 42 });
  cacheStore.set(cacheKey, "teamForm", SAMPLE_BUNDLE.homeForm);
  const cachedForm = await cacheStore.get<typeof SAMPLE_BUNDLE.homeForm>(cacheKey);
  assert(cachedForm !== null, "cache store should return saved team form");

  await prefetchApiFootballProviders({
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    matchDate: "2026-07-15",
    leagueName: "Premier League",
  });
  const prefetched = fetchApiFootballSourceData("h2h", request);
  assert(prefetched !== null, "prefetch should warm h2h provider cache");
  assert(prefetched!.sampleSize === 1, "prefetched h2h should include one match");

  const registry = createFeatureProviderRegistry();
  const asyncResult = await registry.resolveAsync("homeAway", request);
  assert(asyncResult.source === "apiFootball", "registry async should use api-football source");
  assert(asyncResult.confidence === 0.85, "api-football confidence should be 0.85");

  const cachedResult = await registry.resolveAsync("homeAway", request);
  assert(cachedResult.source === "cache", "second resolve should use cache");

  const unconfiguredClient = new ApiFootballClient({ apiKey: "" });
  setApiFootballClientForTests(unconfiguredClient);
  resetApiFootballProviderCacheForTests();
  const missing = await fetchApiFootballSourceDataAsync("recentForm", request);
  assert(missing === null, "unconfigured client should fail closed to null");

  setApiFootballClientForTests(null);
  resetApiFootballCacheStoreForTests();
  resetApiFootballProviderCacheForTests();
  resetFeatureProviderRegistryForTests();

  console.log("API-Football integration tests passed.");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
