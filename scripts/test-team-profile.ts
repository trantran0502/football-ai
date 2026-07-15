import { createAnalysisSnapshotFromReport } from "@/lib/database/matchSchema";
import type { AnalysisReport } from "@/lib/analysis/types";
import {
  setApiFootballClientForTests,
} from "@/lib/providers/apiFootball/apiFootballClient";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import {
  resetApiFootballQuotaForTests,
  recordApiFootballRequest,
} from "@/lib/providers/apiFootball/apiFootballQuota";
import {
  calculateFormScore,
  calculateMomentumScore,
  calculateTeamProfile,
  clampRate,
  ensureTeamProfilesForMatch,
  enableTeamProfileMemoryStoreForTests,
  disableTeamProfileMemoryStoreForTests,
  filterAwayMatches,
  filterHomeMatches,
  isFriendlyLeague,
  isTeamProfileStale,
  listMemoryTeamProfilesForTests,
  normalizeApiFootballFixtures,
  refreshTeamProfile,
  resetTeamProfileMemoryStoreForTests,
  resetTeamProfileRefreshDedupeForTests,
  shouldExcludeMatch,
  upsertTeamProfile,
  type TeamProfileMatchInput,
} from "@/lib/teamProfile";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const IDENTITY = {
  teamId: 42,
  teamName: "Arsenal",
  leagueId: 39,
  leagueName: "Premier League",
  season: 2026,
};

function buildMatch(overrides: Partial<TeamProfileMatchInput> & Pick<TeamProfileMatchInput, "fixtureId">): TeamProfileMatchInput {
  return {
    fixtureId: overrides.fixtureId,
    date: overrides.date ?? "2026-07-01",
    league: overrides.league ?? "Premier League",
    homeTeam: overrides.homeTeam ?? "Arsenal",
    awayTeam: overrides.awayTeam ?? "Chelsea",
    homeTeamId: overrides.homeTeamId ?? 42,
    awayTeamId: overrides.awayTeamId ?? 49,
    homeGoals: overrides.homeGoals ?? 2,
    awayGoals: overrides.awayGoals ?? 1,
    halfTimeHome: overrides.halfTimeHome ?? 1,
    halfTimeAway: overrides.halfTimeAway ?? 0,
    status: overrides.status ?? "FT",
    shots: overrides.shots,
    shotsOnTarget: overrides.shotsOnTarget,
    possession: overrides.possession,
    xg: overrides.xg,
    xga: overrides.xga,
  };
}

function buildRecent10(): TeamProfileMatchInput[] {
  const outcomes = [
    { homeGoals: 2, awayGoals: 0 },
    { homeGoals: 1, awayGoals: 1 },
    { homeGoals: 3, awayGoals: 2 },
    { homeGoals: 0, awayGoals: 1 },
    { homeGoals: 2, awayGoals: 1 },
    { homeGoals: 1, awayGoals: 0 },
    { homeGoals: 2, awayGoals: 2 },
    { homeGoals: 3, awayGoals: 0 },
    { homeGoals: 1, awayGoals: 2 },
    { homeGoals: 2, awayGoals: 1 },
  ];

  return outcomes.map((item, index) =>
    buildMatch({
      fixtureId: index + 1,
      date: `2026-06-${String(30 - index).padStart(2, "0")}`,
      homeTeam: index % 2 === 0 ? "Arsenal" : "Tottenham",
      awayTeam: index % 2 === 0 ? "Chelsea" : "Arsenal",
      homeTeamId: index % 2 === 0 ? 42 : 47,
      awayTeamId: index % 2 === 0 ? 49 : 42,
      homeGoals: item.homeGoals,
      awayGoals: item.awayGoals,
    })
  );
}

