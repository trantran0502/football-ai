import {
  adaptDecisionRecommendation,
  adaptLegacyRecommendation,
  rankComparableConfidence,
} from "@/lib/recommendation/v3/recommendationDecisionAdapter";
import type {
  RecommendationComparison,
  RecommendationComparisonAgreement,
  RecommendationComparisonObservability,
  RecommendationComparisonReplaySnapshot,
} from "@/lib/recommendation/v3/recommendationComparisonTypes";
import { RECOMMENDATION_COMPARISON_REPLAY_SCHEMA } from "@/lib/recommendation/v3/recommendationComparisonTypes";
import type { DecisionOutcome } from "@/lib/decision/v3/decisionTypes";
import type { RecommendationEngineResult } from "@/lib/recommendation/recommendationTypes";

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeReasonToken(value: string): string {
  return value.trim().toLowerCase();
}

function countReasonOverlap(left: string[], right: string[]): number {
  const rightTokens = right.map(normalizeReasonToken);
  let overlap = 0;

  for (const reason of left) {
    const token = normalizeReasonToken(reason);
    if (
      rightTokens.some(
        (candidate) =>
          candidate.includes(token.slice(0, 24)) || token.includes(candidate.slice(0, 24))
      )
    ) {
      overlap += 1;
    }
  }

  return overlap;
}

function countReasonConflict(
  legacyReasons: string[],
  legacyObjections: string[],
  decisionReasons: string[],
  decisionObjections: string[]
): number {
  const legacySupport = legacyReasons.map(normalizeReasonToken);
  const decisionSupport = decisionReasons.map(normalizeReasonToken);
  const legacyOppose = legacyObjections.map(normalizeReasonToken);
  const decisionOppose = decisionObjections.map(normalizeReasonToken);

  let conflicts = 0;

  for (const reason of legacySupport) {
    if (decisionOppose.some((item) => item.includes(reason.slice(0, 24)))) {
      conflicts += 1;
    }
  }

  for (const reason of decisionSupport) {
    if (legacyOppose.some((item) => item.includes(reason.slice(0, 24)))) {
      conflicts += 1;
    }
  }

  return conflicts;
}

function buildAgreement(
  legacy: ReturnType<typeof adaptLegacyRecommendation>,
  decision: ReturnType<typeof adaptDecisionRecommendation>
): RecommendationComparisonAgreement {
  const weightedScoreDiff = round(decision.weightedScore - legacy.weightedScore);
  const directionAgreement =
    legacy.direction === decision.direction ||
    (legacy.globalPass && decision.globalPass);
  const marketAgreement =
    legacy.marketType === decision.marketType ||
    (legacy.marketType === null && decision.marketType === null);
  const confidenceAgreement =
    rankComparableConfidence(legacy.confidenceLevel) ===
    rankComparableConfidence(decision.confidenceLevel);
  const candidateChanged =
    legacy.side !== decision.side || legacy.marketType !== decision.marketType;
  const topReasonOverlap = countReasonOverlap(
    legacy.topReasons,
    decision.topReasons
  );
  const topReasonConflict = countReasonConflict(
    legacy.topReasons,
    legacy.topObjections,
    decision.topReasons,
    decision.topObjections
  );

  const agreement =
    directionAgreement &&
    marketAgreement &&
    confidenceAgreement &&
    !candidateChanged;

  return {
    agreement,
    directionAgreement,
    marketAgreement,
    confidenceAgreement,
    weightedScoreDiff,
    topReasonOverlap,
    topReasonConflict,
    candidateChanged,
  };
}

export function buildRecommendationComparison(input: {
  legacyRecommendation: RecommendationEngineResult | null;
  decisionOutcome: DecisionOutcome;
}): RecommendationComparison {
  const legacyRecommendation = adaptLegacyRecommendation(input.legacyRecommendation);
  const decisionRecommendation = adaptDecisionRecommendation(input.decisionOutcome);
  const agreement = buildAgreement(legacyRecommendation, decisionRecommendation);

  return {
    legacyRecommendation,
    decisionRecommendation,
    agreement,
    weightedScoreDiff: agreement.weightedScoreDiff,
    confidenceDiff:
      rankComparableConfidence(decisionRecommendation.confidenceLevel) -
      rankComparableConfidence(legacyRecommendation.confidenceLevel),
    candidateDiff: agreement.candidateChanged,
    reasonOverlap: agreement.topReasonOverlap,
    reasonConflict: agreement.topReasonConflict,
  };
}

export function buildRecommendationComparisonObservability(
  comparison: RecommendationComparison
): RecommendationComparisonObservability {
  return {
    agreement: comparison.agreement.agreement,
    directionAgreement: comparison.agreement.directionAgreement,
    confidenceAgreement: comparison.agreement.confidenceAgreement,
    weightedScoreDiff: comparison.weightedScoreDiff,
    candidateChanged: comparison.candidateDiff,
  };
}

export function buildRecommendationComparisonReplaySnapshot(input: {
  runId: string;
  fixtureKey: string;
  collectedAt: string;
  comparison: RecommendationComparison;
}): RecommendationComparisonReplaySnapshot {
  return {
    schemaVersion: RECOMMENDATION_COMPARISON_REPLAY_SCHEMA,
    collectedAt: input.collectedAt,
    fixtureKey: input.fixtureKey,
    runId: input.runId,
    comparison: input.comparison,
  };
}
