import {
  listMatchRecordsFromSupabase,
} from "@/lib/supabase/queries/matchRecords";
import {
  saveMatchFromAnalysisInSupabase,
  verifyMatchInSupabase,
} from "@/lib/supabase/services/matchRecordService";
import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import { runDailyMatchPipeline } from "@/lib/production/dailyMatchPipeline";
import { runResultUpdatePipeline } from "@/lib/production/resultUpdatePipeline";
import { buildProductionValidationSummary } from "@/lib/production/productionValidation";
import { listPendingProductionMatches } from "@/lib/production/resultUpdatePipeline";
import type {
  DailyPipelineResult,
  ProductionFixture,
  ProductionResultUpdate,
  ProductionValidationSummary,
  ResultPipelineResult,
} from "@/lib/production/productionTypes";

export async function listPendingFromSupabase() {
  const { records } = await listMatchRecordsFromSupabase();
  return listPendingProductionMatches(records);
}

export async function runProductionDailyJob(
  fixtures: ProductionFixture[],
  runDate: string = new Date().toISOString().split("T")[0]
): Promise<DailyPipelineResult> {
  return runDailyMatchPipeline(fixtures, runDate, {
    analyze: analyzeMatch,
    saveMatch: saveMatchFromAnalysisInSupabase,
  });
}

export async function runProductionResultJob(
  updates: ProductionResultUpdate[]
): Promise<ResultPipelineResult> {
  return runResultUpdatePipeline(updates, {
    verifyMatch: verifyMatchInSupabase,
  });
}

export async function buildProductionSummaryFromSupabase(): Promise<ProductionValidationSummary> {
  const { records } = await listMatchRecordsFromSupabase();
  return buildProductionValidationSummary(records);
}

export {
  saveMatchFromAnalysisInSupabase,
  verifyMatchInSupabase,
};
