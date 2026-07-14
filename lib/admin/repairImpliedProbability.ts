import {
  convertRawOddsToImpliedProbability,
} from "@/lib/analysis/featureScore/oddsConversion";
import {
  normalizeHistoricalMatchRecord,
  type HistoricalMatchRecord,
} from "@/lib/database/matchSchema";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  assertSupabaseData,
  throwIfSupabaseError,
} from "@/lib/supabase/errors";
import { listMatchRecordsFromSupabase } from "@/lib/supabase/queries/matchRecords";

export interface ImpliedProbabilityFieldChange {
  fieldPath: string;
  oldValue: number;
  newValue: number;
}

export interface RecordRepairEntry {
  recordId: string;
  homeTeam: string;
  awayTeam: string;
  changeCount: number;
  changes: ImpliedProbabilityFieldChange[];
}

export interface DryRunRepairResult {
  recordsToRepair: RecordRepairEntry[];
  pollutedRecordCount: number;
  pollutedFieldCount: number;
}

export interface ApplyRepairResult {
  success: number;
  failed: number;
  updatedRecordIds: string[];
  failedRecordIds: string[];
  pollutedRecordCountBefore: number;
  pollutedRecordCountAfter: number;
}

interface InternalRepairPlan {
  recordId: string;
  homeTeam: string;
  awayTeam: string;
  changes: ImpliedProbabilityFieldChange[];
  marketSelections: HistoricalMatchRecord["marketSelections"];
  analysisSnapshot: HistoricalMatchRecord["analysisSnapshot"];
}

function toIsoTimestamp(value: string): string {
  return value.includes("T") ? value : `${value}T00:00:00.000Z`;
}

function resolveRawOdds(source: {
  odds?: number;
  decimalOdds?: number;
}): number | null {
  const raw = source.odds ?? source.decimalOdds;
  if (raw === undefined || !Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  return raw;
}

function maybeFixImpliedProbability(
  rawOdds: number,
  current: number | undefined,
  fieldPath: string,
  changes: ImpliedProbabilityFieldChange[]
): number | undefined {
  if (current === undefined || !(current > 1)) {
    return current;
  }

  const newValue = convertRawOddsToImpliedProbability(rawOdds);
  if (newValue === null) {
    return current;
  }

  changes.push({
    fieldPath,
    oldValue: current,
    newValue,
  });

  return newValue;
}

function buildRepairPlan(record: HistoricalMatchRecord): InternalRepairPlan | null {
  const changes: ImpliedProbabilityFieldChange[] = [];
  const repaired = structuredClone(record);

  repaired.marketSelections = repaired.marketSelections.map((selection, index) => {
    const rawOdds = resolveRawOdds(selection);
    if (rawOdds === null) {
      return selection;
    }
    const impliedProbability = maybeFixImpliedProbability(
      rawOdds,
      selection.impliedProbability,
      `marketSelections[${index}].impliedProbability`,
      changes
    );
    return {
      ...selection,
      impliedProbability,
    };
  });

  if (repaired.analysisSnapshot?.features) {
    repaired.analysisSnapshot.features = repaired.analysisSnapshot.features.map(
      (feature, index) => {
        const rawOdds = resolveRawOdds(feature);
        if (rawOdds === null) {
          return feature;
        }
        const impliedProbability = maybeFixImpliedProbability(
          rawOdds,
          feature.impliedProbability,
          `analysisSnapshot.features[${index}].impliedProbability`,
          changes
        );
        return {
          ...feature,
          impliedProbability: impliedProbability ?? feature.impliedProbability,
        };
      }
    );
  }

  if (changes.length === 0) {
    return null;
  }

  return {
    recordId: record.id,
    homeTeam: record.homeTeam,
    awayTeam: record.awayTeam,
    changes,
    marketSelections: repaired.marketSelections,
    analysisSnapshot: repaired.analysisSnapshot,
  };
}

function walkPollution(
  value: unknown,
  path: string,
  recordIds: Set<string>,
  recordId: string
): number {
  if (value === null || value === undefined) {
    return 0;
  }

  let count = 0;

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      count += walkPollution(value[index], `${path}[${index}]`, recordIds, recordId);
    }
    return count;
  }

  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (
        key === "impliedProbability" &&
        typeof nested === "number" &&
        nested > 1
      ) {
        recordIds.add(recordId);
        count += 1;
      } else {
        count += walkPollution(nested, nextPath, recordIds, recordId);
      }
    }
  }

  return count;
}

