import type {
  BetaRecommendationRecord,
  RollingEvaluationReport,
} from "@/lib/beta/types";
import type { StorageHealth } from "@/lib/storage/storageStatus";
import { insertBetaRecommendationsToSupabase } from "@/lib/supabase/services/betaRecommendationService";
import { updateBetaRecommendationInSupabase } from "@/lib/supabase/services/betaRecommendationService";
import { insertRollingReportToSupabase } from "@/lib/supabase/services/betaRollingReportService";
import { listBetaRecommendationsFromSupabase } from "@/lib/supabase/queries/betaRecommendations";
import { listBetaRollingReportsFromSupabase } from "@/lib/supabase/queries/betaRollingReports";

export async function reloadBetaStorageCacheServerSide(): Promise<StorageHealth> {
  await listBetaRecommendationsFromSupabase();
  await listBetaRollingReportsFromSupabase();
  return "supabase";
}

export async function saveBetaRecommendationsServerSide(
  records: BetaRecommendationRecord[]
): Promise<{ records: BetaRecommendationRecord[]; storage: StorageHealth }> {
  const saved = await insertBetaRecommendationsToSupabase(records);
  return { records: saved, storage: "supabase" };
}

export async function updateBetaRecommendationServerSide(
  record: BetaRecommendationRecord
): Promise<StorageHealth> {
  await updateBetaRecommendationInSupabase(record);
  return "supabase";
}

export async function saveRollingReportServerSide(
  report: RollingEvaluationReport
): Promise<StorageHealth> {
  await insertRollingReportToSupabase(report);
  return "supabase";
}
