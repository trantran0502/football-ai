/**
 * PR5: Home / Away Strength data provider — mock-only in this PR.
 * No API-Football, Google Search, or Supabase integration.
 */

export type FormResult = "W" | "D" | "L";

export interface HomeAwaySnapshot {
  homeLast5: FormResult[];
  awayLast5: FormResult[];
  homeWinRate: number | null;
  awayWinRate: number | null;
  homeGoalsFor: number | null;
  awayGoalsFor: number | null;
  homeGoalsAgainst: number | null;
  awayGoalsAgainst: number | null;
  homeCleanSheetRate: number | null;
  awayCleanSheetRate: number | null;
}

export interface HomeAwayProviderRequest {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
}

export interface HomeAwayProvider {
  getHomeAwayStrength(request: HomeAwayProviderRequest): HomeAwaySnapshot;
}

interface MockHomeAwayProfile {
  homeLast5: FormResult[];
  awayLast5: FormResult[];
  homeWinRate: number;
  awayWinRate: number;
  homeGoalsFor: number;
  awayGoalsFor: number;
  homeGoalsAgainst: number;
  awayGoalsAgainst: number;
  homeCleanSheetRate: number;
  awayCleanSheetRate: number;
}

const MOCK_HOME_PROFILE: MockHomeAwayProfile = {
  homeLast5: ["W", "W", "D", "W", "W"],
  awayLast5: ["W", "D", "W", "L", "W"],
  homeWinRate: 0.75,
  awayWinRate: 0.55,
  homeGoalsFor: 2.1,
  awayGoalsFor: 1.6,
  homeGoalsAgainst: 0.9,
  awayGoalsAgainst: 1.4,
  homeCleanSheetRate: 0.45,
  awayCleanSheetRate: 0.25,
};

const MOCK_AWAY_PROFILE: MockHomeAwayProfile = {
  homeLast5: ["L", "D", "L", "W", "D"],
  awayLast5: ["L", "L", "D", "L", "D"],
  homeWinRate: 0.35,
  awayWinRate: 0.2,
  homeGoalsFor: 1.2,
  awayGoalsFor: 0.9,
  homeGoalsAgainst: 1.8,
  awayGoalsAgainst: 1.7,
  homeCleanSheetRate: 0.15,
  awayCleanSheetRate: 0.1,
};

const MOCK_AVERAGE_PROFILE: MockHomeAwayProfile = {
  homeLast5: ["W", "D", "L", "W", "D"],
  awayLast5: ["D", "L", "W", "D", "L"],
  homeWinRate: 0.5,
  awayWinRate: 0.4,
  homeGoalsFor: 1.5,
  awayGoalsFor: 1.3,
  homeGoalsAgainst: 1.4,
  awayGoalsAgainst: 1.5,
  homeCleanSheetRate: 0.25,
  awayCleanSheetRate: 0.2,
};

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function resolveHomeProfile(teamName: string): MockHomeAwayProfile {
  const normalized = teamName.trim().toLowerCase();

  if (
    normalized.includes("strong") ||
    normalized === "mockhome fc" ||
    normalized.includes("法國")
  ) {
    return MOCK_HOME_PROFILE;
  }

  if (
    normalized.includes("weak") ||
    normalized === "mockaway fc" ||
    normalized.includes("保級")
  ) {
    return MOCK_AWAY_PROFILE;
  }

  return MOCK_AVERAGE_PROFILE;
}

function resolveAwayProfile(teamName: string): MockHomeAwayProfile {
  const normalized = teamName.trim().toLowerCase();

  if (
    normalized.includes("weak") ||
    normalized === "mockaway fc" ||
    normalized.includes("保級")
  ) {
    return MOCK_AWAY_PROFILE;
  }

  if (
    normalized.includes("strong") ||
    normalized === "mockhome fc" ||
    normalized.includes("法國")
  ) {
    return MOCK_HOME_PROFILE;
  }

  return MOCK_AVERAGE_PROFILE;
}

function buildSnapshot(
  homeProfile: MockHomeAwayProfile,
  awayProfile: MockHomeAwayProfile
): HomeAwaySnapshot {
  return {
    homeLast5: [...homeProfile.homeLast5],
    awayLast5: [...awayProfile.awayLast5],
    homeWinRate: roundMetric(homeProfile.homeWinRate),
    awayWinRate: roundMetric(awayProfile.awayWinRate),
    homeGoalsFor: roundMetric(homeProfile.homeGoalsFor),
    awayGoalsFor: roundMetric(awayProfile.awayGoalsFor),
    homeGoalsAgainst: roundMetric(homeProfile.homeGoalsAgainst),
    awayGoalsAgainst: roundMetric(awayProfile.awayGoalsAgainst),
    homeCleanSheetRate: roundMetric(homeProfile.homeCleanSheetRate),
    awayCleanSheetRate: roundMetric(awayProfile.awayCleanSheetRate),
  };
}

export function createMockHomeAwayProvider(): HomeAwayProvider {
  return {
    getHomeAwayStrength(request: HomeAwayProviderRequest): HomeAwaySnapshot {
      return buildSnapshot(
        resolveHomeProfile(request.homeTeam),
        resolveAwayProfile(request.awayTeam)
      );
    },
  };
}

/** Preset snapshots for unit tests. */
export const MOCK_HOME_AWAY_FIXTURES = {
  strongHomeVsWeakAway: buildSnapshot(MOCK_HOME_PROFILE, MOCK_AWAY_PROFILE),
  averageMatchup: buildSnapshot(MOCK_AVERAGE_PROFILE, MOCK_AVERAGE_PROFILE),
} as const;
