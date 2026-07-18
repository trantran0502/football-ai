import {
  DEFAULT_DECISION_V3_CONFIG,
  SUPPORTED_DECISION_V3_EVIDENCE_IDS,
} from "@/lib/decision/v3/decisionConfig";
import type { DecisionConfig } from "@/lib/decision/v3/decisionTypes";
import type { LoadedRuntimeWeightConfig } from "@/lib/recommendation/weightConfigTypes";

export type DecisionWeightSource = "runtime" | "fallback" | "shadow";

export interface ResolvedDecisionEvidenceWeights {
  weights: Record<string, number>;
  source: DecisionWeightSource;
  version: number | null;
}

function sanitizeEvidenceWeight(value: unknown, fallback = 1): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return value;
}

export function resolveDecisionEvidenceWeights(
  runtimeWeightConfig?: LoadedRuntimeWeightConfig | null
): ResolvedDecisionEvidenceWeights {
  const fallbackWeights = { ...DEFAULT_DECISION_V3_CONFIG.weights };
  const runtimeWeights = runtimeWeightConfig?.decision?.evidenceWeights;

  if (!runtimeWeights || Object.keys(runtimeWeights).length === 0) {
    return {
      weights: fallbackWeights,
      source: "fallback",
      version: runtimeWeightConfig?.activeVersion?.version ?? null,
    };
  }

  const weights: Record<string, number> = { ...fallbackWeights };
  let usedRuntimeValue = false;

  for (const evidenceId of SUPPORTED_DECISION_V3_EVIDENCE_IDS) {
    if (evidenceId in runtimeWeights) {
      weights[evidenceId] = sanitizeEvidenceWeight(
        runtimeWeights[evidenceId],
        fallbackWeights[evidenceId] ?? 1
      );
      usedRuntimeValue = true;
    }
  }

  return {
    weights,
    source: usedRuntimeValue && runtimeWeightConfig?.source === "active"
      ? "runtime"
      : usedRuntimeValue
        ? "shadow"
        : "fallback",
    version: runtimeWeightConfig?.activeVersion?.version ?? null,
  };
}

export function buildDecisionConfigFromResolvedWeights(
  resolved: ResolvedDecisionEvidenceWeights
): DecisionConfig {
  return {
    catalogVersion: DEFAULT_DECISION_V3_CONFIG.catalogVersion,
    weights: { ...resolved.weights },
  };
}

export function buildFixedDecisionConfig(): DecisionConfig {
  return {
    catalogVersion: DEFAULT_DECISION_V3_CONFIG.catalogVersion,
    weights: { ...DEFAULT_DECISION_V3_CONFIG.weights },
  };
}
