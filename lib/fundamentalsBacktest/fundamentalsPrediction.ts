import type { MatchResult, MatchWinner } from "@/lib/database/matchSchema";
import type { EvidenceReport } from "@/lib/evidence/evidenceTypes";
import type {
  FundamentalsPrediction,
  PreMatchSnapshot,
} from "@/lib/fundamentalsBacktest/fundamentalsBacktestTypes";
import { FUNDAMENTALS_OVER_UNDER_LINE_DEFAULT } from "@/lib/fundamentalsBacktest/fundamentalsBacktestTypes";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildFundamentalsPrediction(input: {
  snapshot: PreMatchSnapshot;
  evidence: EvidenceReport;
  overUnderLine?: number;
}): FundamentalsPrediction {
  const line = input.overUnderLine ?? FUNDAMENTALS_OVER_UNDER_LINE_DEFAULT;
  const homeAttack = input.snapshot.averageGoalsForBeforeMatch.home;
  const awayAttack = input.snapshot.averageGoalsForBeforeMatch.away;
  const homeDefense = input.snapshot.averageGoalsAgainstBeforeMatch.home;
  const awayDefense = input.snapshot.averageGoalsAgainstBeforeMatch.away;
  const evidenceEdge = input.evidence.overallEvidenceScore / 100;
  const homeEdge =
    homeAttack - awayDefense + evidenceEdge * 0.8 + (input.snapshot.h2hBeforeMatch?.homeWins ?? 0) * 0.05;
  const awayEdge =
    awayAttack - homeDefense - evidenceEdge * 0.8 + (input.snapshot.h2hBeforeMatch?.awayWins ?? 0) * 0.05;

  let predictedWinner: MatchWinner = "draw";
  if (homeEdge > awayEdge + 0.15) {
    predictedWinner = "home";
  } else if (awayEdge > homeEdge + 0.15) {
    predictedWinner = "away";
  }

  const expectedTotalGoals =
    (homeAttack + awayAttack + homeDefense + awayDefense) / 2 +
    (input.snapshot.overUnderRateBeforeMatch.home + input.snapshot.overUnderRateBeforeMatch.away) *
      line *
      0.15;

  const homeScoringProbability = clamp(
    0.35 + homeAttack * 0.18 - awayDefense * 0.08 + evidenceEdge * 0.15,
    0.05,
    0.95
  );
  const awayScoringProbability = clamp(
    0.35 + awayAttack * 0.18 - homeDefense * 0.08 - evidenceEdge * 0.15,
    0.05,
    0.95
  );

  const bttsProbability = clamp(
    (input.snapshot.bttsRateBeforeMatch.home + input.snapshot.bttsRateBeforeMatch.away) / 2 +
      homeScoringProbability * 0.15 +
      awayScoringProbability * 0.15,
    0.05,
    0.95
  );

  const cleanSheetHome =
    input.snapshot.cleanSheetRateBeforeMatch.home * 0.5 + (1 - awayScoringProbability) * 0.5;
  const cleanSheetAway =
    input.snapshot.cleanSheetRateBeforeMatch.away * 0.5 + (1 - homeScoringProbability) * 0.5;

  return {
    predictedWinner,
    homeWinDirection: predictedWinner === "home",
    drawDirection: predictedWinner === "draw",
    awayWinDirection: predictedWinner === "away",
    homeScoringProbability,
    awayScoringProbability,
    totalGoalsTrend:
      expectedTotalGoals > line + 0.1 ? "over" : expectedTotalGoals < line - 0.1 ? "under" : "neutral",
    overUnderClassification: expectedTotalGoals >= line ? "over" : "under",
    bttsClassification: bttsProbability >= 0.5 ? "yes" : "no",
    cleanSheetPrediction:
      cleanSheetHome > cleanSheetAway + 0.1
        ? "home"
        : cleanSheetAway > cleanSheetHome + 0.1
          ? "away"
          : "neither",
  };
}

export function evaluateDirectionAccuracy(
  prediction: FundamentalsPrediction,
  actual: MatchResult
): boolean {
  return prediction.predictedWinner === actual.winner;
}

export function evaluateBttsAccuracy(
  prediction: FundamentalsPrediction,
  actual: MatchResult
): boolean {
  const actualBtts = actual.bothTeamsScored;
  return (prediction.bttsClassification === "yes") === actualBtts;
}

export function evaluateOverUnderAccuracy(
  prediction: FundamentalsPrediction,
  actual: MatchResult,
  line = FUNDAMENTALS_OVER_UNDER_LINE_DEFAULT
): boolean {
  const actualOver = actual.totalGoals > line;
  return (prediction.overUnderClassification === "over") === actualOver;
}

export function evaluateCleanSheetAccuracy(
  prediction: FundamentalsPrediction,
  actual: MatchResult
): boolean {
  if (prediction.cleanSheetPrediction === "home") {
    return actual.fullTimeAwayGoals === 0;
  }
  if (prediction.cleanSheetPrediction === "away") {
    return actual.fullTimeHomeGoals === 0;
  }
  return actual.fullTimeHomeGoals > 0 && actual.fullTimeAwayGoals > 0;
}

export function evaluateEvidenceProviderAccuracy(
  evidence: EvidenceReport,
  actual: MatchResult
): Array<{ category: string; accurate: boolean; confidence: number }> {
  const homeWin = actual.winner === "home";
  const awayWin = actual.winner === "away";

  return [...evidence.positiveEvidence, ...evidence.negativeEvidence].map((item) => {
    const supportsHome = item.score > 0;
    const accurate =
      (supportsHome && homeWin) ||
      (!supportsHome && awayWin) ||
      (item.score === 0 && actual.winner === "draw");
    return {
      category: item.category,
      accurate,
      confidence: item.confidence,
    };
  });
}
