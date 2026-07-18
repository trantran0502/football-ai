import { FEATURE_PROVIDER_KEYS, type FeatureProviderKey } from "@/lib/providers/registry/types";
import {
  assertMarketBlendWeight,
  buildFallbackWeightConfig,
  parseProviderWeights,
} from "@/lib/recommendation/weightConfigRuntime";
import { DEFAULT_PROVIDER_WEIGHTS, sumProviderWeights } from "@/lib/recommendation/providerWeights";
import type { WeightOptimizerReport } from "@/lib/recommendation/weightOptimizerTypes";
import type {
  CreateWeightConfigDraftInput,
  RuntimeWeightConfig,
  WeightConfigVersion,
} from "@/lib/recommendation/weightConfigTypes";
import {
  WeightConfigAlreadyActiveError,
  WeightConfigConflictError,
  WeightConfigError,
  WeightConfigInvalidStatusError,
  WeightConfigNoActiveVersionError,
  WeightConfigNotFoundError,
  WeightConfigRollbackTargetNotFoundError,
  WeightConfigTransactionError,
} from "@/lib/supabase/services/weightConfigErrors";

export const WEIGHT_CONFIG_UI_CREATED_BY = "admin-ui";
export const WEIGHT_SUM_TOLERANCE = 1e-6;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class WeightConfigUiValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeightConfigUiValidationError";
  }
}

export interface WeightConfigActionResult {
  success: boolean;
  message: string;
  code?: string;
}

export interface WeightConfigActivePanelData {
  hasActiveVersion: boolean;
  source: "database" | "fallback";
  providerWeights: Record<FeatureProviderKey, number>;
  marketBlendWeight: number;
  activeVersion: WeightConfigVersion | null;
}

export interface WeightConfigDraftDefaults {
  providerWeights: Record<FeatureProviderKey, number>;
  marketBlendWeight: number;
  sourceReportSnapshot: WeightOptimizerReport | Record<string, unknown>;
  fromOptimizerReport: boolean;
}

export interface CreateDraftActionInput {
  providerWeights: Record<string, unknown>;
  marketBlendWeight: number;
  sourceReportSnapshot: unknown;
}

export interface RollbackActionInput {
  targetVersionId?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function buildDraftDefaultsFromOptimizerReport(
  report: WeightOptimizerReport
): WeightConfigDraftDefaults {
  const providerWeights = {} as Record<FeatureProviderKey, number>;

  for (const key of FEATURE_PROVIDER_KEYS) {
    const entry = report.providers.find((row) => row.providerKey === key);
    providerWeights[key] = entry?.suggestedWeight ?? DEFAULT_PROVIDER_WEIGHTS[key];
  }

  return {
    providerWeights,
    marketBlendWeight: report.overall.market.suggestedWeight,
    sourceReportSnapshot: report,
    fromOptimizerReport: true,
  };
}

export function buildDraftDefaultsFromFallback(): WeightConfigDraftDefaults {
  const fallback = buildFallbackWeightConfig();
  return {
    providerWeights: { ...fallback.providerWeights },
    marketBlendWeight: fallback.marketBlendWeight,
    sourceReportSnapshot: {
      source: "fallback-defaults",
      generatedAt: new Date().toISOString(),
    },
    fromOptimizerReport: false,
  };
}

export function mapActiveWeightConfigPanelData(
  config: RuntimeWeightConfig
): WeightConfigActivePanelData {
  const hasActiveVersion = config.activeVersion !== null;
  return {
    hasActiveVersion,
    source: hasActiveVersion ? "database" : "fallback",
    providerWeights: config.providerWeights,
    marketBlendWeight: config.marketBlendWeight,
    activeVersion: config.activeVersion,
  };
}

export function validateProviderWeightsForm(
  weights: Record<FeatureProviderKey, number>,
  marketBlendWeight: number
): { valid: boolean; sum: number; message: string | null } {
  for (const key of FEATURE_PROVIDER_KEYS) {
    const value = weights[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      return {
        valid: false,
        sum: sumProviderWeights(weights),
        message: `${key} must be a number between 0 and 1.`,
      };
    }
  }

  const sum = sumProviderWeights(weights);
  if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
    return {
      valid: false,
      sum,
      message: `Provider weights must sum to 1.00, got ${sum.toFixed(4)}.`,
    };
  }

  if (!Number.isFinite(marketBlendWeight) || marketBlendWeight < 0 || marketBlendWeight > 1) {
    return {
      valid: false,
      sum,
      message: "Market blend weight must be between 0 and 1.",
    };
  }

