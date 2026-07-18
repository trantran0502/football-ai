import type { FeatureProviderKey } from "@/lib/providers/registry/types";
import {
  assertMarketBlendWeight,
  parseProviderWeights,
} from "@/lib/recommendation/weightConfigRuntime";
import type {
  WeightConfigStatus,
  WeightConfigVersion,
} from "@/lib/recommendation/weightConfigTypes";
import type { WeightConfigVersionInsert, WeightConfigVersionRow } from "@/lib/supabase/database.types";

function parseStatus(value: string): WeightConfigStatus {
  if (value === "draft" || value === "active" || value === "archived") {
    return value;
  }
  throw new Error(`Invalid weight_config_versions.status: ${value}`);
}

export function weightConfigRowToDomain(row: WeightConfigVersionRow): WeightConfigVersion {
  const marketBlendWeight = Number(row.market_blend_weight);
  assertMarketBlendWeight(marketBlendWeight);

  return {
    id: row.id,
    version: row.version,
    status: parseStatus(row.status),
    providerWeights: parseProviderWeights(row.provider_weights),
    marketBlendWeight,
    sourceReportSnapshot: row.source_report_snapshot as WeightConfigVersion["sourceReportSnapshot"],
    createdBy: row.created_by,
    createdAt: row.created_at,
    appliedAt: row.applied_at,
    archivedAt: row.archived_at,
  };
}

export function weightConfigDraftToInsertRow(input: {
  version: number;
  providerWeights: Record<FeatureProviderKey, number>;
  marketBlendWeight: number;
  sourceReportSnapshot: WeightConfigVersion["sourceReportSnapshot"];
  createdBy: string;
}): WeightConfigVersionInsert {
  return {
    version: input.version,
    status: "draft",
    provider_weights: input.providerWeights,
    market_blend_weight: input.marketBlendWeight,
    source_report_snapshot: input.sourceReportSnapshot as Record<string, unknown>,
    created_by: input.createdBy,
  };
}
