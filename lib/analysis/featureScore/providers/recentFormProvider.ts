/**
 * PR3: Recent Form data provider — mock-only in this PR.
 * No API-Football, Google Search, or Supabase integration.
 */

export interface RecentFormTeamSnapshot {
  teamName: string;
  sampleSize: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  winRate: number | null;
  avgGoalsFor: number | null;
  avgGoalsAgainst: number | null;
  goalDifferencePerMatch: number | null;
  /** Win rate in home/away venue-specific sample. */
  venueWinRate: number | null;
  /** Trend score in [-1, 1]; positive = improving. */
  momentum: number | null;
  cleanSheetRate: number | null;
  failedToScoreRate: number | null;
}

export interface RecentFormProviderRequest {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
}

export interface RecentFormMatchup {
  home: RecentFormTeamSnapshot;
  away: RecentFormTeamSnapshot;
}

export interface RecentFormProvider {
  getRecentForm(request: RecentFormProviderRequest): RecentFormMatchup;
}

interface MockFormProfile {
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  venueWinRate: number;
  momentum: number;
  cleanSheetRate: number;
  failedToScoreRate: number;
}

const MOCK_PROFILES = {
  strong: {
    wins: 7,
    draws: 2,
    losses: 1,
    goalsFor: 22,
    goalsAgainst: 8,
    venueWinRate: 0.8,
    momentum: 0.45,
    cleanSheetRate: 0.5,
    failedToScoreRate: 0.1,
  },
  average: {
    wins: 4,
    draws: 3,
    losses: 3,
    goalsFor: 14,
    goalsAgainst: 14,
    venueWinRate: 0.5,
    momentum: 0,
    cleanSheetRate: 0.25,
    failedToScoreRate: 0.25,
  },
  weak: {
    wins: 2,
    draws: 3,
    losses: 5,
    goalsFor: 9,
    goalsAgainst: 18,
    venueWinRate: 0.2,
    momentum: -0.35,
    cleanSheetRate: 0.1,
    failedToScoreRate: 0.4,
  },
} as const satisfies Record<string, MockFormProfile>;

function roundRate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function buildSnapshot(
  teamName: string,
  profile: MockFormProfile
): RecentFormTeamSnapshot {
  const sampleSize = profile.wins + profile.draws + profile.losses;
  const winRate = sampleSize > 0 ? roundRate(profile.wins / sampleSize) : null;
  const avgGoalsFor =
    sampleSize > 0 ? roundRate(profile.goalsFor / sampleSize) : null;
  const avgGoalsAgainst =
    sampleSize > 0 ? roundRate(profile.goalsAgainst / sampleSize) : null;
  const goalDifferencePerMatch =
    avgGoalsFor !== null && avgGoalsAgainst !== null
      ? roundRate(avgGoalsFor - avgGoalsAgainst)
      : null;

  return {
    teamName,
    sampleSize,
    wins: profile.wins,
    draws: profile.draws,
    losses: profile.losses,
    goalsFor: profile.goalsFor,
    goalsAgainst: profile.goalsAgainst,
    winRate,
    avgGoalsFor,
    avgGoalsAgainst,
    goalDifferencePerMatch,
    venueWinRate: roundRate(profile.venueWinRate),
    momentum: roundRate(profile.momentum),
    cleanSheetRate: roundRate(profile.cleanSheetRate),
    failedToScoreRate: roundRate(profile.failedToScoreRate),
  };
}

function resolveMockProfile(teamName: string): MockFormProfile {
  const normalized = teamName.trim().toLowerCase();

  if (
    normalized.includes("strong") ||
    normalized === "mockhome fc" ||
    normalized.includes("法國")
  ) {
    return MOCK_PROFILES.strong;
  }

  if (
    normalized.includes("weak") ||
    normalized === "mockaway fc" ||
    normalized.includes("保級")
  ) {
    return MOCK_PROFILES.weak;
  }

  return MOCK_PROFILES.average;
}

export function createMockRecentFormProvider(): RecentFormProvider {
  return {
    getRecentForm(request: RecentFormProviderRequest): RecentFormMatchup {
      return {
        home: buildSnapshot(request.homeTeam, resolveMockProfile(request.homeTeam)),
        away: buildSnapshot(request.awayTeam, resolveMockProfile(request.awayTeam)),
      };
    },
  };
}

/** Preset snapshots for unit tests. */
export const MOCK_RECENT_FORM_FIXTURES = {
  strongHome: buildSnapshot("MockHome FC", MOCK_PROFILES.strong),
  weakAway: buildSnapshot("MockAway FC", MOCK_PROFILES.weak),
  averageTeam: buildSnapshot("Average FC", MOCK_PROFILES.average),
} as const;
