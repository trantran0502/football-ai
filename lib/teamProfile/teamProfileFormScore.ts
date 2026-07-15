import { FORM_SCORE_DECAY } from "@/lib/teamProfile/teamProfileTypes";

export interface MatchOutcomePoints {
  points: number;
  date: string;
}

export function clampRate(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function roundMetric(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Weighted form score from match outcomes.
 * Win = 3, Draw = 1, Loss = 0 with exponential time decay on recent matches.
 */
export function calculateFormScore(outcomes: MatchOutcomePoints[]): number | null {
  if (outcomes.length === 0) {
    return null;
  }

  let weightedPoints = 0;
  let totalWeight = 0;

  for (let index = 0; index < outcomes.length; index += 1) {
    const weight = FORM_SCORE_DECAY ** index;
    weightedPoints += outcomes[index].points * weight;
    totalWeight += weight * 3;
  }

  if (totalWeight <= 0) {
    return null;
  }

  return clampScore(roundMetric((weightedPoints / totalWeight) * 100, 2));
}

/**
 * Momentum compares the most recent 5 matches against the previous 5.
 * 50 = flat, >50 = improving, <50 = declining.
 */
export function calculateMomentumScore(outcomes: MatchOutcomePoints[]): number | null {
  if (outcomes.length < 6) {
    return null;
  }

  const recent5 = outcomes.slice(0, 5);
  const prior5 = outcomes.slice(5, 10);
  if (prior5.length === 0) {
    return null;
  }

  const recentPpg =
    recent5.reduce((sum, item) => sum + item.points, 0) / recent5.length;
  const priorPpg =
    prior5.reduce((sum, item) => sum + item.points, 0) / prior5.length;
  const delta = recentPpg - priorPpg;

  return clampScore(roundMetric(50 + (delta / 3) * 50, 2));
}

export function outcomePointsForTeam(
  match: {
    homeTeamId: number;
    awayTeamId: number;
    homeGoals: number;
    awayGoals: number;
  },
  teamId: number
): number {
  const isHome = match.homeTeamId === teamId;
  const scored = isHome ? match.homeGoals : match.awayGoals;
  const conceded = isHome ? match.awayGoals : match.homeGoals;

  if (scored > conceded) {
    return 3;
  }
  if (scored < conceded) {
    return 0;
  }
  return 1;
}
