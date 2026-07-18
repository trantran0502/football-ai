import { FEATURE_PROVIDER_KEYS, type FeatureProviderKey } from "@/lib/providers/registry/types";
import { MARKET_ENGINE_INITIAL_WEIGHT } from "@/lib/recommendation/marketEngine/marketScore";
import {
  DEFAULT_PROVIDER_WEIGHTS,
  sumProviderWeights,
} from "@/lib/recommendation/providerWeights";
import type {
  DecisionEvidenceWeightId,
  DecisionRuntimeWeights,
  LoadedRuntimeWeightConfig,
  RuntimeWeightConfig,
  WeightConfigSnapshotMetadata,
} from "@/lib/recommendation/weightConfigTypes";

const WEIGHT_SUM_TOLERANCE = 1e-6;

export function parseProviderWeights(
  value: unknown
): Record<FeatureProviderKey, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("provider_weights must be a JSON object.");
  }

  const record = value as Record<string, unknown>;
  const parsed = {} as Record<FeatureProviderKey, number>;

  for (const key of FEATURE_PROVIDER_KEYS) {
    const raw = record[key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      throw new Error(`provider_weights.${key} must be a finite number.`);
    }
    if (raw < 0) {
      throw new Error(`provider_weights.${key} must be non-negative.`);
    }
    parsed[key] = raw;
  }

  for (const key of Object.keys(record)) {
    if (!FEATURE_PROVIDER_KEYS.includes(key as FeatureProviderKey)) {
      throw new Error(`provider_weights contains unknown key: ${key}`);
    }
  }

  assertProviderWeightsSumToOne(parsed);
  return parsed;
}

export function assertProviderWeightsSumToOne(
  weights: Record<FeatureProviderKey, number>
): void {
  const total = sumProviderWeights(weights);
  if (Math.abs(total - 1) > WEIGHT_SUM_TOLERANCE) {
    throw new Error(`Provider weights must sum to 1.00, got ${total}`);
  }
}

export function assertMarketBlendWeight(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`market_blend_weight must be between 0 and 1, got ${value}`);
  }
}

export function buildFallbackWeightConfig(): RuntimeWeightConfig {
  return {
    providerWeights: { ...DEFAULT_PROVIDER_WEIGHTS },
    marketBlendWeight: MARKET_ENGINE_INITIAL_WEIGHT,
    source: "fallback",
    activeVersion: null,
  };
}

const DECISION_EVIDENCE_WEIGHT_IDS: DecisionEvidenceWeightId[] = [
  "ODDS_IMPLIED_VALUE",
  "FORM_RECENT_10",
  "PROVIDER_CONFIDENCE",
];

function sanitizeDecisionEvidenceWeight(value: unknown, fallback = 1): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return value;
}

export function parseDecisionEvidenceWeightsFromSnapshot(
  snapshot: unknown
): DecisionRuntimeWeights | undefined {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return undefined;
  }

  const decision = (snapshot as Record<string, unknown>).decision;
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
    return undefined;
  }

  const rawWeights = (decision as Record<string, unknown>).evidenceWeights;
  if (!rawWeights || typeof rawWeights !== "object" || Array.isArray(rawWeights)) {
    return undefined;
  }

  const evidenceWeights: Partial<Record<DecisionEvidenceWeightId, number>> = {};
  for (const id of DECISION_EVIDENCE_WEIGHT_IDS) {
    if (id in (rawWeights as Record<string, unknown>)) {
      evidenceWeights[id] = sanitizeDecisionEvidenceWeight(
        (rawWeights as Record<string, unknown>)[id]
      );
    }
  }

  if (Object.keys(evidenceWeights).length === 0) {
    return undefined;
  }

  return { evidenceWeights };
}

export function buildRuntimeWeightConfigFromActive(
  activeVersion: NonNullable<RuntimeWeightConfig["activeVersion"]>
): RuntimeWeightConfig {
  const decision = parseDecisionEvidenceWeightsFromSnapshot(
    activeVersion.sourceReportSnapshot
  );

  return {
    providerWeights: { ...activeVersion.providerWeights },
    marketBlendWeight: activeVersion.marketBlendWeight,
    ...(decision ? { decision } : {}),
    source: "active",
    activeVersion,
  };
}

export function buildWeightConfigSnapshotMetadata(
  config: LoadedRuntimeWeightConfig
): WeightConfigSnapshotMetadata {
  return {
    versionId: config.activeVersion?.id ?? null,
    version: config.activeVersion?.version ?? null,
    source: config.source,
    loadedAt: config.loadedAt,
  };
}
