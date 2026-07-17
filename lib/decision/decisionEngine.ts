import type { FeatureFusionResult } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import {
  computeConfidence,
  computeDecisionScore,
  computePredictionScore,
  resolveDecisionLevel,
  resolveDecisionScoreTier,
} from "@/lib/decision/decisionScoring";
import type {
  BuildDecisionInput,
  DecisionExplanation,
  DecisionResult,
  ReplayDecisionSnapshot,
} from "@/lib/decision/decisionTypes";
import {
  scoreMarketCandidates,
  selectBestMarketCandidate,
} from "@/lib/decision/marketSelection";
import { assessRisk } from "@/lib/decision/riskAssessment";
import { assessValueForCandidate } from "@/lib/decision/valueAssessment";
import { buildEvidenceImpact } from "@/lib/evidence/evidenceIntegration";
import type { RecommendationCandidate } from "@/lib/recommendation/recommendationTypes";

function resolveEvidenceImpact(
  input: BuildDecisionInput,
  candidate: RecommendationCandidate | null
): { supporting: string[]; opposing: string[] } {
  const fromResult = input.recommendationResult?.evidenceSummary ?? [];
  if (fromResult.length > 0) {
    return {
      supporting: fromResult.filter((line) => line.startsWith("+")),
      opposing: fromResult.filter((line) => line.startsWith("-")),
    };
  }

  const direction =
    candidate?.selection.side === "away" ||
    candidate?.selection.side === "under" ||
    candidate?.selection.side === "no"
      ? -1
      : candidate?.selection.side === "draw"
        ? 0
        : 1;

  return buildEvidenceImpact(
    input.recommendationResult?.evidenceReport ?? null,
    direction
  );
}

const SUPPORTING_FEATURE_LABELS = [
  "Recent Form",
  "xG",
  "League Strength",
  "Home Advantage",
  "Value",
];

const OPPOSING_FEATURE_LABELS = [
  "Market Too Hot",
  "Low EV",
  "Rotation",
  "Weather",
  "Injury",
];

function buildExplanation(input: {
  reasons: string[];
  objections: string[];
  supportingFeatures: string[];
  opposingFeatures: string[];
  evidenceImpact: { supporting: string[]; opposing: string[] };
  decision: DecisionResult["decision"];
}): DecisionExplanation {
  const supporting = [
    ...input.evidenceImpact.supporting,
    ...input.supportingFeatures.map((item) => `+ ${item}`),
    ...input.reasons.filter((reason) => !reason.startsWith("-")).slice(0, 5),
  ];
  const opposing = [
    ...input.evidenceImpact.opposing,
    ...input.opposingFeatures.map((item) => `- ${item}`),
    ...input.objections.map((item) => `- ${item}`),
  ];

  return {
    supporting,
    opposing,
    summary: `Decision: ${input.decision}`,
  };
}

function collectSupportingFeatures(
  fusion: FeatureFusionResult | null,
  candidateSupporting: string[],
  valueReasons: string[]
): string[] {
  const items = new Set<string>(candidateSupporting);

  if (fusion) {
    for (const factor of fusion.strongestFactors.slice(0, 4)) {
      items.add(factor.reason || factor.id);
    }
  }

  for (const label of SUPPORTING_FEATURE_LABELS) {
    const matched = [...items].some((item) =>
      item.toLowerCase().includes(label.toLowerCase().split(" ")[0] ?? "")
    );
    if (matched) {
      items.add(label);
    }
  }

  if (valueReasons.some((reason) => reason.includes("EV"))) {
    items.add("Value");
  }

  return [...items].slice(0, 8);
}

function collectOpposingFeatures(
  riskObjections: string[],
  candidateWarnings: string[]
): string[] {
  const items = new Set<string>();

  for (const objection of riskObjections) {
    if (objection.includes("Hot") || objection.includes("過熱")) {
      items.add("Market Too Hot");
    }
    if (objection.includes("EV") || objection.toLowerCase().includes("low ev")) {
      items.add("Low EV");
    }
    if (objection.includes("Rotation") || objection.includes("輪換")) {
      items.add("Rotation");
    }
    if (objection.includes("Weather") || objection.includes("天氣")) {
      items.add("Weather");
    }
    if (objection.includes("Injury") || objection.includes("傷")) {
      items.add("Injury");
    }
    items.add(objection);
  }

  for (const warning of candidateWarnings) {
    items.add(warning);
  }

  for (const label of OPPOSING_FEATURE_LABELS) {
    const found = [...items].some((item) =>
      item.toLowerCase().includes(label.toLowerCase().split(" ")[0] ?? "")
    );
    if (!found && riskObjections.length === 0) {
      continue;
    }
  }

  return [...items].slice(0, 8);
}

