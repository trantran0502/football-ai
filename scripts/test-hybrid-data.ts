import {
  dedupeMatchRecords,
  mergeHybridField,
  mergeMatchRecordLists,
  resolveHybridTeamContext,
  resetHybridCacheForTests,
  type HybridMatchRecord,
  type HybridSourcePayload,
} from "@/lib/hybrid";
import {
  resetApiFootballQuotaForTests,
} from "@/lib/providers/apiFootball/apiFootballQuota";
import { resetApiFootballProviderCacheForTests } from "@/lib/providers/apiFootball/apiFootballService";
import {
  rememberGooglePayload,
  resetGoogleSearchCacheForTests,
  buildGoogleSearchCacheKey,
} from "@/lib/providers/googleSearch/googleSearchCache";
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

function matchRecord(input: Partial<HybridMatchRecord> & Pick<HybridMatchRecord, "matchDate" | "homeTeam" | "awayTeam" | "homeGoals" | "awayGoals">): HybridMatchRecord {
  return {
    competition: "Premier League",
    competitionType: "league",
    venue: "home",
    neutralVenue: false,
    includesExtraTime: false,
    includesPenalties: false,
    ...input,
  };
}

function buildApiPayload(
  overrides: Partial<HybridSourcePayload> = {}
): HybridSourcePayload {
  return {
    source: "apiFootball",
    fetchedAt: "2026-07-10T08:00:00.000Z",
    confidence: 0.85,
    citations: [],
    queries: [],
    homeTeam: HOME,
    awayTeam: AWAY,
    matchDate: MATCH_DATE,
    recentFormLast10Official: [
      matchRecord({
        matchDate: "2026-07-05",
        homeTeam: HOME,
        awayTeam: "Liverpool",
        homeGoals: 2,
        awayGoals: 1,
      }),
    ],
    recentFormLast5Home: [
      matchRecord({
        matchDate: "2026-07-05",
        homeTeam: HOME,
        awayTeam: "Liverpool",
        homeGoals: 2,
        awayGoals: 1,
      }),
    ],
    recentFormLast5Away: [
      matchRecord({
        matchDate: "2026-06-28",
        homeTeam: "Brighton",
        awayTeam: AWAY,
        homeGoals: 0,
        awayGoals: 2,
        venue: "away",
      }),
    ],
    includesFriendlies: false,
    includesExtraTime: false,
    includesPenalties: false,
    h2hLast5Official: [
      matchRecord({
        matchDate: "2026-04-01",
        homeTeam: HOME,
        awayTeam: AWAY,
        homeGoals: 1,
        awayGoals: 1,
      }),
    ],
    standings: [
      {
        teamName: HOME,
        rank: 2,
        played: 10,
        points: 22,
        goalsFor: 18,
        goalsAgainst: 8,
      },
    ],
    injuries: [
      {
        teamName: HOME,
        playerName: "Player A",
        reason: "Knee",
        status: "Out",
      },
    ],
    suspensions: [],
    homeMetrics: {
      goalsFor: 18,
      goalsAgainst: 8,
      xg: 1.8,
      xga: 0.9,
      shots: 120,
      shotsOnTarget: 45,
      possession: 58,
      cleanSheets: null,
      failedToScore: null,
    },
    awayMetrics: {
      goalsFor: 14,
      goalsAgainst: 12,
      xg: 1.4,
      xga: 1.1,
      shots: 100,
      shotsOnTarget: 36,
      possession: 52,
      cleanSheets: null,
      failedToScore: null,
    },
    matchStatus: {
      importance: "Title race",
      mustWin: true,
      alreadyQualified: false,
      alreadyEliminated: false,
      weather: "Clear",
      longTravelAway: false,
      congestedSchedule: true,
      coachNews: null,
      officialNews: null,
      rotation: null,
    },
    ...overrides,
  };
}

function buildGooglePayload(
  overrides: Partial<HybridSourcePayload> = {}
): HybridSourcePayload {
  const api = buildApiPayload();
  return {
    ...api,
    source: "googleSearch",
    fetchedAt: "2026-07-10T08:05:00.000Z",
    confidence: 0.65,
    citations: [
      {
        url: "https://example.com/arsenal-form",
        title: "Arsenal recent results",
        snippet: "Latest Premier League results",
      },
    ],
    queries: [`${HOME} vs ${AWAY} recent form ${MATCH_DATE}`],
    suspensions: [],
    ...overrides,
  };
}

