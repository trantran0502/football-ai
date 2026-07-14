/**
 * PR7: BTTS / Over-Under scoring pattern provider — mock-only in this PR.
 * No API-Football, Google Search, or Supabase integration.
 */

export interface TeamScoringPatternMetrics {
  over15Rate: number | null;
  over25Rate: number | null;
  over35Rate: number | null;
  bttsRate: number | null;
  cleanSheetRate: number | null;
  failedToScoreRate: number | null;
  averageTotalGoals: number | null;
  firstHalfOver05Rate: number | null;
  firstHalfOver15Rate: number | null;
  sampleSize: number;
}

export interface ScoringPatternSnapshot {
  home: TeamScoringPatternMetrics;
  away: TeamScoringPatternMetrics;
}

export interface ScoringPatternProviderRequest {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
}

export interface ScoringPatternProvider {
  getScoringPattern(request: ScoringPatternProviderRequest): ScoringPatternSnapshot;
}

function roundRate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export const EMPTY_SCORING_PATTERN_METRICS: TeamScoringPatternMetrics = {
  over15Rate: null,
  over25Rate: null,
  over35Rate: null,
  bttsRate: null,
  cleanSheetRate: null,
  failedToScoreRate: null,
  averageTotalGoals: null,
  firstHalfOver05Rate: null,
  firstHalfOver15Rate: null,
  sampleSize: 0,
};

function buildMetrics(input: {
  sampleSize: number;
  over15Rate?: number | null;
  over25Rate?: number | null;
  over35Rate?: number | null;
  bttsRate?: number | null;
  cleanSheetRate?: number | null;
  failedToScoreRate?: number | null;
  averageTotalGoals?: number | null;
  firstHalfOver05Rate?: number | null;
  firstHalfOver15Rate?: number | null;
}): TeamScoringPatternMetrics {
  return {
    sampleSize: input.sampleSize,
    over15Rate: input.over15Rate ?? null,
    over25Rate: input.over25Rate ?? null,
    over35Rate: input.over35Rate ?? null,
    bttsRate: input.bttsRate ?? null,
    cleanSheetRate: input.cleanSheetRate ?? null,
    failedToScoreRate: input.failedToScoreRate ?? null,
    averageTotalGoals: input.averageTotalGoals ?? null,
    firstHalfOver05Rate: input.firstHalfOver05Rate ?? null,
    firstHalfOver15Rate: input.firstHalfOver15Rate ?? null,
  };
}

const HIGH_SCORING_BTTS = buildMetrics({
  sampleSize: 12,
  over15Rate: 0.92,
  over25Rate: 0.78,
  over35Rate: 0.52,
  bttsRate: 0.72,
  cleanSheetRate: 0.12,
  failedToScoreRate: 0.08,
  averageTotalGoals: 3.15,
  firstHalfOver05Rate: 0.82,
  firstHalfOver15Rate: 0.48,
});

const LOW_SCORING_BTTS_NO = buildMetrics({
  sampleSize: 12,
  over15Rate: 0.58,
  over25Rate: 0.28,
  over35Rate: 0.1,
  bttsRate: 0.32,
  cleanSheetRate: 0.48,
  failedToScoreRate: 0.42,
  averageTotalGoals: 1.85,
  firstHalfOver05Rate: 0.45,
  firstHalfOver15Rate: 0.15,
});

const BALANCED = buildMetrics({
  sampleSize: 10,
  over15Rate: 0.75,
  over25Rate: 0.5,
  over35Rate: 0.25,
  bttsRate: 0.5,
  cleanSheetRate: 0.25,
  failedToScoreRate: 0.25,
  averageTotalGoals: 2.5,
  firstHalfOver05Rate: 0.6,
  firstHalfOver15Rate: 0.3,
});

const SMALL_SAMPLE = buildMetrics({
  sampleSize: 3,
  over15Rate: 0.67,
  over25Rate: 0.67,
  over35Rate: 0.33,
  bttsRate: 0.67,
  cleanSheetRate: 0.17,
  failedToScoreRate: 0.17,
  averageTotalGoals: 2.9,
  firstHalfOver05Rate: 0.67,
  firstHalfOver15Rate: 0.33,
});

const CONFLICT_HOME = buildMetrics({
  sampleSize: 11,
  over15Rate: 0.8,
  over25Rate: 0.62,
  over35Rate: 0.35,
  bttsRate: 0.68,
  cleanSheetRate: 0.55,
  failedToScoreRate: 0.15,
  averageTotalGoals: 2.7,
  firstHalfOver05Rate: 0.7,
  firstHalfOver15Rate: 0.35,
});

