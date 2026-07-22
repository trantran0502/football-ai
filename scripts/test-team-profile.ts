import { runTeamProfileRecommendationPipelineTests } from "./test-team-profile-recommendation-pipeline";
import { createAnalysisSnapshotFromReport } from "@/lib/database/matchSchema";
import type { AnalysisReport } from "@/lib/analysis/types";
import {
  mapFixtureRecord,
  setApiFootballClientForTests,
} from "@/lib/providers/apiFootball/apiFootballClient";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import {
  resetApiFootballQuotaForTests,
  recordApiFootballRequest,
} from "@/lib/providers/apiFootball/apiFootballQuota";
import {
  parseApiFootballPlanSeasonRestriction,
  parsePlanSeasonMessage,
  parsePlanSeasonRestrictionFromText,
} from "@/lib/providers/apiFootball/apiFootballPlanErrors";
import {
  buildTeamProfilePersistencePlan,
  buildTeamProfileTeamDiagnostic,
  buildTeamFormPathForProfile,
  calculateFormScore,
  calculateMomentumScore,
  calculateTeamProfile,
  clampRate,
  ensureTeamProfilesForMatch,
  enableTeamProfileMemoryStoreForTests,
  disableTeamProfileMemoryStoreForTests,
  fetchTeamProfileData,
  filterAwayMatches,
  filterHomeMatches,
  getTeamProfile,
  isFriendlyLeague,
  isTeamProfileStale,
  listMemoryTeamProfilesForTests,
  markProfileRefreshFailure,
  normalizeApiFootballFixtures,
  refreshTeamProfile,
  resetTeamProfileFixtureFetchState,
  resetTeamProfileMemoryStoreForTests,
  resetTeamProfileRefreshDedupeForTests,
  shouldExcludeMatch,
  shouldUseLastParameterForTeamProfile,
  sliceRecentMatches,
  TEAM_PROFILE_UPSERT_CONFLICT_KEY,
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

function buildMockTeamFormPath(
  teamId: number,
  last: number,
  options: {
    leagueId?: number;
    season?: number;
    status?: string;
    useLast?: boolean;
  } = {}
): string {
  const useLast = options.useLast !== false;
  let path = `/fixtures?team=${teamId}`;
  if (useLast) {
    path += `&last=${last}`;
  }
  if (options.leagueId) {
    path += `&league=${options.leagueId}`;
  }
  if (options.season) {
    path += `&season=${options.season}`;
  }
  if (options.status) {
    path += `&status=${options.status}`;
  }
  return path;
}

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

async function testSkipOverwriteExistingCompleteWithIncomplete(): Promise<void> {
  enableTeamProfileMemoryStoreForTests();
  resetTeamProfileMemoryStoreForTests();

  const complete = calculateTeamProfile({
    identity: IDENTITY,
    matches: buildRecent10(),
    source: "api-football",
  });
  assert(complete.sampleSize > 0, "fixture complete profile should have sample>0");

  const savedComplete = await upsertTeamProfile(complete);
  assert(savedComplete.persisted, "complete profile should persist");
  assert(savedComplete.profile.sampleSize > 0, "stored complete sample should be >0");

  const incompleteAttempt = await upsertTeamProfile({
    ...complete,
    sampleSize: 0,
    source: "incomplete",
    dataCompleteness: 0,
    formScore: null,
    recent10Wins: null,
  });

  assert(incompleteAttempt.skippedOverwrite === true, "incomplete must skip overwrite");
  assert(incompleteAttempt.persisted, "skip should still report persisted kept row");
  assert(
    incompleteAttempt.profile.sampleSize === complete.sampleSize,
    "existing complete sample must be preserved"
  );
  assert(
    incompleteAttempt.profile.source === "api-football",
    "existing complete source must be preserved"
  );

  const listed = listMemoryTeamProfilesForTests();
  assert(listed.length === 1, "still one profile row");
  assert(listed[0].sampleSize === complete.sampleSize, "memory store sample unchanged");
  assert(listed[0].source === "api-football", "memory store source unchanged");

  const refreshFailed = await markProfileRefreshFailure(IDENTITY, "quota interrupted");
  assert(refreshFailed.skippedOverwrite === true, "refresh_failed must not wipe complete");
  assert(refreshFailed.profile.source === "api-football", "complete source kept after failure mark");
  assert(refreshFailed.profile.sampleSize === complete.sampleSize, "complete sample kept after failure mark");

  // No existing row: incomplete insert still allowed
  resetTeamProfileMemoryStoreForTests();
  const firstIncomplete = await upsertTeamProfile({
    ...complete,
    sampleSize: 0,
    source: "incomplete",
    dataCompleteness: 0,
  });
  assert(firstIncomplete.persisted, "first incomplete insert allowed");
  assert(firstIncomplete.skippedOverwrite !== true, "no skip when no existing");
  assert(firstIncomplete.profile.source === "incomplete", "incomplete may be created when absent");
  assert(firstIncomplete.profile.sampleSize === 0, "incomplete sample 0 stored when absent");
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
    waitForQuota: false,
  });

  assert(!result.refreshed || result.profile.source !== "api-football" || result.warnings.length > 0, "quota fallback should warn or use fallback");
  assert(result.diagnostics.quotaExhausted, "quota fallback should mark quota exhausted");
  assert(
    result.warnings.some((warning) => warning.includes("quota")),
    "quota fallback should include quota diagnostic warning"
  );
}