function runTests(): void {
  resetHybridCacheForTests();
  resetGoogleSearchCacheForTests();
  resetApiFootballQuotaForTests();
  resetApiFootballProviderCacheForTests();
  resetFeatureProviderRegistryForTests();

  const agreement = resolveHybridTeamContext(
    { homeTeam: HOME, awayTeam: AWAY, matchDate: MATCH_DATE },
    {
      apiPayload: buildApiPayload(),
      googlePayload: buildGooglePayload(),
    }
  );
  assert(
    agreement.recentFormLast10Official.conflicts.length === 0,
    "API and Google agreement should produce no conflicts"
  );
  assert(
    agreement.recentFormLast10Official.confidence >= 0.9,
    "agreement should increase confidence"
  );
  assert(
    agreement.recentFormLast10Official.citations.length === 1,
    "Google citations should be preserved on agreement"
  );

  const conflict = resolveHybridTeamContext(
    { homeTeam: HOME, awayTeam: AWAY, matchDate: MATCH_DATE },
    {
      apiPayload: buildApiPayload({
        standings: [
          {
            teamName: HOME,
            rank: 2,
            played: 10,
            points: 22,
            goalsFor: 18,
            goalsAgainst: 8,
          },
        ],
      }),
      googlePayload: buildGooglePayload({
        standings: [
          {
            teamName: HOME,
            rank: 4,
            played: 10,
            points: 18,
            goalsFor: 15,
            goalsAgainst: 10,
          },
        ],
      }),
    }
  );
  assert(
    conflict.standings.conflicts.length === 1,
    "API and Google conflict should be recorded"
  );
  assert(
    conflict.standings.value === null,
    "conflicting scalar field should not guess a winner"
  );
  assert(
    conflict.standings.confidence < agreement.standings.confidence,
    "conflict should reduce confidence"
  );

  const apiOnly = resolveHybridTeamContext(
    { homeTeam: HOME, awayTeam: AWAY, matchDate: MATCH_DATE },
    { apiPayload: buildApiPayload(), googlePayload: null }
  );
  assert(
    apiOnly.recentFormLast10Official.source === "apiFootball",
    "API-only path should keep API source"
  );
  assert(
    apiOnly.warnings.some((warning) => warning.includes("Google Search payload missing")),
    "API-only path should warn about missing Google data"
  );

  const googleOnly = resolveHybridTeamContext(
    { homeTeam: HOME, awayTeam: AWAY, matchDate: MATCH_DATE },
    { apiPayload: null, googlePayload: buildGooglePayload() }
  );
  assert(
    googleOnly.h2hLast5Official.source === "googleSearch",
    "Google-only path should keep Google source"
  );
  assert(
    googleOnly.h2hLast5Official.citations.length === 1,
    "Google-only path should preserve citations"
  );

  const missingBoth = resolveHybridTeamContext(
    { homeTeam: HOME, awayTeam: AWAY, matchDate: MATCH_DATE },
    { apiPayload: null, googlePayload: null }
  );
  assert(
    missingBoth.recentFormLast10Official.value === null,
    "missing both sources should leave field empty"
  );

  const dateMismatch = mergeMatchRecordLists(
    "h2hLast5Official",
    [
      matchRecord({
        matchDate: "2026-04-01",
        homeTeam: HOME,
        awayTeam: AWAY,
        homeGoals: 2,
        awayGoals: 0,
      }),
    ],
    [
      matchRecord({
        matchDate: "2026-04-03",
        homeTeam: HOME,
        awayTeam: AWAY,
        homeGoals: 2,
        awayGoals: 0,
      }),
    ],
    {
      source: "apiFootball",
      fetchedAt: "2026-07-10T08:00:00.000Z",
      confidence: 0.85,
      citations: [],
    },
    {
      source: "googleSearch",
      fetchedAt: "2026-07-10T08:05:00.000Z",
      confidence: 0.65,
      citations: [{ url: "https://example.com/h2h" }],
    }
  );
  assert(
    (dateMismatch.value?.length ?? 0) >= 2,
    "date mismatch should keep separate records instead of picking first result"
  );

  const friendlyMixed = resolveHybridTeamContext(
    { homeTeam: HOME, awayTeam: AWAY, matchDate: MATCH_DATE },
    {
      apiPayload: buildApiPayload({
        recentFormLast10Official: [
          matchRecord({
            matchDate: "2026-07-05",
            homeTeam: HOME,
            awayTeam: "Liverpool",
            homeGoals: 2,
            awayGoals: 1,
          }),
        ],
        includesFriendlies: false,
      }),
      googlePayload: buildGooglePayload({
        recentFormLast10Official: [
          matchRecord({
            matchDate: "2026-07-04",
            homeTeam: HOME,
            awayTeam: "Club Friendlies",
            homeGoals: 4,
            awayGoals: 0,
            competition: "Club Friendlies",
            competitionType: "friendly",
          }),
        ],
        includesFriendlies: true,
      }),
    }
  );
  assert(
    friendlyMixed.recentFormLast10Official.value?.includesFriendlies === true,
    "friendly inclusion flag should be preserved when Google includes friendlies"
  );

  const reversedHomeAway = mergeMatchRecordLists(
    "h2hLast5Official",
    [
      matchRecord({
        matchDate: "2026-04-01",
        homeTeam: HOME,
        awayTeam: AWAY,
        homeGoals: 1,
        awayGoals: 0,
      }),
    ],
    [
      matchRecord({
        matchDate: "2026-04-01",
        homeTeam: AWAY,
        awayTeam: HOME,
        homeGoals: 0,
        awayGoals: 1,
      }),
    ],
    {
      source: "apiFootball",
      fetchedAt: "2026-07-10T08:00:00.000Z",
      confidence: 0.85,
      citations: [],
    },
    {
      source: "googleSearch",
      fetchedAt: "2026-07-10T08:05:00.000Z",
      confidence: 0.65,
      citations: [{ url: "https://example.com/reversed" }],
    }
  );
  assert(
    reversedHomeAway.conflicts.some((item) =>
      item.message.includes("home/away direction")
    ),
    "reversed home/away direction should create conflict"
  );

  const deduped = dedupeMatchRecords([
    matchRecord({
      matchDate: "2026-07-05",
      homeTeam: HOME,
      awayTeam: "Liverpool",
      homeGoals: 2,
      awayGoals: 1,
    }),
    matchRecord({
      matchDate: "2026-07-05",
      homeTeam: HOME,
      awayTeam: "Liverpool",
      homeGoals: 2,
      awayGoals: 1,
    }),
  ]);
  assert(deduped.length === 1, "duplicate records should be deduplicated");

  const scalarAgreement = mergeHybridField(
    "matchStatus",
    {
      source: "apiFootball",
      fetchedAt: "2026-07-10T08:00:00.000Z",
      confidence: 0.85,
      citations: [],
      value: buildApiPayload().matchStatus!,
    },
    {
      source: "googleSearch",
      fetchedAt: "2026-07-10T08:05:00.000Z",
      confidence: 0.65,
      citations: [{ url: "https://example.com/status" }],
      value: buildGooglePayload().matchStatus!,
    }
  );
  assert(
    scalarAgreement.citations.length === 1,
    "scalar merge should retain citations"
  );

  const googlePayload = buildGooglePayload();
  rememberGooglePayload(
    buildGoogleSearchCacheKey({
      homeTeam: HOME,
      awayTeam: AWAY,
      matchDate: MATCH_DATE,
      query: "team context grounding",
    }),
    googlePayload
  );

  const registry = createFeatureProviderRegistry();
  const recentForm = registry.resolveSync("recentForm", {
    homeTeam: HOME,
    awayTeam: AWAY,
    matchDate: MATCH_DATE,
  });
  assert(
    recentForm.source === "googleSearch",
    "sync registry should read cached Google payload when API cache is cold"
  );

  console.log("Hybrid data tests passed.");
}

runTests();