function testRecent10Record(): void {
  const profile = calculateTeamProfile({
    identity: IDENTITY,
    matches: buildRecent10(),
    source: "api-football",
  });

  assert(profile.sampleSize === 10, "recent10 sample size");
  assert(
    (profile.recent10Wins ?? 0) +
      (profile.recent10Draws ?? 0) +
      (profile.recent10Losses ?? 0) ===
      10,
    "recent10 W/D/L should sum to sample size"
  );
  assert(profile.recent10Wins === 4, "recent10 wins");
  assert(profile.recent10Draws === 2, "recent10 draws");
  assert(profile.recent10Losses === 4, "recent10 losses");
}

function testHomeAwaySplits(): void {
  const matches = [
    buildMatch({ fixtureId: 1, homeTeam: "Arsenal", awayTeam: "Chelsea", homeTeamId: 42, awayTeamId: 49, homeGoals: 2, awayGoals: 0 }),
    buildMatch({ fixtureId: 2, homeTeam: "Arsenal", awayTeam: "Tottenham", homeTeamId: 42, awayTeamId: 47, homeGoals: 1, awayGoals: 1 }),
    buildMatch({ fixtureId: 3, homeTeam: "Liverpool", awayTeam: "Arsenal", homeTeamId: 40, awayTeamId: 42, homeGoals: 0, awayGoals: 2 }),
    buildMatch({ fixtureId: 4, homeTeam: "Chelsea", awayTeam: "Arsenal", homeTeamId: 49, awayTeamId: 42, homeGoals: 1, awayGoals: 2 }),
    buildMatch({ fixtureId: 5, homeTeam: "Arsenal", awayTeam: "Brighton", homeTeamId: 42, awayTeamId: 51, homeGoals: 3, awayGoals: 1 }),
  ];

  const homeMatches = filterHomeMatches(matches, 42);
  const awayMatches = filterAwayMatches(matches, 42);
  assert(homeMatches.length === 3, "home split count");
  assert(awayMatches.length === 2, "away split count");

  const profile = calculateTeamProfile({
    identity: IDENTITY,
    matches,
    source: "api-football",
  });
  assert(profile.home5Matches === 3, "home5 matches");
  assert(profile.away5Matches === 2, "away5 matches");
  assert(profile.home5WinRate !== null && profile.home5WinRate > 0, "home5 win rate");
  assert(profile.away5AvgGoals === 2, "away5 avg goals");
}

function testScoringRates(): void {
  const matches = [
    buildMatch({ fixtureId: 1, homeGoals: 2, awayGoals: 1 }),
    buildMatch({ fixtureId: 2, homeGoals: 1, awayGoals: 1 }),
    buildMatch({ fixtureId: 3, homeGoals: 3, awayGoals: 2 }),
    buildMatch({ fixtureId: 4, homeGoals: 0, awayGoals: 0 }),
  ];

  const profile = calculateTeamProfile({
    identity: IDENTITY,
    matches,
    source: "api-football",
  });

  assert(profile.bttsRate === 0.75, "btts rate");
  assert(profile.over25Rate === 0.5, "over 2.5 rate");
  assert(profile.over35Rate === 0.25, "over 3.5 rate");
  assert(profile.cleanSheetRate === 0.25, "clean sheet rate");
  assert(profile.failedToScoreRate === 0.25, "failed to score rate");
}