async function testQuotaSkipDiagnostics(): Promise<void> {
  resetTeamProfileRefreshDedupeForTests();
  resetTeamProfileMemoryStoreForTests();
  enableTeamProfileMemoryStoreForTests();
  resetApiFootballQuotaForTests();

  for (let index = 0; index < 10; index += 1) {
    recordApiFootballRequest();
  }

  class QuotaBlockedClient {
    isConfigured(): boolean {
      return true;
    }

    async getTeamForm(): Promise<{ teamId: number; fixtures: ApiFootballFixtureRecord[]; meta: { requestPath: string; rawResponseCount: number } }> {
      recordApiFootballRequest();
      return {
        teamId: 42,
        fixtures: [],
        meta: { requestPath: "/fixtures?team=42&last=15", rawResponseCount: 0 },
      };
    }

    async getTeamStatistics(): Promise<null> {
      return null;
    }
  }

  setApiFootballClientForTests(new QuotaBlockedClient() as never);

  const result = await refreshTeamProfile({
    ...IDENTITY,
    runDate: "2026-07-19",
    allowApiFetch: true,
    waitForQuota: false,
    side: "home",
    matchLabel: "Arsenal vs Chelsea",
  });

  assert(result.diagnostics.quotaExhausted, "minute quota skip should expose quotaExhausted");
  assert(
    result.skippedReason === "quota_exhausted" || result.warnings.some((warning) => warning.includes("quota")),
    "minute quota skip should expose skipped reason or quota warning"
  );

  setApiFootballClientForTests(null);
}

async function testApiRawEmptyDiagnostics(): Promise<void> {
  resetTeamProfileRefreshDedupeForTests();
  resetTeamProfileMemoryStoreForTests();
  enableTeamProfileMemoryStoreForTests();
  resetApiFootballQuotaForTests();

  class RawEmptyClient {
    isConfigured(): boolean {
      return true;
    }

    async getTeamForm(): Promise<{ teamId: number; fixtures: ApiFootballFixtureRecord[]; meta: { requestPath: string; rawResponseCount: number } }> {
      recordApiFootballRequest();
      return {
        teamId: 42,
        fixtures: [],
        meta: { requestPath: "/fixtures?team=42&last=15&status=FT", rawResponseCount: 0 },
      };
    }

    async getTeamStatistics(): Promise<null> {
      return null;
    }
  }

  setApiFootballClientForTests(new RawEmptyClient() as never);

  const result = await refreshTeamProfile({
    ...IDENTITY,
    runDate: "2026-07-20",
    allowApiFetch: true,
    side: "home",
    matchLabel: "Arsenal vs Chelsea",
  });

  assert(result.diagnostics.rawResponseCount === 0, "raw empty diagnostic should expose rawResponseCount=0");
  assert(result.skippedReason === "api_raw_empty" || result.skippedReason === "normalized_empty", "raw empty should expose api_raw_empty or normalized_empty");

  setApiFootballClientForTests(null);
}

