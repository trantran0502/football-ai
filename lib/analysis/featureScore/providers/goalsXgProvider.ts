/**
 * PR6: Goals / xG data provider — mock-only in this PR.
 * No API-Football, Google Search, or Supabase integration.
 */

export interface TeamGoalsXgMetrics {
  averageGoalsFor: number | null;
  averageGoalsAgainst: number | null;
  xG: number | null;
  xGA: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  conversionRate: number | null;
  shotAccuracy: number | null;
}

export interface GoalsXgSnapshot {
  home: TeamGoalsXgMetrics;
  away: TeamGoalsXgMetrics;
}

export interface GoalsXgProviderRequest {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
}

export interface GoalsXgProvider {
  getGoalsXgMetrics(request: GoalsXgProviderRequest): GoalsXgSnapshot;
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export const EMPTY_GOALS_XG_METRICS: TeamGoalsXgMetrics = {
  averageGoalsFor: null,
  averageGoalsAgainst: null,
  xG: null,
  xGA: null,
  shots: null,
  shotsOnTarget: null,
  conversionRate: null,
  shotAccuracy: null,
};

function buildMetrics(input: {
  averageGoalsFor: number;
  averageGoalsAgainst: number;
  xG?: number | null;
  xGA?: number | null;
  shots?: number | null;
  shotsOnTarget?: number | null;
  conversionRate?: number | null;
  shotAccuracy?: number | null;
}): TeamGoalsXgMetrics {
  return {
    averageGoalsFor: roundMetric(input.averageGoalsFor),
    averageGoalsAgainst: roundMetric(input.averageGoalsAgainst),
    xG: input.xG ?? null,
    xGA: input.xGA ?? null,
    shots: input.shots ?? null,
    shotsOnTarget: input.shotsOnTarget ?? null,
    conversionRate: input.conversionRate ?? null,
    shotAccuracy: input.shotAccuracy ?? null,
  };
}

const STRONG_ATTACK = buildMetrics({
  averageGoalsFor: 2.4,
  averageGoalsAgainst: 0.9,
  xG: 2.1,
  xGA: 0.95,
  shots: 15.2,
  shotsOnTarget: 6.4,
  conversionRate: 0.16,
  shotAccuracy: 0.42,
});

const WEAK_ATTACK = buildMetrics({
  averageGoalsFor: 0.9,
  averageGoalsAgainst: 2.0,
  xG: 0.85,
  xGA: 1.95,
  shots: 8.5,
  shotsOnTarget: 2.6,
  conversionRate: 0.11,
  shotAccuracy: 0.31,
});

const BALANCED = buildMetrics({
  averageGoalsFor: 1.5,
  averageGoalsAgainst: 1.5,
  xG: 1.45,
  xGA: 1.48,
  shots: 11.0,
  shotsOnTarget: 4.0,
  conversionRate: 0.14,
  shotAccuracy: 0.36,
});

const STRONG_NO_XG = buildMetrics({
  averageGoalsFor: 2.4,
  averageGoalsAgainst: 0.9,
  xG: null,
  xGA: null,
  shots: 15.2,
  shotsOnTarget: 6.4,
  conversionRate: 0.16,
  shotAccuracy: 0.42,
});

const STRONG_NO_SHOTS = buildMetrics({
  averageGoalsFor: 2.4,
  averageGoalsAgainst: 0.9,
  xG: 2.1,
  xGA: 0.95,
  shots: null,
  shotsOnTarget: null,
  conversionRate: null,
  shotAccuracy: null,
});

function resolveHomeMetrics(teamName: string): TeamGoalsXgMetrics {
  const normalized = teamName.trim().toLowerCase();

  if (normalized === "empty home" || normalized === "empty fc home") {
    return { ...EMPTY_GOALS_XG_METRICS };
  }
  if (normalized.includes("no-xg") || normalized === "mock no xg home") {
    return { ...STRONG_NO_XG };
  }
  if (normalized.includes("no-shots") || normalized === "mock no shots home") {
    return { ...STRONG_NO_SHOTS };
  }
  if (
    normalized.includes("strong") ||
    normalized === "mockhome fc" ||
    normalized.includes("法國")
  ) {
    return { ...STRONG_ATTACK };
  }
  if (normalized.includes("weak") || normalized.includes("保級")) {
    return { ...WEAK_ATTACK };
  }
  if (normalized.includes("balanced") || normalized.includes("even")) {
    return { ...BALANCED };
  }

  return { ...BALANCED };
}

function resolveAwayMetrics(teamName: string): TeamGoalsXgMetrics {
  const normalized = teamName.trim().toLowerCase();

  if (normalized === "empty away" || normalized === "empty fc away") {
    return { ...EMPTY_GOALS_XG_METRICS };
  }
  if (normalized.includes("no-xg") || normalized === "mock no xg away") {
    return {
      ...WEAK_ATTACK,
      xG: null,
      xGA: null,
    };
  }
  if (normalized.includes("no-shots") || normalized === "mock no shots away") {
    return {
      ...WEAK_ATTACK,
      shots: null,
      shotsOnTarget: null,
      conversionRate: null,
      shotAccuracy: null,
    };
  }
  if (
    normalized.includes("weak") ||
    normalized === "mockaway fc" ||
    normalized.includes("保級")
  ) {
    return { ...WEAK_ATTACK };
  }
  if (normalized.includes("strong") || normalized.includes("法國")) {
    return { ...STRONG_ATTACK };
  }
  if (normalized.includes("balanced") || normalized.includes("even")) {
    return { ...BALANCED };
  }

  return { ...BALANCED };
}

export function createMockGoalsXgProvider(): GoalsXgProvider {
  return {
    getGoalsXgMetrics(request: GoalsXgProviderRequest): GoalsXgSnapshot {
      return {
        home: resolveHomeMetrics(request.homeTeam),
        away: resolveAwayMetrics(request.awayTeam),
      };
    },
  };
}

/** Preset snapshots for unit tests. */
export const MOCK_GOALS_XG_FIXTURES = {
  strongHomeVsWeakAway: {
    home: STRONG_ATTACK,
    away: WEAK_ATTACK,
  },
  balanced: {
    home: BALANCED,
    away: BALANCED,
  },
  empty: {
    home: { ...EMPTY_GOALS_XG_METRICS },
    away: { ...EMPTY_GOALS_XG_METRICS },
  },
  strongHomeNoXg: {
    home: STRONG_NO_XG,
    away: WEAK_ATTACK,
  },
  strongHomeNoShots: {
    home: STRONG_NO_SHOTS,
    away: WEAK_ATTACK,
  },
} as const;

/** Build a partial snapshot for tests — never coerces missing fields to 0. */
export function buildPartialGoalsXgSnapshot(
  partial: {
    home?: Partial<TeamGoalsXgMetrics>;
    away?: Partial<TeamGoalsXgMetrics>;
  }
): GoalsXgSnapshot {
  return {
    home: { ...EMPTY_GOALS_XG_METRICS, ...partial.home },
    away: { ...EMPTY_GOALS_XG_METRICS, ...partial.away },
  };
}
