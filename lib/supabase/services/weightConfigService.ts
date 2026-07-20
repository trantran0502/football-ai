import {
  assertMarketBlendWeight,
  assertProviderWeightsSumToOne,
  buildRuntimeWeightConfigFromActive,
} from "@/lib/recommendation/weightConfigRuntime";
import { buildProductionBaselineWeightConfig } from "@/lib/recommendation/productionWeightConfig";
import type {
  CreateWeightConfigDraftInput,
  RuntimeWeightConfig,
  WeightConfigActivationResult,
  WeightConfigRollbackResult,
  WeightConfigVersion,
} from "@/lib/recommendation/weightConfigTypes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { WeightConfigVersionRow } from "@/lib/supabase/database.types";
import {
  assertSupabaseData,
  throwIfSupabaseError,
} from "@/lib/supabase/errors";
import {
  weightConfigDraftToInsertRow,
  weightConfigRowToDomain,
} from "@/lib/supabase/mappers/weightConfigMapper";
import {
  getDefaultWeightConfigTransactionStore,
  setDefaultWeightConfigTransactionStoreForTests,
  type WeightConfigTransactionStore,
} from "@/lib/supabase/services/weightConfigTransactionStore";

export interface WeightConfigServiceOptions {
  transactionStore?: WeightConfigTransactionStore;
}

function resolveTransactionStore(
  options?: WeightConfigServiceOptions
): WeightConfigTransactionStore {
  return options?.transactionStore ?? getDefaultWeightConfigTransactionStore();
}

async function resolveNextVersionNumber(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("weight_config_versions")
    .select("version")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  throwIfSupabaseError(result.error, result.status ?? null);
  const latest = result.data as { version: number } | null;
  return latest ? latest.version + 1 : 1;
}

export async function createWeightConfigDraft(
  input: CreateWeightConfigDraftInput
): Promise<WeightConfigVersion> {
  assertProviderWeightsSumToOne(input.providerWeights);
  assertMarketBlendWeight(input.marketBlendWeight);

  const supabase = getSupabaseAdmin();
  const version = await resolveNextVersionNumber();
  const row = weightConfigDraftToInsertRow({
    version,
    providerWeights: input.providerWeights,
    marketBlendWeight: input.marketBlendWeight,
    sourceReportSnapshot: input.sourceReportSnapshot ?? {},
    createdBy: input.createdBy,
  });

  const result = await supabase
    .from("weight_config_versions")
    .insert(row as never)
    .select("*")
    .single();

  throwIfSupabaseError(result.error, result.status ?? null);
  const data = assertSupabaseData(result) as WeightConfigVersionRow | null;
  if (!data) {
    throw new Error("Failed to insert weight_config_versions draft row.");
  }

  return weightConfigRowToDomain(data);
}

export async function activateWeightConfig(
  versionId: string,
  options?: WeightConfigServiceOptions
): Promise<WeightConfigActivationResult> {
  const result = await resolveTransactionStore(options).activateWeightConfig(versionId);
  const { invalidateRuntimeWeightConfigCache } = await import(
    "@/lib/recommendation/runtimeWeightConfigLoader"
  );
  invalidateRuntimeWeightConfigCache();
  return result;
}

export async function rollbackWeightConfig(
  targetVersionId?: string,
  options?: WeightConfigServiceOptions
): Promise<WeightConfigRollbackResult> {
  const result = await resolveTransactionStore(options).rollbackWeightConfig(
    targetVersionId
  );
  const { invalidateRuntimeWeightConfigCache } = await import(
    "@/lib/recommendation/runtimeWeightConfigLoader"
  );
  invalidateRuntimeWeightConfigCache();
  return result;
}

export async function getActiveWeightConfig(): Promise<RuntimeWeightConfig> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("weight_config_versions")
    .select("*")
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  throwIfSupabaseError(result.error, result.status ?? null);
  const data = result.data as WeightConfigVersionRow | null;
  if (!data) {
    return buildProductionBaselineWeightConfig();
  }

  const activeVersion = weightConfigRowToDomain(data);
  return buildRuntimeWeightConfigFromActive(activeVersion);
}

export async function listWeightConfigVersions(): Promise<WeightConfigVersion[]> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("weight_config_versions")
    .select("*")
    .order("version", { ascending: false });

  throwIfSupabaseError(result.error, result.status ?? null);
  const data = (assertSupabaseData(result) ?? []) as WeightConfigVersionRow[];
  return data.map(weightConfigRowToDomain);
}

export { setDefaultWeightConfigTransactionStoreForTests };