export function countImpliedProbabilityPollution(
  records: HistoricalMatchRecord[]
): { pollutedRecordCount: number; pollutedFieldCount: number } {
  const recordIds = new Set<string>();
  let pollutedFieldCount = 0;

  for (const record of records) {
    pollutedFieldCount += walkPollution(
      record.marketSelections,
      "marketSelections",
      recordIds,
      record.id
    );
    pollutedFieldCount += walkPollution(
      record.analysisSnapshot?.features,
      "analysisSnapshot.features",
      recordIds,
      record.id
    );
  }

  return {
    pollutedRecordCount: recordIds.size,
    pollutedFieldCount,
  };
}

function buildPlans(records: HistoricalMatchRecord[]): InternalRepairPlan[] {
  return records
    .map((record) => buildRepairPlan(record))
    .filter((plan): plan is InternalRepairPlan => plan !== null);
}

export async function runImpliedProbabilityRepairDryRun(): Promise<DryRunRepairResult> {
  const { records } = await listMatchRecordsFromSupabase();
  const pollution = countImpliedProbabilityPollution(records);
  const plans = buildPlans(records);

  return {
    recordsToRepair: plans.map((plan) => ({
      recordId: plan.recordId,
      homeTeam: plan.homeTeam,
      awayTeam: plan.awayTeam,
      changeCount: plan.changes.length,
      changes: plan.changes,
    })),
    pollutedRecordCount: pollution.pollutedRecordCount,
    pollutedFieldCount: pollution.pollutedFieldCount,
  };
}

async function patchMatchRecordOddsFields(
  recordId: string,
  marketSelections: HistoricalMatchRecord["marketSelections"],
  analysisSnapshot: HistoricalMatchRecord["analysisSnapshot"],
  updatedAt: string
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("match_records")
    .update({
      market_selections: marketSelections,
      analysis_snapshot: analysisSnapshot,
      updated_at: toIsoTimestamp(updatedAt),
    } as never)
    .eq("id", recordId)
    .select("id")
    .maybeSingle();

  throwIfSupabaseError(result.error, result.status ?? null);
  const data = assertSupabaseData(result);
  if (!data) {
    throw new Error(`Match record ${recordId} not found during update.`);
  }
}

export async function runImpliedProbabilityRepairApply(): Promise<ApplyRepairResult> {
  const { records } = await listMatchRecordsFromSupabase();
  const before = countImpliedProbabilityPollution(records);
  const plans = buildPlans(records);

  let success = 0;
  let failed = 0;
  const updatedRecordIds: string[] = [];
  const failedRecordIds: string[] = [];

  for (const plan of plans) {
    const original = records.find((record) => record.id === plan.recordId);
    if (!original) {
      failed += 1;
      failedRecordIds.push(plan.recordId);
      continue;
    }

    try {
      await patchMatchRecordOddsFields(
        plan.recordId,
        plan.marketSelections,
        plan.analysisSnapshot,
        new Date().toISOString()
      );
      success += 1;
      updatedRecordIds.push(plan.recordId);
    } catch {
      failed += 1;
      failedRecordIds.push(plan.recordId);
    }
  }

  const { records: afterRecords } = await listMatchRecordsFromSupabase();
  const after = countImpliedProbabilityPollution(afterRecords);

  return {
    success,
    failed,
    updatedRecordIds,
    failedRecordIds,
    pollutedRecordCountBefore: before.pollutedRecordCount,
    pollutedRecordCountAfter: after.pollutedRecordCount,
  };
}