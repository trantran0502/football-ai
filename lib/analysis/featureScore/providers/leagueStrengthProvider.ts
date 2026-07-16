/**
 * PR4: League Strength data provider — mock-only in this PR.
 * No API-Football, Google Search, or Supabase integration.
 */

export interface LeagueStrengthSnapshot {
  leagueName: string;
  /** Global league ranking; 1 = strongest. */
  leagueRanking: number | null;
  /** Domestic tier; 1 = top flight. */
  leagueTier: number | null;
  /** Normalized attack index in [0, 1]. */
  attackStrength: number | null;
  /** Normalized defense index in [0, 1]. */
  defenseStrength: number | null;
  averageGoals: number | null;
  averageGoalsConceded: number | null;
  sampleSize: number;
  dataFreshnessDays: number | null;
}

export interface LeagueStrengthProviderRequest {
  leagueName: string;
  matchDate?: string;
}

export interface LeagueStrengthProvider {
  getLeagueStrength(request: LeagueStrengthProviderRequest): LeagueStrengthSnapshot;
}

interface MockLeagueProfile {
  leagueRanking: number;
  leagueTier: number;
  attackStrength: number;
  defenseStrength: number;
  averageGoals: number;
  averageGoalsConceded: number;
}

const MOCK_LEAGUE_PROFILES = {
  elite: {
    leagueRanking: 3,
    leagueTier: 1,
    attackStrength: 0.88,
    defenseStrength: 0.86,
    averageGoals: 2.85,
    averageGoalsConceded: 2.85,
  },
  strong: {
    leagueRanking: 12,
    leagueTier: 2,
    attackStrength: 0.72,
    defenseStrength: 0.7,
    averageGoals: 2.55,
    averageGoalsConceded: 2.55,
  },
  average: {
    leagueRanking: 35,
    leagueTier: 3,
    attackStrength: 0.55,
    defenseStrength: 0.52,
    averageGoals: 2.35,
    averageGoalsConceded: 2.35,
  },
  weak: {
    leagueRanking: 78,
    leagueTier: 4,
    attackStrength: 0.38,
    defenseStrength: 0.35,
    averageGoals: 2.1,
    averageGoalsConceded: 2.1,
  },
} as const satisfies Record<string, MockLeagueProfile>;

const LEAGUE_ALIASES: Record<string, keyof typeof MOCK_LEAGUE_PROFILES> = {
  "英超": "elite",
  "premier league": "elite",
  "english premier league": "elite",
  "西甲": "elite",
  "la liga": "elite",
  "德甲": "strong",
  "bundesliga": "strong",
  "意甲": "strong",
  "serie a": "strong",
  "法甲": "strong",
  "ligue 1": "strong",
  "荷甲": "average",
  "eredivisie": "average",
  "玻利維亞甲組": "weak",
  "bolivia primera": "weak",
  "mock elite league": "elite",
  "mock weak league": "weak",
};

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function resolveMockProfile(leagueName: string): MockLeagueProfile {
  const normalized = leagueName.trim().toLowerCase();
  const alias = LEAGUE_ALIASES[normalized];
  if (alias) {
    return MOCK_LEAGUE_PROFILES[alias];
  }

  if (normalized.includes("elite") || normalized.includes("top")) {
    return MOCK_LEAGUE_PROFILES.elite;
  }
  if (normalized.includes("weak") || normalized.includes("lower")) {
    return MOCK_LEAGUE_PROFILES.weak;
  }

  return MOCK_LEAGUE_PROFILES.average;
}

function buildSnapshot(
  leagueName: string,
  profile: MockLeagueProfile
): LeagueStrengthSnapshot {
  return {
    leagueName,
    leagueRanking: profile.leagueRanking,
    leagueTier: profile.leagueTier,
    attackStrength: roundMetric(profile.attackStrength),
    defenseStrength: roundMetric(profile.defenseStrength),
    averageGoals: roundMetric(profile.averageGoals),
    averageGoalsConceded: roundMetric(profile.averageGoalsConceded),
    sampleSize: 30,
    dataFreshnessDays: 7,
  };
}

export function createMockLeagueStrengthProvider(): LeagueStrengthProvider {
  return {
    getLeagueStrength(request: LeagueStrengthProviderRequest): LeagueStrengthSnapshot {
      return buildSnapshot(request.leagueName, resolveMockProfile(request.leagueName));
    },
  };
}

/** Preset snapshots for unit tests. */
export const MOCK_LEAGUE_STRENGTH_FIXTURES = {
  elite: buildSnapshot("Mock Elite League", MOCK_LEAGUE_PROFILES.elite),
  weak: buildSnapshot("Mock Weak League", MOCK_LEAGUE_PROFILES.weak),
  average: buildSnapshot("Average League", MOCK_LEAGUE_PROFILES.average),
} as const;