async function testNormalizedEmptyDiagnostics(): Promise<void> {
  resetTeamProfileRefreshDedupeForTests();
  resetTeamProfileMemoryStoreForTests();
  enableTeamProfileMemoryStoreForTests();
  resetApiFootballQuotaForTests();

  class NormalizedEmptyClient {
    isConfigured(): boolean {
      return true;
    }

    async getTeamForm(): Promise<{ teamId: number; fixtures: ApiFootballFixtureRecord[]; meta: { requestPath: string; rawResponseCount: number } }> {
      recordApiFootballRequest();
      return {
        teamId: 42,
        fixtures: [
          {
            fixtureId: 701,
            date: "2026-06-01",
            kickoffTime: null,
            league: "Friendlies",
            leagueId: 667,
            season: 2025,
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
        ],
        meta: { requestPath: "/fixtures?team=42&last=15&status=FT", rawResponseCount: 1 },
      };
    }

    async getTeamStatistics(): Promise<null> {
      return null;
    }
  }

  setApiFootballClientForTests(new NormalizedEmptyClient() as never);

  const result = await refreshTeamProfile({
    ...IDENTITY,
    runDate: "2026-07-21",
    allowApiFetch: true,
    side: "home",
    matchLabel: "Arsenal vs Chelsea",
  });

  assert(result.diagnostics.rawResponseCount === 1, "normalized empty should keep raw count");
  assert(result.diagnostics.normalizedMatchCount === 0, "normalized empty should expose normalizedMatchCount=0");
  assert(result.skippedReason === "normalized_empty", "friendly-only history should mark normalized_empty");

  setApiFootballClientForTests(null);
}

function testMapFixtureRecordFulltimeFallback(): void {
  const fixture = mapFixtureRecord({
    fixture: {
      id: 9001,
      date: "2026-06-01T15:00:00+00:00",
      status: { short: "FT" },
      venue: { name: "Emirates Stadium" },
    },
    league: { id: 39, name: "Premier League", season: 2025 },
    teams: {
      home: { id: 42, name: "Arsenal" },
      away: { id: 49, name: "Chelsea" },
    },
    goals: { home: null, away: null },
    score: {
      fulltime: { home: 2, away: 1 },
      halftime: { home: 1, away: 0 },
    },
  });

  assert(fixture.homeGoals === 2, "fulltime home goals fallback");
  assert(fixture.awayGoals === 1, "fulltime away goals fallback");
}

async function testSeasonFallbackFetch(): Promise<void> {
  resetApiFootballQuotaForTests();
  resetTeamProfileFixtureFetchState();
  const calls: string[] = [];

  class SeasonFallbackClient {
    isConfigured(): boolean {
      return true;
    }

    async getTeamForm(
      teamId: number,
      last: number,
      options: { leagueId?: number; season?: number; status?: string; useLast?: boolean } = {}
    ): Promise<{ teamId: number; fixtures: ApiFootballFixtureRecord[]; meta: { requestPath: string; rawResponseCount: number } }> {
      recordApiFootballRequest();
      const path = buildMockTeamFormPath(teamId, last, options);
      calls.push(path);

      if (options.season === 2026) {
        return {
          teamId,
          fixtures: [],
          meta: { requestPath: path, rawResponseCount: 0 },
        };
      }

      const match = buildMatch({ fixtureId: 501, homeGoals: 2, awayGoals: 1 });
      return {
        teamId,
        fixtures: [
          {
            fixtureId: match.fixtureId,
            date: match.date,
            kickoffTime: null,
            league: match.league,
            leagueId: 39,
            season: 2025,
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
        meta: { requestPath: path, rawResponseCount: 1 },
      };
    }

    async getTeamStatistics(): Promise<null> {
      return null;
    }
  }

  setApiFootballClientForTests(new SeasonFallbackClient() as never);

  const result = await fetchTeamProfileData({
    ...IDENTITY,
    season: 2026,
  });

  assert(result.matches.length === 0, "empty current season should not auto-fallback to previous season");
  assert(calls.some((path) => path.includes("season=2026")), "should try current season first");
  assert(!calls.some((path) => path.includes("season=2025")), "should not fallback to previous season without plan restriction");
  assert(!calls.some((path) => path.includes("last=")), "free mode should not send last parameter");

  setApiFootballClientForTests(null);
}

async function testFreePlanHistoricalFallback(): Promise<void> {
  resetApiFootballQuotaForTests();
  resetTeamProfileRefreshDedupeForTests();
  resetTeamProfileMemoryStoreForTests();
  enableTeamProfileMemoryStoreForTests();
  const calls: string[] = [];

  class FreePlanClient {
    isConfigured(): boolean {
      return true;
    }

    async getTeamForm(
      teamId: number,
      last: number,
      options: { leagueId?: number; season?: number; status?: string; useLast?: boolean } = {}
    ): Promise<{
      teamId: number;
      fixtures: ApiFootballFixtureRecord[];
      meta: {
        requestPath: string;
        rawResponseCount: number;
        planRestriction?: { message: string; minSeason: number; maxSeason: number } | null;
      };
    }> {
      recordApiFootballRequest();
      const path = buildMockTeamFormPath(teamId, last, options);
      calls.push(path);

      if (options.season === 2026) {
        return {
          teamId,
          fixtures: [],
          meta: {
            requestPath: path,
            rawResponseCount: 0,
            planRestriction: {
              message: "Free plans do not have access to this season, try from 2022 to 2024.",
              minSeason: 2022,
              maxSeason: 2024,
            },
          },
        };
      }

      if (options.season === 2024) {
        const match = buildMatch({
          fixtureId: 801,
          date: "2024-05-01",
          homeGoals: 2,
          awayGoals: 1,
        });
        return {
          teamId,
          fixtures: [
            {
              fixtureId: match.fixtureId,
              date: match.date,
              kickoffTime: null,
              league: match.league,
              leagueId: 39,
              season: 2024,
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
          meta: { requestPath: path, rawResponseCount: 1, planRestriction: null },
        };
      }

      return {
        teamId,
        fixtures: [],
        meta: { requestPath: path, rawResponseCount: 0, planRestriction: null },
      };
    }

    async getTeamStatistics(): Promise<null> {
      return null;
    }
  }

  setApiFootballClientForTests(new FreePlanClient() as never);

  const result = await refreshTeamProfile({
    ...IDENTITY,
    runDate: "2026-07-22",
    allowApiFetch: true,
    side: "home",
    matchLabel: "Arsenal vs Chelsea",
  });

  assert(result.profile.requestedSeason === 2026, "requestedSeason should stay 2026");
  assert(result.profile.season === 2024, "stored season should be dataSeason 2024");
  assert(result.profile.isHistoricalBaseline, "historical baseline flag should be true");
  assert(result.profile.stalenessYears === 2, "stalenessYears should be 2");
  assert(result.profile.sampleSize === 1, "historical baseline should populate sample size");
  assert(
    result.warnings.some((warning) => warning.includes("Using 2024 historical baseline")),
    "historical baseline warning should be present"
  );
  assert(calls.some((path) => path.includes("season=2026")), "should attempt requested season first");
  assert(calls.some((path) => path.includes("season=2024")), "should fallback to max free-plan season");
  assert(!calls.some((path) => path.includes("season=2025")), "should not waste requests on unsupported 2025");
  assert(!calls.some((path) => path.includes("last=")), "free mode requests should omit last parameter");
  assert(result.diagnostics.attempts.length >= 2, "diagnostics attempts should include season calls");
  assert(result.diagnostics.requestUrls.length >= 2, "requestUrls should be populated");
  assert(
    result.skippedReason !== "normalized_empty",
    "plan restriction fallback should not be labeled normalized_empty"
  );

  setApiFootballClientForTests(null);
}

function testHistoricalCompletenessPenalty(): void {
  const full = calculateTeamProfile({
    identity: IDENTITY,
    matches: buildRecent10(),
    source: "api-football",
    seasonMetadata: {
      requestedSeason: 2026,
      dataSeason: 2026,
      isHistoricalBaseline: false,
      stalenessYears: 0,
      fallbackReason: null,
    },
  });
  const historical = calculateTeamProfile({
    identity: IDENTITY,
    matches: buildRecent10(),
    source: "api-football",
    seasonMetadata: {
      requestedSeason: 2026,
      dataSeason: 2024,
      isHistoricalBaseline: true,
      stalenessYears: 2,
      fallbackReason: "historical_season_fallback",
    },
  });

  assert(
    (historical.dataCompleteness ?? 0) < (full.dataCompleteness ?? 0),
    "historical baseline completeness should be penalized"
  );
  assert((historical.dataCompleteness ?? 0) < 100, "historical baseline must not score full completeness");
}

async function testVerifiedRecordsFusion(): Promise<void> {
  resetApiFootballQuotaForTests();

  class Baseline2024Client {
    isConfigured(): boolean {
      return true;
    }

    async getTeamForm(
      teamId: number,
      last: number,
      options: { leagueId?: number; season?: number; status?: string; useLast?: boolean } = {}
    ) {
      recordApiFootballRequest();
      const path = buildMockTeamFormPath(teamId, last, options);
      if (options.season === 2024) {
        const match = buildMatch({ fixtureId: 901, date: "2024-04-01", homeGoals: 1, awayGoals: 0 });
        return {
          teamId,
          fixtures: [
            {
              fixtureId: match.fixtureId,
              date: match.date,
              kickoffTime: null,
              league: match.league,
              leagueId: 39,
              season: 2024,
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
          meta: {
            requestPath: path,
            rawResponseCount: 1,
            planRestriction: null,
          },
        };
      }
      return {
        teamId,
        fixtures: [],
        meta: {
          requestPath: path,
          rawResponseCount: 0,
          planRestriction:
            options.season === 2026
              ? {
                  message: "Free plans do not have access to this season, try from 2022 to 2024.",
                  minSeason: 2022,
                  maxSeason: 2024,
                }
              : null,
        },
      };
    }

    async getTeamStatistics(): Promise<null> {
      return null;
    }
  }

  setApiFootballClientForTests(new Baseline2024Client() as never);

  const verifiedMatch = buildMatch({ fixtureId: 902, date: "2025-09-01", homeGoals: 3, awayGoals: 2 });
  const result = await fetchTeamProfileData(
    { ...IDENTITY, season: 2026 },
    {
      listVerifiedRecords: async () => [
        {
          id: "verified-1",
          matchDate: verifiedMatch.date,
          homeTeam: verifiedMatch.homeTeam,
          awayTeam: verifiedMatch.awayTeam,
          league: verifiedMatch.league ?? "Premier League",
          status: "VERIFIED",
          result: {
            fullTimeHomeGoals: verifiedMatch.homeGoals,
            fullTimeAwayGoals: verifiedMatch.awayGoals,
            halfTimeHomeGoals: verifiedMatch.halfTimeHome,
            halfTimeAwayGoals: verifiedMatch.halfTimeAway,
          },
        } as never,
      ],
    }
  );

  assert(result.matches.length === 2, "verified newer records should fuse with API baseline");
  assert(result.matches[0].date === "2025-09-01", "newer verified match should sort first");

  setApiFootballClientForTests(null);
}

async function testEmptyProfileDedupeRetry(): Promise<void> {
  resetTeamProfileRefreshDedupeForTests();
  resetTeamProfileMemoryStoreForTests();
  enableTeamProfileMemoryStoreForTests();
  resetApiFootballQuotaForTests();

  let phase: "first" | "second" = "first";

  class RetryClient {
    isConfigured(): boolean {
      return true;
    }

    async getTeamForm(): Promise<{ teamId: number; fixtures: ApiFootballFixtureRecord[]; meta: { requestPath: string; rawResponseCount: number } }> {
      recordApiFootballRequest();

      if (phase === "first") {
        return {
          teamId: 42,
          fixtures: [],
          meta: { requestPath: "/fixtures?team=42&last=15", rawResponseCount: 0 },
        };
      }

      const match = buildMatch({ fixtureId: 601, homeGoals: 1, awayGoals: 0 });
      return {
        teamId: 42,
        fixtures: [
          {
            fixtureId: match.fixtureId,
            date: match.date,
            kickoffTime: null,
            league: match.league,
            leagueId: 39,
            season: 2025,
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
        meta: { requestPath: "/fixtures?team=42&last=15", rawResponseCount: 1 },
      };
    }

    async getTeamStatistics(): Promise<null> {
      return null;
    }
  }

  setApiFootballClientForTests(new RetryClient() as never);

  const first = await refreshTeamProfile({
    ...IDENTITY,
    runDate: "2026-07-18",
    allowApiFetch: true,
  });
  phase = "second";
  const second = await refreshTeamProfile({
    ...IDENTITY,
    runDate: "2026-07-18",
    allowApiFetch: true,
  });

  assert(first.profile.sampleSize === 0, "first refresh may remain empty");
  assert(second.refreshed, "empty profile should retry on same-day dedupe");
  assert(second.profile.sampleSize === 1, "retry should populate sample size");

  setApiFootballClientForTests(null);
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

async function testHistoricalBaselineRepositoryPersistence(): Promise<void> {
  enableTeamProfileMemoryStoreForTests();
  resetTeamProfileMemoryStoreForTests();

  const historical = calculateTeamProfile({
    identity: IDENTITY,
    matches: buildRecent10(),
    source: "api-football",
    seasonMetadata: {
      requestedSeason: 2026,
      dataSeason: 2024,
      isHistoricalBaseline: true,
      stalenessYears: 2,
      fallbackReason: "plan_season_restricted",
    },
  });

  const plan = buildTeamProfilePersistencePlan(historical);
  assert(
    TEAM_PROFILE_UPSERT_CONFLICT_KEY.join(",") === "team_id,league_id,requested_season",
    "conflict key should target requested season"
  );
  assert(plan.conflictKey.requested_season === 2026, "conflict key requested_season should be 2026");
  assert(plan.updatePayload.season === 2024, "update payload season should be dataSeason 2024");
  assert(plan.updatePayload.requested_season === 2026, "update payload requested_season should be 2026");
  assert(plan.updatePayload.is_historical_baseline === true, "update payload should set historical baseline");
  assert(plan.updatePayload.staleness_years === 2, "update payload should set staleness years");
  assert(plan.insertPayload.season === 2024, "insert payload season should be dataSeason 2024");
  assert(
    plan.insertPayload.requested_season === 2026,
    "insert payload requested_season should be 2026"
  );

  await upsertTeamProfile({
    ...IDENTITY,
    season: 2026,
    requestedSeason: 2026,
    isHistoricalBaseline: false,
    stalenessYears: null,
    sampleSize: 0,
    source: "refresh_failed",
    dataCompleteness: 0,
    calculatedAt: new Date().toISOString(),
    recent10Wins: null,
    recent10Draws: null,
    recent10Losses: null,
    recent10PointsPerGame: null,
    recent10AvgGoals: null,
    recent10AvgConceded: null,
    home5Matches: null,
    home5WinRate: null,
    home5AvgGoals: null,
    home5AvgConceded: null,
    away5Matches: null,
    away5WinRate: null,
    away5AvgGoals: null,
    away5AvgConceded: null,
    bttsRate: null,
    over25Rate: null,
    over35Rate: null,
    under25Rate: null,
    cleanSheetRate: null,
    failedToScoreRate: null,
    avgShots: null,
    avgShotsOnTarget: null,
    avgPossession: null,
    avgXg: null,
    avgXga: null,
    formScore: null,
    momentumScore: null,
  });

  const saved = await upsertTeamProfile(historical);
  assert(saved.persisted, "historical upsert should persist in memory store");
  assert(saved.profile.season === 2024, "stored season should become dataSeason 2024");
  assert(saved.profile.requestedSeason === 2026, "requestedSeason should remain 2026");
  assert(saved.profile.isHistoricalBaseline, "isHistoricalBaseline should be true after upsert");
  assert(saved.profile.stalenessYears === 2, "stalenessYears should be 2 after upsert");
  assert(saved.profile.sampleSize > 0, "historical profile should retain sample size");

  const loaded = await getTeamProfile(IDENTITY.teamId, IDENTITY.leagueId, 2026);
  assert(loaded?.season === 2024, "reload by requested season should return dataSeason 2024");
  assert(loaded?.isHistoricalBaseline === true, "reload should preserve historical baseline flag");
  assert(listMemoryTeamProfilesForTests().length === 1, "upsert should consolidate to one profile row");
}

async function testProductionPlanSeasonParserFormats(): Promise<void> {
  const formats = [
    "Free plans do not have access to this season, try from 2022 to 2024.",
    "Free plans do not have access to this season, from 2022 to 2024",
    "Free plans do not have access between 2022 and 2024",
    "Free plans do not have access to seasons 2022-2024",
    "API-Football error: {\"plan\":\"Free plans do not have access, from 2022 to 2024\"}",
  ];

  for (const message of formats) {
    const parsed =
      parsePlanSeasonMessage(message) ?? parsePlanSeasonRestrictionFromText(message);
    assert(parsed !== null, `parser should resolve production format: ${message}`);
    assert(parsed!.maxSeason === 2024, `maxSeason should be 2024 for: ${message}`);
    assert(parsed!.minSeason === 2022, `minSeason should be 2022 for: ${message}`);
  }

  const nestedPlanObject = parseApiFootballPlanSeasonRestriction({
    plan: {
      season: "Free plans do not have access between 2022 and 2024",
    },
  });
  assert(nestedPlanObject !== null, "parser should resolve nested errors.plan object");
  assert(nestedPlanObject!.maxSeason === 2024, "nested errors.plan maxSeason should be 2024");
}

async function testProductionPlanErrorParserClientPath(): Promise<void> {
  resetApiFootballQuotaForTests();
  resetTeamProfileMemoryStoreForTests();
  enableTeamProfileMemoryStoreForTests();
  const calls: string[] = [];

  class ProductionParserPathClient {
    isConfigured(): boolean {
      return true;
    }

    async getTeamForm(
      teamId: number,
      last: number,
      options: { leagueId?: number; season?: number; status?: string; useLast?: boolean } = {}
    ): Promise<{
      teamId: number;
      fixtures: ApiFootballFixtureRecord[];
      meta: {
        requestPath: string;
        rawResponseCount: number;
        planRestriction?: { message: string; minSeason: number; maxSeason: number } | null;
      };
    }> {
      recordApiFootballRequest();
      const path = buildMockTeamFormPath(teamId, last, options);
      calls.push(path);

      if (options.season === 2026) {
        const errors = {
          plan: "Free plans do not have access to this season, try from 2022 to 2024.",
        };
        const planRestriction = parseApiFootballPlanSeasonRestriction(errors);
        assert(planRestriction !== null, "production errors.plan should parse without throw");
        return {
          teamId,
          fixtures: [],
          meta: {
            requestPath: path,
            rawResponseCount: 0,
            planRestriction: {
              message: planRestriction!.message,
              minSeason: planRestriction!.minSeason,
              maxSeason: planRestriction!.maxSeason,
            },
          },
        };
      }

      if (options.season === 2024) {
        const match = buildMatch({
          fixtureId: 901,
          date: "2024-04-12",
          homeGoals: 2,
          awayGoals: 0,
        });
        return {
          teamId,
          fixtures: [
            {
              fixtureId: match.fixtureId,
              date: match.date,
              kickoffTime: null,
              league: match.league,
              leagueId: 39,
              season: 2024,
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
          meta: { requestPath: path, rawResponseCount: 1, planRestriction: null },
        };
      }

      return {
        teamId,
        fixtures: [],
        meta: { requestPath: path, rawResponseCount: 0, planRestriction: null },
      };
    }

    async getTeamStatistics(): Promise<null> {
      return null;
    }
  }

  setApiFootballClientForTests(new ProductionParserPathClient() as never);

  const fetched = await fetchTeamProfileData(
    { ...IDENTITY },
    { allowApiFetch: true, listVerifiedRecords: async () => [] }
  );
  const profile = calculateTeamProfile({
    identity: IDENTITY,
    matches: fetched.matches,
    advancedStats: fetched.advancedStats,
    source: fetched.source,
    seasonMetadata: fetched.seasonMetadata,
  });
  const diagnostic = buildTeamProfileTeamDiagnostic({
    teamId: IDENTITY.teamId,
    teamName: IDENTITY.teamName,
    side: "home",
    matchLabel: "Arsenal vs Chelsea",
    fetchDiagnostics: fetched.diagnostics,
    source: profile.source,
    sampleSize: profile.sampleSize,
    warnings: fetched.warnings,
    quotaAvailable: true,
  });

  assert(fetched.diagnostics.attempts.length >= 2, "parser path should record at least 2 attempts");
  assert(
    fetched.diagnostics.attempts.some((attempt) => attempt.season === 2026 && attempt.planRestricted),
    "2026 attempt should be marked plan restricted"
  );
  assert(
    fetched.diagnostics.attempts.some((attempt) => attempt.season === 2024),
    "2024 fallback attempt should be recorded"
  );
  assert(
    diagnostic.requestUrls.some((url) => url.includes("season=2026")),
    "requestUrls should include season=2026"
  );
  assert(
    diagnostic.requestUrls.some((url) => url.includes("season=2024")),
    "requestUrls should include season=2024"
  );
  assert(profile.season === 2024, "profile season should be dataSeason 2024");
  assert(profile.requestedSeason === 2026, "profile requestedSeason should remain 2026");
  assert(profile.isHistoricalBaseline, "profile should be historical baseline");
  assert(profile.sampleSize > 0, "2024 fallback with data should populate sample size");
  assert(calls.some((path) => path.includes("season=2026")), "2026 request should be attempted");
  assert(calls.some((path) => path.includes("season=2024")), "2024 fallback request should be attempted");
  assert(!calls.some((path) => path.includes("last=")), "2024 fallback should omit last parameter");

  setApiFootballClientForTests(null);
}

async function testProductionPlanErrorCatchFallbackPath(): Promise<void> {
  resetApiFootballQuotaForTests();
  const calls: string[] = [];

  class ThrowingProductionClient {
    isConfigured(): boolean {
      return true;
    }

    async getTeamForm(
      teamId: number,
      last: number,
      options: { leagueId?: number; season?: number; status?: string; useLast?: boolean } = {}
    ): Promise<{
      teamId: number;
      fixtures: ApiFootballFixtureRecord[];
      meta: { requestPath: string; rawResponseCount: number };
    }> {
      recordApiFootballRequest();
      const path = buildMockTeamFormPath(teamId, last, options);
      calls.push(path);

      if (options.season === 2026) {
        throw new Error(
          'API-Football error: {"plan":"Free plans do not have access to this season, from 2022 to 2024"}'
        );
      }

      if (options.season === 2024) {
        const match = buildMatch({
          fixtureId: 902,
          date: "2024-03-18",
          homeGoals: 1,
          awayGoals: 1,
        });
        return {
          teamId,
          fixtures: [
            {
              fixtureId: match.fixtureId,
              date: match.date,
              kickoffTime: null,
              league: match.league,
              leagueId: 39,
              season: 2024,
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
          meta: { requestPath: path, rawResponseCount: 1 },
        };
      }

      return {
        teamId,
        fixtures: [],
        meta: { requestPath: path, rawResponseCount: 0 },
      };
    }

    async getTeamStatistics(): Promise<null> {
      return null;
    }
  }

  setApiFootballClientForTests(new ThrowingProductionClient() as never);

  const fetched = await fetchTeamProfileData(
    { ...IDENTITY },
    { allowApiFetch: true, listVerifiedRecords: async () => [] }
  );
  const profile = calculateTeamProfile({
    identity: IDENTITY,
    matches: fetched.matches,
    advancedStats: fetched.advancedStats,
    source: fetched.source,
    seasonMetadata: fetched.seasonMetadata,
  });

  assert(fetched.diagnostics.attempts.length >= 2, "catch fallback should record at least 2 attempts");
  assert(
    fetched.diagnostics.attempts.some(
      (attempt) =>
        attempt.season === 2026 &&
        attempt.planRestricted &&
        attempt.success === false &&
        attempt.error
    ),
    "2026 attempt should record plan-restricted error with requestUrl"
  );
  assert(
    fetched.diagnostics.attempts.some((attempt) => attempt.season === 2024 && attempt.success === true),
    "2024 fallback attempt should succeed"
  );
  assert(
    fetched.diagnostics.attempts.every((attempt) => attempt.requestUrl.length > 0),
    "attempt diagnostics must retain requestUrl"
  );
  assert(profile.season === 2024, "catch fallback profile season should be 2024");
  assert(profile.sampleSize > 0, "catch fallback with 2024 data should populate sample size");
  assert(calls.some((path) => path.includes("season=2024")), "catch fallback should call season=2024");

  setApiFootballClientForTests(null);
}

async function testProductionPlanErrorEmptyHistoricalMetadata(): Promise<void> {
  resetApiFootballQuotaForTests();

  class EmptyHistoricalClient {
    isConfigured(): boolean {
      return true;
    }

    async getTeamForm(
      teamId: number,
      last: number,
      options: { leagueId?: number; season?: number; status?: string; useLast?: boolean } = {}
    ): Promise<{
      teamId: number;
      fixtures: ApiFootballFixtureRecord[];
      meta: {
        requestPath: string;
        rawResponseCount: number;
        planRestriction?: { message: string; minSeason: number; maxSeason: number } | null;
      };
    }> {
      recordApiFootballRequest();
      const path = buildMockTeamFormPath(teamId, last, options);

      if (options.season === 2026) {
        const planRestriction = parseApiFootballPlanSeasonRestriction({
          plan: "Free plans do not have access between 2022 and 2024",
        });
        return {
          teamId,
          fixtures: [],
          meta: {
            requestPath: path,
            rawResponseCount: 0,
            planRestriction: planRestriction
              ? {
                  message: planRestriction.message,
                  minSeason: planRestriction.minSeason,
                  maxSeason: planRestriction.maxSeason,
                }
              : null,
          },
        };
      }

      return {
        teamId,
        fixtures: [],
        meta: { requestPath: path, rawResponseCount: 0, planRestriction: null },
      };
    }

    async getTeamStatistics(): Promise<null> {
      return null;
    }
  }

  setApiFootballClientForTests(new EmptyHistoricalClient() as never);

  const fetched = await fetchTeamProfileData(
    { ...IDENTITY },
    { allowApiFetch: true, listVerifiedRecords: async () => [] }
  );
  const profile = calculateTeamProfile({
    identity: IDENTITY,
    matches: fetched.matches,
    advancedStats: fetched.advancedStats,
    source: fetched.source,
    seasonMetadata: fetched.seasonMetadata,
  });

  assert(fetched.source === "incomplete", "empty historical fallback may still be incomplete source");
  assert(fetched.seasonMetadata.dataSeason === 2024, "empty fallback should preserve dataSeason 2024");
  assert(fetched.seasonMetadata.requestedSeason === 2026, "empty fallback should preserve requestedSeason 2026");
  assert(fetched.seasonMetadata.isHistoricalBaseline, "empty fallback should preserve historical baseline flag");
  assert(fetched.seasonMetadata.stalenessYears === 2, "empty fallback should preserve stalenessYears");
  assert(
    fetched.seasonMetadata.fallbackReason === "historical_season_fallback",
    "empty fallback should preserve fallbackReason"
  );
  assert(profile.season === 2024, "calculator should not backfill requested season 2026");
  assert(profile.sampleSize === 0, "empty fallback should keep sample size at 0");
  assert(fetched.diagnostics.attempts.length >= 2, "empty fallback should still record both attempts");

  setApiFootballClientForTests(null);
}

function testFreePlanRequestUrlNoLast(): void {
  resetTeamProfileFixtureFetchState();
  assert(
    buildTeamFormPathForProfile(42, { leagueId: 39, season: 2026, status: "FT" }) ===
      "/fixtures?team=42&league=39&season=2026&status=FT",
    "free plan path should omit last parameter"
  );
  assert(!shouldUseLastParameterForTeamProfile(), "free mode should disable last parameter");
}

function testLocalSliceAndSort(): void {
  const fixtures = Array.from({ length: 30 }, (_, index) =>
    buildMatch({
      fixtureId: index + 1,
      date: `2024-01-${String(30 - index).padStart(2, "0")}`,
    })
  );
  const sliced = sliceRecentMatches(fixtures, 15);
  assert(sliced.length === 15, "should slice to 15 fixtures");
  assert(sliced[0].date >= sliced[1].date, "should sort newest first");
  assert(sliced[0].date === "2024-01-30", "newest fixture should be first");
}

async function testFixtureFetchThrowPreservesAttempt(): Promise<void> {
  resetApiFootballQuotaForTests();
  resetTeamProfileFixtureFetchState();

  class ThrowingClient {
    isConfigured(): boolean {
      return true;
    }

    async getTeamForm(
      teamId: number,
      last: number,
      options: { leagueId?: number; season?: number; status?: string; useLast?: boolean } = {}
    ): Promise<never> {
      recordApiFootballRequest();
      const path = buildMockTeamFormPath(teamId, last, options);
      throw new Error(`API-Football error: network failure for ${path}`);
    }

    async getTeamStatistics(): Promise<null> {
      return null;
    }
  }

  setApiFootballClientForTests(new ThrowingClient() as never);

  const fetched = await fetchTeamProfileData(
    { ...IDENTITY },
    { allowApiFetch: true, listVerifiedRecords: async () => [] }
  );

  assert(fetched.diagnostics.attempts.length >= 1, "throw should still record attempt");
  assert(
    fetched.diagnostics.attempts[0].requestUrl.includes("team=42"),
    "attempt should retain requestUrl"
  );
  assert(fetched.diagnostics.attempts[0].success === false, "attempt should be marked unsuccessful");
  assert(
    Boolean(fetched.diagnostics.attempts[0].error?.includes("network failure")),
    "attempt should retain error message"
  );
  assert(fetched.diagnostics.attempts[0].season === 2026, "attempt should retain season");
  assert(fetched.diagnostics.attempts[0].leagueId === 39, "attempt should retain leagueId");
  assert(fetched.diagnostics.attempts[0].status === "FT", "attempt should retain status");

  setApiFootballClientForTests(null);
}

async function testLeagueFallbackWithoutLeague(): Promise<void> {
  resetApiFootballQuotaForTests();
  resetTeamProfileFixtureFetchState();
  const calls: string[] = [];

  class LeagueFallbackClient {
    isConfigured(): boolean {
      return true;
    }

    async getTeamForm(
      teamId: number,
      last: number,
      options: { leagueId?: number; season?: number; status?: string; useLast?: boolean } = {}
    ) {
      recordApiFootballRequest();
      const path = buildMockTeamFormPath(teamId, last, options);
      calls.push(path);

      if (options.season === 2026) {
        return {
          teamId,
          fixtures: [],
          meta: {
            requestPath: path,
            rawResponseCount: 0,
            planRestriction: {
              message: "Free plans do not have access to this season, try from 2022 to 2024.",
              minSeason: 2022,
              maxSeason: 2024,
            },
          },
        };
      }

      if (options.season === 2024 && options.leagueId) {
        return {
          teamId,
          fixtures: [],
          meta: { requestPath: path, rawResponseCount: 0, planRestriction: null },
        };
      }

      if (options.season === 2024 && !options.leagueId) {
        const match = buildMatch({ fixtureId: 1201, date: "2024-02-10", homeGoals: 2, awayGoals: 0 });
        return {
          teamId,
          fixtures: [
            {
              fixtureId: match.fixtureId,
              date: match.date,
              kickoffTime: null,
              league: match.league,
              leagueId: 39,
              season: 2024,
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
          meta: { requestPath: path, rawResponseCount: 1, planRestriction: null },
        };
      }

      return {
        teamId,
        fixtures: [],
        meta: { requestPath: path, rawResponseCount: 0, planRestriction: null },
      };
    }

    async getTeamStatistics(): Promise<null> {
      return null;
    }
  }

  setApiFootballClientForTests(new LeagueFallbackClient() as never);

  const fetched = await fetchTeamProfileData(
    { ...IDENTITY },
    { allowApiFetch: true, listVerifiedRecords: async () => [] }
  );

  assert(
    calls.some((path) => path.includes("season=2024") && path.includes("league=39")),
    "should try league-scoped 2024 first"
  );
  assert(
    calls.some((path) => path.includes("season=2024") && !path.includes("league=")),
    "should fallback to team+season=2024 without league"
  );
  assert(!calls.some((path) => path.includes("last=")), "league fallback requests should omit last");
  assert(fetched.matches.length === 1, "league fallback should return 2024 matches");
  assert(fetched.seasonMetadata.dataSeason === 2024, "dataSeason should be 2024");

  setApiFootballClientForTests(null);
}

async function testApiReturns30FixturesLocallySlicedTo15(): Promise<void> {
  resetApiFootballQuotaForTests();
  resetTeamProfileFixtureFetchState();

  class ManyFixturesClient {
    isConfigured(): boolean {
      return true;
    }

    async getTeamForm(
      teamId: number,
      last: number,
      options: { leagueId?: number; season?: number; status?: string; useLast?: boolean } = {}
    ) {
      recordApiFootballRequest();
      const path = buildMockTeamFormPath(teamId, last, options);
      const fixtures = Array.from({ length: 30 }, (_, index) => {
        const match = buildMatch({
          fixtureId: index + 1,
          date: `2024-03-${String(30 - index).padStart(2, "0")}`,
        });
        return {
          fixtureId: match.fixtureId,
          date: match.date,
          kickoffTime: null,
          league: match.league,
          leagueId: 39,
          season: 2024,
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
        };
      });

      return {
        teamId,
        fixtures,
        meta: { requestPath: path, rawResponseCount: 30, planRestriction: null },
      };
    }

    async getTeamStatistics(): Promise<null> {
      return null;
    }
  }

  setApiFootballClientForTests(new ManyFixturesClient() as never);

  const fetched = await fetchTeamProfileData(
    { ...IDENTITY, season: 2024 },
    { allowApiFetch: true, listVerifiedRecords: async () => [] }
  );

  assert(fetched.matches.length === 15, "30 API fixtures should be sliced to 15 locally");
  assert(fetched.matches[0].date === "2024-03-30", "sliced fixtures should remain sorted newest first");

  setApiFootballClientForTests(null);
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
    await testSkipOverwriteExistingCompleteWithIncomplete();
    await testSameDayDedupe();
    await testQuotaFallback();
    await testQuotaSkipDiagnostics();
    await testApiRawEmptyDiagnostics();
    await testNormalizedEmptyDiagnostics();
    testMapFixtureRecordFulltimeFallback();
    testFreePlanRequestUrlNoLast();
    testLocalSliceAndSort();
    await testSeasonFallbackFetch();
    await testFreePlanHistoricalFallback();
    await testFixtureFetchThrowPreservesAttempt();
    await testLeagueFallbackWithoutLeague();
    await testApiReturns30FixturesLocallySlicedTo15();
    testHistoricalCompletenessPenalty();
    await testProductionPlanSeasonParserFormats();
    await testProductionPlanErrorParserClientPath();
    await testProductionPlanErrorCatchFallbackPath();
    await testProductionPlanErrorEmptyHistoricalMetadata();
    await testHistoricalBaselineRepositoryPersistence();
    await testVerifiedRecordsFusion();
    await testEmptyProfileDedupeRetry();
    testAnalysisSnapshotTeamProfiles();
    await runTeamProfileRecommendationPipelineTests();
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
