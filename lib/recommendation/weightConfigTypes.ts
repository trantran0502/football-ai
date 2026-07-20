import type { FeatureProviderKey } from "@/lib/providers/registry/types";
import type { WeightOptimizerReport } from "@/lib/recommendation/weightOptimizerTypes";

export type WeightConfigStatus = "draft" | "active" | "archived";

export type WeightConfigSource = "active" | "fallback" | "production_baseline";

export type DecisionEvidenceWeightId =
  | "ODDS_IMPLIED_VALUE"
  | "FORM_RECENT_10"
  | "PROVIDER_CONFIDENCE";

export interface DecisionRuntimeWeights {
  evidenceWeights: Partial<Record<DecisionEvidenceWeightId, number>>;
}

export interface WeightConfigVersion {
  id: string;
  version: number;
  status: WeightConfigStatus;
  providerWeights: Record<FeatureProviderKey, number>;
  marketBlendWeight: number;
  sourceReportSnapshot: WeightOptimizerReport | Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  appliedAt: string | null;
  archivedAt: string | null;
}

export interface RuntimeWeightConfig {
  providerWeights: Record<FeatureProviderKey, number>;
  marketBlendWeight: number;
  decision?: DecisionRuntimeWeights;
  source: WeightConfigSource;
  activeVersion: WeightConfigVersion | null;
}

export interface LoadedRuntimeWeightConfig extends RuntimeWeightConfig {
  loadedAt: string;
}

export interface WeightConfigSnapshotMetadata {
  versionId: string | null;
  version: number | null;
  versionLabel: string | null;
  source: WeightConfigSource;
  loadedAt: string;
}

export interface BrowserRuntimeWeightConfigActiveVersion {
  id: string;
  version: number;
}

export interface BrowserRuntimeWeightConfig {
  providerWeights: Record<FeatureProviderKey, number>;
  marketBlendWeight: number;
  source: WeightConfigSource;
  loadedAt: string;
  activeVersion: BrowserRuntimeWeightConfigActiveVersion | null;
}

export interface CreateWeightConfigDraftInput {
  providerWeights: Record<FeatureProviderKey, number>;
  marketBlendWeight: number;
  sourceReportSnapshot?: WeightOptimizerReport | Record<string, unknown>;
  createdBy: string;
}

export interface WeightConfigActivationResult {
  activated: WeightConfigVersion;
  previousActive: WeightConfigVersion | null;
}

export interface WeightConfigRollbackResult {
  activated: WeightConfigVersion;
  previousActive: WeightConfigVersion;
}
