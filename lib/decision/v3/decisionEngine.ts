import {
  DEFAULT_DECISION_V3_CONFIG,
  SUPPORTED_DECISION_V3_EVIDENCE_IDS,
} from "@/lib/decision/v3/decisionConfig";
import type {
  AggregateDecisionInput,
  DecisionBreakdown,
  DecisionCandidate,
  DecisionOutcome,
  DecisionReason,
  DecisionV3Confidence,
  DecisionV3Level,
  DecisionV3Observability,
} from "@/lib/decision/v3/decisionTypes";
import type { EvidenceResult } from "@/lib/evidence/v3/evidenceTypes";
import type { MarketSelection, MarketSide } from "@/types/match";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildEmptyOutcome(
  catalogVersion: string,
  weightMeta: {
    decisionWeightVersion?: number | null;
    decisionWeightSource?: import("@/lib/decision/v3/decisionTypes").DecisionWeightSource;
  } = {}
): DecisionOutcome {
  return {
    decision: "pass",
    confidence: "low",
    weightedScore: 0,
    candidate: null,
    reasons: [],
    objections: [],
    breakdown: [],
    catalogVersion,
    decisionWeightVersion: weightMeta.decisionWeightVersion ?? null,
    decisionWeightSource: weightMeta.decisionWeightSource ?? "fallback",
  };
}

function resolveDecisionLevel(
  weightedScore: number,
  evidenceCount: number
): DecisionV3Level {
  if (evidenceCount === 0) {
    return "pass";
  }

  const magnitude = Math.abs(weightedScore);
  if (magnitude < 0.15) {
    return "pass";
  }
  if (magnitude < 0.35) {
    return "lean";
  }
  if (magnitude < 0.6) {
    return "bet";
  }
  return "strong_bet";
}

function resolveConfidenceLevel(breakdown: DecisionBreakdown[]): DecisionV3Confidence {
  if (breakdown.length === 0) {
    return "low";
  }

  const average =
    breakdown.reduce((sum, item) => sum + item.confidence, 0) / breakdown.length;
  if (average < 0.45) {
    return "low";
  }
  if (average < 0.7) {
    return "medium";
  }
  return "high";
}

function getMoneylineSelections(
  marketSelections: MarketSelection[]
): MarketSelection[] {
  const fullTime = marketSelections.filter(
    (selection) =>
      selection.marketType === "moneyline" && selection.period === "full"
  );
  if (fullTime.length > 0) {
    return fullTime;
  }
  return marketSelections.filter((selection) => selection.marketType === "moneyline");
}

function resolveCandidateSide(
  weightedScore: number,
  evidence: EvidenceResult[]
): MarketSide | null {
  if (Math.abs(weightedScore) < 0.05) {
    return null;
  }

  let directionScore = weightedScore;
  for (const item of evidence) {
    const direction = item.metadata.direction;
    if (direction === "home") {
      directionScore += item.score * item.confidence * 0.01;
    } else if (direction === "away") {
      directionScore -= item.score * item.confidence * 0.01;
    }
  }

  if (directionScore > 0.05) {
    return "home";
  }
  if (directionScore < -0.05) {
    return "away";
  }
  return "draw";
}

function resolveCandidate(
  weightedScore: number,
  evidence: EvidenceResult[],
  marketSelections: MarketSelection[]
): DecisionCandidate | null {
  const side = resolveCandidateSide(weightedScore, evidence);
  if (!side) {
    return null;
  }

  const moneyline = getMoneylineSelections(marketSelections);
  const selection = moneyline.find((item) => item.side === side);
  if (!selection) {
    return null;
  }

  return {
    marketType: selection.marketType,
    side: selection.side,
    label: `${selection.side} moneyline`,
  };
}

function buildReasons(evidence: EvidenceResult[]): {
  reasons: DecisionReason[];
  objections: DecisionReason[];
} {
  const reasons: DecisionReason[] = [];
  const objections: DecisionReason[] = [];

  for (const item of evidence) {
    if (item.score > 0.05) {
      reasons.push({
        evidenceId: item.id,
        polarity: "support",
        summary: item.reason,
      });
    } else if (item.score < -0.05) {
      objections.push({
        evidenceId: item.id,
        polarity: "objection",
        summary: item.reason,
      });
    }
  }

  return { reasons, objections };
}

export function aggregateDecision(input: AggregateDecisionInput): DecisionOutcome {
  const config = input.config ?? DEFAULT_DECISION_V3_CONFIG;
  const weightMeta = {
    decisionWeightVersion: input.decisionWeightVersion ?? null,
    decisionWeightSource: input.decisionWeightSource ?? "fallback",
  };
  const supportedIds = new Set<string>(SUPPORTED_DECISION_V3_EVIDENCE_IDS);
  const supported = input.evidence.evidence.filter((item) => supportedIds.has(item.id));

  if (supported.length === 0) {
    return buildEmptyOutcome(input.evidence.catalogVersion, weightMeta);
  }

  const breakdown: DecisionBreakdown[] = [];
  let weightedScore = 0;

  for (const item of supported) {
    const weight = config.weights[item.id] ?? 1;
    const contribution = item.score * item.confidence * weight;
    weightedScore += contribution;
    breakdown.push({
      evidenceId: item.id,
      score: item.score,
      confidence: item.confidence,
      weight,
      contribution: round(contribution),
    });
  }

  weightedScore = round(clamp(weightedScore, -1, 1));
  const { reasons, objections } = buildReasons(supported);

  return {
    decision: resolveDecisionLevel(weightedScore, supported.length),
    confidence: resolveConfidenceLevel(breakdown),
    weightedScore,
    candidate: resolveCandidate(weightedScore, supported, input.marketSelections),
    reasons,
    objections,
    breakdown,
    catalogVersion: input.evidence.catalogVersion,
    decisionWeightVersion: weightMeta.decisionWeightVersion,
    decisionWeightSource: weightMeta.decisionWeightSource,
  };
}

export function buildDecisionV3Observability(
  outcome: DecisionOutcome
): DecisionV3Observability {
  return {
    decision: outcome.decision,
    confidence: outcome.confidence,
    weightedScore: outcome.weightedScore,
    candidate: outcome.candidate,
    reasonCount: outcome.reasons.length,
    objectionCount: outcome.objections.length,
    decisionWeightVersion: outcome.decisionWeightVersion,
    decisionWeightSource: outcome.decisionWeightSource,
  };
}