function buildPassDecision(
  input: BuildDecisionInput,
  reason: string
): DecisionResult {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const aggregateRisk = assessRisk({
    fusion: input.fusion,
    bettingIntelligence: input.bettingIntelligence,
    candidate: null,
  });
  const evidenceImpact = resolveEvidenceImpact(input, null);

  return {
    decision: "PASS",
    market: null,
    selection: null,
    confidence: 0,
    decisionScore: 0,
    decisionScoreTier: "Avoid",
    valueScore: 0,
    riskScore: aggregateRisk.riskScore,
    expectedValue: 0,
    reasons: [],
    objections: [reason, ...aggregateRisk.objections],
    supportingFeatures: [],
    opposingFeatures: collectOpposingFeatures(aggregateRisk.objections, []),
    evidenceImpact,
    warnings: aggregateRisk.warnings,
    explanation: buildExplanation({
      reasons: [],
      objections: [reason],
      supportingFeatures: [],
      opposingFeatures: [],
      evidenceImpact,
      decision: "PASS",
    }),
    generatedAt: capturedAt,
  };
}

export function buildDecision(input: BuildDecisionInput): DecisionResult {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const globalPass = input.recommendationResult?.globalPass ?? false;

  if (globalPass) {
    return buildPassDecision(
      input,
      input.recommendationResult?.passReason ?? "Recommendation global PASS"
    );
  }

  const best = selectBestMarketCandidate({
    candidates: input.recommendationCandidates,
    fusion: input.fusion,
    bettingIntelligence: input.bettingIntelligence,
    recommendationResult: input.recommendationResult,
  });

  if (!best) {
    return buildPassDecision(input, "No viable market candidate");
  }

  const value = assessValueForCandidate(best.candidate, input.bettingIntelligence);
  const risk = assessRisk({
    fusion: input.fusion,
    bettingIntelligence: input.bettingIntelligence,
    candidate: best.candidate,
  });

  const predictionScore = input.fusion
    ? computePredictionScore(
        input.fusion.overallScore,
        input.fusion.overallConfidence
      )
    : best.predictionScore;

  const decisionScore = computeDecisionScore({
    predictionScore,
    valueScore: value.valueScore,
    riskScore: risk.riskScore,
  });

  const decision = resolveDecisionLevel(
    decisionScore,
    value.expectedValue,
    risk.riskScore,
    false
  );

  const reasons = [
    ...best.candidate.reasons,
    ...value.reasons,
  ];
  const objections = [...risk.objections];
  if (value.expectedValue <= 0) {
    objections.push("Low EV");
  }

  const supportingFeatures = collectSupportingFeatures(
    input.fusion,
    best.candidate.supportingFeatures,
    value.reasons
  );
  const opposingFeatures = collectOpposingFeatures(
    risk.objections,
    best.candidate.warnings
  );
  const evidenceImpact = resolveEvidenceImpact(input, best.candidate);

  const warnings = [...best.candidate.warnings, ...risk.warnings];
  const confidence = computeConfidence(decisionScore, value.valueScore, risk.riskScore);

  const result: DecisionResult = {
    decision,
    market: best.candidate.marketType,
    selection: best.candidate.selection,
    confidence,
    decisionScore,
    decisionScoreTier: resolveDecisionScoreTier(decisionScore),
    valueScore: value.valueScore,
    riskScore: risk.riskScore,
    expectedValue: value.expectedValue,
    reasons,
    objections,
    supportingFeatures,
    opposingFeatures,
    evidenceImpact,
    warnings,
    explanation: buildExplanation({
      reasons,
      objections,
      supportingFeatures,
      opposingFeatures,
      evidenceImpact,
      decision,
    }),
    generatedAt: capturedAt,
  };

  return result;
}

export function buildReplayDecisionSnapshot(
  input: BuildDecisionInput,
  decision: DecisionResult
): ReplayDecisionSnapshot {
  const scored = scoreMarketCandidates({
    candidates: input.recommendationCandidates.filter(
      (candidate) => candidate.confidence !== "pass"
    ),
    fusion: input.fusion,
    bettingIntelligence: input.bettingIntelligence,
  });

  const predictionScore = input.fusion
    ? computePredictionScore(
        input.fusion.overallScore,
        input.fusion.overallConfidence
      )
    : 0;

  return {
    decision,
    inputs: {
      predictionScore,
      valueScore: decision.valueScore,
      riskScore: decision.riskScore,
      candidateCount: input.recommendationCandidates.length,
    },
    scoredCandidates: scored.map((item) => ({
      marketType: item.candidate.marketType,
      side: item.candidate.selection.side,
      compositeScore: item.compositeScore,
      valueScore: item.valueScore,
      riskScore: item.riskScore,
    })),
  };
}
