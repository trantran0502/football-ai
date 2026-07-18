import {
  aggregateDecision,
  buildDecisionV3Observability,
} from "@/lib/decision/v3/decisionEngine";
import { isDecisionV3ShadowEnabled } from "@/lib/decision/v3/decisionConfig";
import type {
  DecisionV3ShadowContext,
  DecisionV3WeightComparison,
} from "@/lib/decision/v3/decisionTypes";
import {
  buildDecisionConfigFromResolvedWeights,
  buildFixedDecisionConfig,
  resolveDecisionEvidenceWeights,
} from "@/lib/decision/v3/decisionWeightLoader";
import { collectEvidenceV3 } from "@/lib/evidence/v3/evidenceCollector";
import type {
  EvidenceCollectionResult,
  EvidenceCollectorContext,
} from "@/lib/evidence/v3/evidenceTypes";
import type { LoadedRuntimeWeightConfig } from "@/lib/recommendation/weightConfigTypes";
import { setShadowRunDecisionV3 } from "@/lib/shadow/shadowRunScope";
import type { MarketSelection } from "@/types/match";

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildWeightComparison(
  fixedOutcome: ReturnType<typeof aggregateDecision>,
  runtimeOutcome: ReturnType<typeof aggregateDecision>
): DecisionV3WeightComparison {
  return {
    weightedScoreDiff: round(
      runtimeOutcome.weightedScore - fixedOutcome.weightedScore
    ),
    decisionChanged: runtimeOutcome.decision !== fixedOutcome.decision,
    confidenceChanged: runtimeOutcome.confidence !== fixedOutcome.confidence,
  };
}

export function runDecisionV3ShadowIfEnabled(input: {
  runId: string;
  evidenceCollection: EvidenceCollectionResult | null;
  collectorContext: EvidenceCollectorContext;
  marketSelections: MarketSelection[];
  runtimeWeightConfig?: LoadedRuntimeWeightConfig | null;
}): void {
  if (!isDecisionV3ShadowEnabled()) {
    setShadowRunDecisionV3(input.runId, null);
    return;
  }

  try {
    const evidenceCollection =
      input.evidenceCollection ?? collectEvidenceV3(input.collectorContext);
    const resolved = resolveDecisionEvidenceWeights(input.runtimeWeightConfig);
    const fixedOutcome = aggregateDecision({
      evidence: evidenceCollection,
      marketSelections: input.marketSelections,
      config: buildFixedDecisionConfig(),
      decisionWeightVersion: null,
      decisionWeightSource: "fallback",
    });
    const runtimeOutcome = aggregateDecision({
      evidence: evidenceCollection,
      marketSelections: input.marketSelections,
      config: buildDecisionConfigFromResolvedWeights(resolved),
      decisionWeightVersion: resolved.version,
      decisionWeightSource: resolved.source,
    });

    const context: DecisionV3ShadowContext = {
      enabled: true,
      collectedAt: evidenceCollection.collectedAt,
      decisionV3: buildDecisionV3Observability(runtimeOutcome),
      weightComparison: buildWeightComparison(fixedOutcome, runtimeOutcome),
    };
    setShadowRunDecisionV3(input.runId, context);
  } catch {
    setShadowRunDecisionV3(input.runId, null);
  }
}