  return { valid: true, sum, message: null };
}

export function parseCreateDraftActionInput(
  input: CreateDraftActionInput
): CreateWeightConfigDraftInput {
  if (!isPlainObject(input.providerWeights)) {
    throw new WeightConfigUiValidationError("providerWeights must be an object.");
  }

  if (typeof input.marketBlendWeight !== "number" || !Number.isFinite(input.marketBlendWeight)) {
    throw new WeightConfigUiValidationError("marketBlendWeight must be a finite number.");
  }

  let providerWeights: Record<FeatureProviderKey, number>;
  try {
    providerWeights = parseProviderWeights(input.providerWeights);
  } catch (error) {
    throw new WeightConfigUiValidationError(
      error instanceof Error ? error.message : "Invalid providerWeights."
    );
  }

  try {
    assertMarketBlendWeight(input.marketBlendWeight);
  } catch (error) {
    throw new WeightConfigUiValidationError(
      error instanceof Error ? error.message : "Invalid marketBlendWeight."
    );
  }

  if (!isPlainObject(input.sourceReportSnapshot)) {
    throw new WeightConfigUiValidationError("sourceReportSnapshot must be an object.");
  }

  return {
    providerWeights,
    marketBlendWeight: input.marketBlendWeight,
    sourceReportSnapshot: input.sourceReportSnapshot,
    createdBy: WEIGHT_CONFIG_UI_CREATED_BY,
  };
}

export function parseRollbackActionInput(input: RollbackActionInput): {
  targetVersionId?: string;
} {
  if (input.targetVersionId === undefined || input.targetVersionId === null) {
    return {};
  }

  if (typeof input.targetVersionId !== "string" || !input.targetVersionId.trim()) {
    throw new WeightConfigUiValidationError("targetVersionId must be a non-empty string.");
  }

  const normalized = input.targetVersionId.trim();
  if (!isUuid(normalized)) {
    throw new WeightConfigUiValidationError("targetVersionId must be a UUID.");
  }

  return { targetVersionId: normalized };
}

export function parseActivateVersionId(versionId: string): string {
  const normalized = versionId.trim();
  if (!isUuid(normalized)) {
    throw new WeightConfigUiValidationError("version id must be a UUID.");
  }
  return normalized;
}

export function canActivateVersion(version: WeightConfigVersion): boolean {
  return version.status === "draft";
}

export function canRollbackToVersion(version: WeightConfigVersion): boolean {
  return version.status === "archived";
}

export function getRollbackCandidates(
  versions: WeightConfigVersion[]
): WeightConfigVersion[] {
  return versions.filter((version) => version.status === "archived");
}

export function canShowRollbackSection(input: {
  hasActiveVersion: boolean;
  versions: WeightConfigVersion[];
}): boolean {
  return input.hasActiveVersion && getRollbackCandidates(input.versions).length > 0;
}

export function mapWeightConfigErrorToActionResult(error: unknown): WeightConfigActionResult {
  if (error instanceof WeightConfigUiValidationError) {
    return {
      success: false,
      message: error.message,
      code: "VALIDATION_ERROR",
    };
  }

  if (error instanceof WeightConfigNotFoundError) {
    return {
      success: false,
      message: "Weight config version not found.",
      code: error.code,
    };
  }

  if (error instanceof WeightConfigRollbackTargetNotFoundError) {
    return {
      success: false,
      message: "Rollback target not found.",
      code: error.code,
    };
  }

  if (
    error instanceof WeightConfigInvalidStatusError ||
    error instanceof WeightConfigAlreadyActiveError ||
    error instanceof WeightConfigNoActiveVersionError
  ) {
    return {
      success: false,
      message: "Weight config state conflict.",
      code: error.code,
    };
  }

  if (error instanceof WeightConfigConflictError) {
    return {
      success: false,
      message: "Weight config transaction conflict.",
      code: error.code,
    };
  }

  if (error instanceof WeightConfigTransactionError || error instanceof WeightConfigError) {
    return {
      success: false,
      message: "Request failed.",
      code: error.code,
    };
  }

  return {
    success: false,
    message: "Request failed.",
    code: "INTERNAL_ERROR",
  };
}

export function sanitizeActionResultForClient(
  result: WeightConfigActionResult
): WeightConfigActionResult {
  return {
    success: result.success,
    message: result.message,
    code: result.code,
  };
}

export function formatWeightPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatTimestamp(value: string | null): string {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleString("zh-TW");
}
