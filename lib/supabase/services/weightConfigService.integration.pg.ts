import type { FeatureProviderKey } from "@/lib/providers/registry/types";
import {
  assertMarketBlendWeight,
  assertProviderWeightsSumToOne,
} from "@/lib/recommendation/weightConfigRuntime";
import type { WeightConfigVersion } from "@/lib/recommendation/weightConfigTypes";
import type { WeightConfigVersionRow } from "@/lib/supabase/database.types";
import {
  weightConfigDraftToInsertRow,
  weightConfigRowToDomain,
} from "@/lib/supabase/mappers/weightConfigMapper";

export interface InsertDraftViaPgInput {
  providerWeights: Record<FeatureProviderKey, number>;
  marketBlendWeight: number;
  sourceReportSnapshot?: WeightConfigVersion["sourceReportSnapshot"];
  createdBy: string;
}

type PgQuery = (sql: string, params?: unknown[]) => Promise<import("pg").QueryResult>;

export async function resolveNextVersionNumberViaPg(query: PgQuery): Promise<number> {
  const result = await query(
    `select coalesce(max(version), 0)::int as max_version
     from public.weight_config_versions`
  );
  const maxVersion = Number(result.rows[0]?.max_version ?? 0);
  return maxVersion + 1;
}

export async function insertDraftViaPg(
  query: PgQuery,
  input: InsertDraftViaPgInput
): Promise<WeightConfigVersion> {
  assertProviderWeightsSumToOne(input.providerWeights);
  assertMarketBlendWeight(input.marketBlendWeight);

  const version = await resolveNextVersionNumberViaPg(query);
  const row = weightConfigDraftToInsertRow({
    version,
    providerWeights: input.providerWeights,
    marketBlendWeight: input.marketBlendWeight,
    sourceReportSnapshot: input.sourceReportSnapshot ?? {},
    createdBy: input.createdBy,
  });

  const result = await query(
    `insert into public.weight_config_versions (
       version,
       status,
       provider_weights,
       market_blend_weight,
       source_report_snapshot,
       created_by
     ) values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [
      row.version,
      row.status,
      row.provider_weights,
      row.market_blend_weight,
      row.source_report_snapshot ?? {},
      row.created_by,
    ]
  );

  const inserted = result.rows[0] as WeightConfigVersionRow | undefined;
  if (!inserted) {
    throw new Error("Failed to insert weight_config_versions draft row via pg.");
  }

  return weightConfigRowToDomain(inserted);
}