const HIGH_FAIL_TO_SCORE = buildMetrics({
  sampleSize: 10,
  over15Rate: 0.55,
  over25Rate: 0.35,
  over35Rate: 0.15,
  bttsRate: 0.28,
  cleanSheetRate: 0.35,
  failedToScoreRate: 0.55,
  averageTotalGoals: 2.0,
  firstHalfOver05Rate: 0.4,
  firstHalfOver15Rate: 0.18,
});

const PARTIAL_HOME = buildMetrics({
  sampleSize: 10,
  over15Rate: 0.8,
  over25Rate: 0.6,
  over35Rate: null,
  bttsRate: 0.65,
  cleanSheetRate: 0.2,
  failedToScoreRate: null,
  averageTotalGoals: 2.8,
  firstHalfOver05Rate: 0.72,
  firstHalfOver15Rate: null,
});

function resolveHomeMetrics(teamName: string): TeamScoringPatternMetrics {
  const normalized = teamName.trim().toLowerCase();

  if (normalized === "empty home") {
    return { ...EMPTY_SCORING_PATTERN_METRICS };
  }
  if (normalized.includes("partial") || normalized === "mock partial home") {
    return { ...PARTIAL_HOME };
  }
  if (normalized.includes("conflict") || normalized === "mock conflict home") {
    return { ...CONFLICT_HOME };
  }
  if (normalized.includes("small-sample") || normalized === "mock small home") {
    return { ...SMALL_SAMPLE };
  }
  if (
    normalized.includes("high-scoring") ||
    normalized === "mockhome fc" ||
    normalized.includes("大球")
  ) {
    return { ...HIGH_SCORING_BTTS };
  }
  if (
    normalized.includes("low-scoring") ||
    normalized.includes("小球") ||
    normalized.includes("保級")
  ) {
    return { ...LOW_SCORING_BTTS_NO };
  }
  if (normalized.includes("balanced") || normalized.includes("even")) {
    return { ...BALANCED };
  }

  return { ...BALANCED };
}

function resolveAwayMetrics(teamName: string): TeamScoringPatternMetrics {
  const normalized = teamName.trim().toLowerCase();

  if (normalized === "empty away") {
    return { ...EMPTY_SCORING_PATTERN_METRICS };
  }
  if (normalized.includes("fail-score") || normalized === "mock fail score away") {
    return { ...HIGH_FAIL_TO_SCORE };
  }
  if (normalized.includes("partial")) {
    return {
      ...PARTIAL_HOME,
      sampleSize: 10,
      over35Rate: 0.3,
      failedToScoreRate: 0.22,
      firstHalfOver15Rate: 0.25,
    };
  }
  if (normalized.includes("small-sample") || normalized === "mock small away") {
    return { ...SMALL_SAMPLE };
  }
  if (
    normalized.includes("high-scoring") ||
    normalized.includes("大球")
  ) {
    return { ...HIGH_SCORING_BTTS };
  }
  if (
    normalized.includes("low-scoring") ||
    normalized === "mockaway fc" ||
    normalized.includes("小球")
  ) {
    return { ...LOW_SCORING_BTTS_NO };
  }
  if (normalized.includes("balanced") || normalized.includes("even")) {
    return { ...BALANCED };
  }

  return { ...BALANCED };
}

export function createMockScoringPatternProvider(): ScoringPatternProvider {
  return {
    getScoringPattern(request: ScoringPatternProviderRequest): ScoringPatternSnapshot {
      return {
        home: resolveHomeMetrics(request.homeTeam),
        away: resolveAwayMetrics(request.awayTeam),
      };
    },
  };
}

export const MOCK_SCORING_PATTERN_FIXTURES = {
  highScoringBttsYes: {
    home: HIGH_SCORING_BTTS,
    away: HIGH_SCORING_BTTS,
  },
  lowScoringBttsNo: {
    home: LOW_SCORING_BTTS_NO,
    away: LOW_SCORING_BTTS_NO,
  },
  balanced: {
    home: BALANCED,
    away: BALANCED,
  },
  cleanSheetConflict: {
    home: CONFLICT_HOME,
    away: HIGH_SCORING_BTTS,
  },
  highFailToScore: {
    home: BALANCED,
    away: HIGH_FAIL_TO_SCORE,
  },
  smallSample: {
    home: SMALL_SAMPLE,
    away: SMALL_SAMPLE,
  },
  empty: {
    home: { ...EMPTY_SCORING_PATTERN_METRICS },
    away: { ...EMPTY_SCORING_PATTERN_METRICS },
  },
} as const;

export function buildPartialScoringPatternSnapshot(partial: {
  home?: Partial<TeamScoringPatternMetrics>;
  away?: Partial<TeamScoringPatternMetrics>;
}): ScoringPatternSnapshot {
  return {
    home: { ...EMPTY_SCORING_PATTERN_METRICS, ...partial.home },
    away: { ...EMPTY_SCORING_PATTERN_METRICS, ...partial.away },
  };
}