function testExcludeFriendlyAndCancelled(): void {
  assert(isFriendlyLeague("Club Friendlies"), "friendly league detection");
  assert(
    shouldExcludeMatch({ status: "FT", league: "Club Friendlies" }),
    "friendly should be excluded"
  );
  assert(
    shouldExcludeMatch({ status: "CANC", league: "Premier League" }),
    "cancelled should be excluded"
  );

  const fixtures: ApiFootballFixtureRecord[] = [
    {
      fixtureId: 1,
      date: "2026-07-01",
      kickoffTime: null,
      league: "Premier League",
      leagueId: 39,
      season: 2026,
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      homeTeamId: 42,
      awayTeamId: 49,
      status: "FT",
      homeGoals: 2,
      awayGoals: 1,
      halfTimeHome: 1,
      halfTimeAway: 0,
      venue: null,
      neutralVenue: false,
    },
    {
      fixtureId: 2,
      date: "2026-06-24",
      kickoffTime: null,
      league: "Friendlies",
      leagueId: 667,
      season: 2026,
      homeTeam: "Arsenal",
      awayTeam: "Lyon",
      homeTeamId: 42,
      awayTeamId: 80,
      status: "FT",
      homeGoals: 4,
      awayGoals: 0,
      halfTimeHome: 2,
      halfTimeAway: 0,
      venue: null,
      neutralVenue: false,
    },
    {
      fixtureId: 3,
      date: "2026-06-17",
      kickoffTime: null,
      league: "Premier League",
      leagueId: 39,
      season: 2026,
      homeTeam: "Arsenal",
      awayTeam: "Liverpool",
      homeTeamId: 42,
      awayTeamId: 40,
      status: "CANC",
      homeGoals: null,
      awayGoals: null,
      halfTimeHome: null,
      halfTimeAway: null,
      venue: null,
      neutralVenue: false,
    },
  ];

  const normalized = normalizeApiFootballFixtures(fixtures);
  assert(normalized.length === 1, "only official completed league match remains");
}

function testInsufficientSampleAndMissingXg(): void {
  const profile = calculateTeamProfile({
    identity: IDENTITY,
    matches: [buildMatch({ fixtureId: 1 })],
    source: "incomplete",
  });

  assert(profile.sampleSize === 1, "insufficient sample keeps sample size");
  assert(profile.avgXg === null, "missing xG must stay null");
  assert(profile.avgXga === null, "missing xGA must stay null");
  assert(profile.momentumScore === null, "momentum requires >=6 matches");
}

function testRateClampAndFormMomentum(): void {
  assert(clampRate(1.5) === 1, "rate clamp upper");
  assert(clampRate(-0.2) === 0, "rate clamp lower");

  const improving = calculateMomentumScore([
    { points: 3, date: "d1" },
    { points: 3, date: "d2" },
    { points: 3, date: "d3" },
    { points: 3, date: "d4" },
    { points: 3, date: "d5" },
    { points: 0, date: "d6" },
    { points: 0, date: "d7" },
    { points: 1, date: "d8" },
    { points: 0, date: "d9" },
    { points: 1, date: "d10" },
  ]);
  assert(improving !== null && improving > 50, "momentum should rise when recent form improves");

  const declining = calculateMomentumScore([
    { points: 0, date: "d1" },
    { points: 0, date: "d2" },
    { points: 1, date: "d3" },
    { points: 0, date: "d4" },
    { points: 1, date: "d5" },
    { points: 3, date: "d6" },
    { points: 3, date: "d7" },
    { points: 3, date: "d8" },
    { points: 3, date: "d9" },
    { points: 3, date: "d10" },
  ]);
  assert(declining !== null && declining < 50, "momentum should fall when recent form declines");

  const form = calculateFormScore([
    { points: 3, date: "d1" },
    { points: 3, date: "d2" },
    { points: 3, date: "d3" },
  ]);
  assert(form !== null && form > 90, "strong recent form should score high");
}

async function testUpsertAndStale(): Promise<void> {
  enableTeamProfileMemoryStoreForTests();
  resetTeamProfileMemoryStoreForTests();

  const profile = calculateTeamProfile({
    identity: IDENTITY,
    matches: buildRecent10(),
    source: "api-football",
    calculatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
  });

  await upsertTeamProfile(profile);
  const updated = await upsertTeamProfile({
    ...profile,
    formScore: 88,
  });

  assert(listMemoryTeamProfilesForTests().length === 1, "upsert should not duplicate profile");
  assert(updated.persisted, "upsert update should succeed in memory store");
  assert(isTeamProfileStale(profile), "profile older than TTL should be stale");
}

