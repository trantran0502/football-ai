import type {
  BetaCandidate,
  BetaRecommendationRecord,
  RollingEvaluationReport,
} from "@/lib/beta/types";
import type { TeamDataPackage } from "@/lib/providers/free/types";
import type { MarketSelection } from "@/types/match";
import type { StorageHealth } from "@/lib/storage/storageStatus";
import {
  clearBetaStorageLocally,
  getAllBetaRecommendationsFromCache,
  getBetaRecommendationsByMatchFromCache,
  getBetaRecommendationsByVersionFromCache,
  getLatestRollingReportFromCache,
  getLastBetaReadStatus,
  getRollingReportsFromCache,
  reloadBetaStorageCache,
  saveBetaRecommendationsComposite,
  saveRollingReportComposite,
  updateBetaRecommendationComposite,
} from "@/lib/beta/compositeBetaStorage";

export { reloadBetaStorageCache, getLastBetaReadStatus };

export async function saveBetaRecommendations(input: {
  matchRecordId: string;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  rawOdds: string;
  marketSelections: MarketSelection[];
  teamData: TeamDataPackage | null;
  candidates: BetaCandidate[];
}): Promise<{ records: BetaRecommendationRecord[]; storage: StorageHealth }> {
  return saveBetaRecommendationsComposite(input);
}

export function getAllBetaRecommendations(): BetaRecommendationRecord[] {
  return getAllBetaRecommendationsFromCache();
}

export function getBetaRecommendationsByMatch(
  matchRecordId: string
): BetaRecommendationRecord[] {
  return getBetaRecommendationsByMatchFromCache(matchRecordId);
}

export function getBetaRecommendationsByVersion(
  modelVersion: string
): BetaRecommendationRecord[] {
  return getBetaRecommendationsByVersionFromCache(modelVersion);
}

export async function updateBetaRecommendation(
  record: BetaRecommendationRecord
): Promise<StorageHealth> {
  return updateBetaRecommendationComposite(record);
}

export function clearAllBetaRecommendations(): void {
  clearBetaStorageLocally();
}

export async function saveRollingReport(
  report: RollingEvaluationReport
): Promise<StorageHealth> {
  return saveRollingReportComposite(report);
}

export function getRollingReports(): RollingEvaluationReport[] {
  return getRollingReportsFromCache();
}

export function getLatestRollingReport(): RollingEvaluationReport | null {
  return getLatestRollingReportFromCache();
}