async function testSameDayDedupe(): Promise<void> {
  resetTeamProfileRefreshDedupeForTests();
  resetApiFootballQuotaForTests();

  class MockClient {
    isConfigured(): boolean {
      return true;
    }
    async getTeamForm(): Promise<{ teamId: number; fixtures: ApiFootballFixtureRecord[] }> {
      recordApiFootballRequest();
      const match = buildMatch({ fixtureId: 99, homeGoals: 2, awayGoals: 1 });
      return {
        teamId: 42,
        fixtures: [
          {
            fixtureId: match.fixtureId,
            date: match.date,
            kickoffTime: null,
            league: match.league,
            leagueId: 39,
            season: 2026,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            homeTeamId: match.homeTeamId,
            awayTeamId: match.awayTeamId,
            status: match.status,
            homeGoals: match.homeGoals,
            awayGoals: match.awayGoals,
            halfTimeHome: match.halfTimeHome,
            halfTimeAway: match.halfTimeAway,
            venue: null,
            neutralVenue: false,
          },
        ],
      };
    }
    async getTeamStatistics(): Promise<null> {
      return null;
    }
  }

  setApiFootballClientForTests(new MockClient() as never);

  const first = await refreshTeamProfile({
    ...IDENTITY,
    runDate: "2026-07-16",
    allowApiFetch: true,
  });
  const second = await refreshTeamProfile({
    ...IDENTITY,
    runDate: "2026-07-16",
    allowApiFetch: true,
  });

  assert(first.refreshed, "first refresh should run");
  assert(!second.refreshed, "same team same day should dedupe");
  assert(second.skippedReason === "same_day_dedupe", "dedupe reason");

  setApiFootballClientForTests(null);
}

async function testQuotaFallback(): Promise<void> {
  resetTeamProfileRefreshDedupeForTests();
  resetTeamProfileMemoryStoreForTests();
  enableTeamProfileMemoryStoreForTests();
  resetApiFootballQuotaForTests();

  for (let index = 0; index < 100; index += 1) {
    recordApiFootballRequest();
  }

  const result = await refreshTeamProfile({
    ...IDENTITY,
    runDate: "2026-07-17",
    allowApiFetch: true,
  });

  assert(!result.refreshed || result.profile.source !== "api-football" || result.warnings.length > 0, "quota fallback should warn or use fallback");
}

function testAnalysisSnapshotTeamProfiles(): void {
  const profile = calculateTeamProfile({
    identity: IDENTITY,
    matches: buildRecent10(),
    source: "api-football",
  });

  const report = {
    match: {
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      league: "Premier League",
    },
    markets: [],
    interpretations: [],
    crossMarketValidation: { status: "notImplemented", reason: "test" },
    candidates: [],
    betaRecommendation: { status: "notImplemented", reason: "test" },
    recommendation: { status: "notImplemented", reason: "test" },
    bettingIntelligence: null,
    decision: null,
    teamProfiles: {
      home: profile,
      away: { ...profile, teamId: 49, teamName: "Chelsea" },
      completeness: profile.dataCompleteness,
      warnings: [],
    },
  } as unknown as AnalysisReport;

  const snapshot = createAnalysisSnapshotFromReport(report, new Date().toISOString(), "match-1", "2026-07-16");
  assert(snapshot.teamProfiles?.home?.teamName === "Arsenal", "snapshot should include home profile");
  assert(snapshot.teamProfiles?.away?.teamName === "Chelsea", "snapshot should include away profile");
}

async function runTests(): Promise<void> {
  enableTeamProfileMemoryStoreForTests();
  try {
    testRecent10Record();
    testHomeAwaySplits();
    testScoringRates();
    testExcludeFriendlyAndCancelled();
    testInsufficientSampleAndMissingXg();
    testRateClampAndFormMomentum();
    await testUpsertAndStale();
    await testSameDayDedupe();
    await testQuotaFallback();
    testAnalysisSnapshotTeamProfiles();
    console.log("All team profile tests passed.");
  } finally {
    disableTeamProfileMemoryStoreForTests();
    setApiFootballClientForTests(null);
    resetTeamProfileRefreshDedupeForTests();
  }
}

runTests().catch((error) => {
  console.error(error);
  disableTeamProfileMemoryStoreForTests();
  setApiFootballClientForTests(null);
  process.exit(1);
});
