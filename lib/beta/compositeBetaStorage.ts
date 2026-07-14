import {
  buildBetaRecommendationRecords,
  clearLocalBetaStorage,
  readLocalBetaRecommendations,
  readLocalRollingReports,
  saveBetaRecommendationsLocal,
  saveRollingReportLocal,
  updateBetaRecommendationLocal,
} from "@/lib/beta/betaLocalStorage";
import {
  createBetaRecommendationsViaApi,
  createRollingReportViaApi,
  listBetaRecommendationsViaApi,
  listRollingReportsViaApi,
  updateBetaRecommendationViaApi,
} from "@/lib/beta/supabaseBetaApi";
import type {
  BetaCandidate,
  BetaRecommendationRecord,
  RollingEvaluationReport,
} from "@/lib/beta/types";
import type { StorageHealth } from "@/lib/storage/storageStatus";
import { STORAGE_POLICY } from "@/lib/storage/storageStatus";
import type { TeamDataPackage } from "@/lib/providers/free/types";
import type { MarketSelection } from "@/types/match";

let recommendationsCache: BetaRecommendationRecord[] | null = null;
let rollingReportsCache: RollingEvaluationReport[] | null = null;
let lastBetaReadStatus: StorageHealth = "supabase";

export function resetBetaStorageCacheForTests(): void {
  recommendationsCache = null;
  rollingReportsCache = null;
  lastBetaReadStatus = "supabase";
}

export function getLastBetaReadStatus(): StorageHealth {
  return lastBetaReadStatus;
}

function assertSupabaseFirstPolicy(): void {
  if (STORAGE_POLICY !== "supabase-first") {
    throw new Error(`Unsupported storage policy: ${STORAGE_POLICY}`);
  }
}

export async function reloadBetaStorageCache(): Promise<StorageHealth> {
  assertSupabaseFirstPolicy();
  const remoteRecommendations = await listBetaRecommendationsViaApi();

  if (remoteRecommendations !== null) {
    recommendationsCache = remoteRecommendations;
    const remoteReports = await listRollingReportsViaApi();
    rollingReportsCache = remoteReports ?? readLocalRollingReports();
    lastBetaReadStatus = "supabase";
    return lastBetaReadStatus;
  }

  recommendationsCache = readLocalBetaRecommendations();
  rollingReportsCache = readLocalRollingReports();
  lastBetaReadStatus = "local";
  return lastBetaReadStatus;
}

function getCachedRecommendations(): BetaRecommendationRecord[] {
  return recommendationsCache ?? readLocalBetaRecommendations();
}

function getCachedRollingReports(): RollingEvaluationReport[] {
  return rollingReportsCache ?? readLocalRollingReports();
}

export async function saveBetaRecommendationsComposite(input: {
  matchRecordId: string;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  rawOdds: string;
  marketSelections: MarketSelection[];
  teamData: TeamDataPackage | null;
  candidates: BetaCandidate[];
}): Promise<{ records: BetaRecommendationRecord[]; storage: StorageHealth }> {
  assertSupabaseFirstPolicy();
  const created = buildBetaRecommendationRecords(input);
  if (created.length === 0) {
    return { records: [], storage: "supabase" };
  }

  const remote = await createBetaRecommendationsViaApi(created);
  if (remote) {
    await reloadBetaStorageCache();
    return { records: remote, storage: "supabase" };
  }

  saveBetaRecommendationsLocal(input);
  await reloadBetaStorageCache();
  return { records: created, storage: "local" };
}

export async function updateBetaRecommendationComposite(
  record: BetaRecommendationRecord
): Promise<StorageHealth> {
  assertSupabaseFirstPolicy();
  const remote = await updateBetaRecommendationViaApi(record);

  if (remote) {
    await reloadBetaStorageCache();
    return "supabase";
  }

  updateBetaRecommendationLocal(record);
  await reloadBetaStorageCache();
  return "local";
}

export async function saveRollingReportComposite(
  report: RollingEvaluationReport
): Promise<StorageHealth> {
  assertSupabaseFirstPolicy();
  const remote = await createRollingReportViaApi(report);

  if (remote) {
    await reloadBetaStorageCache();
    return "supabase";
  }

  saveRollingReportLocal(report);
  await reloadBetaStorageCache();
  return "local";
}

export function getAllBetaRecommendationsFromCache(): BetaRecommendationRecord[] {
  return getCachedRecommendations();
}

export function getBetaRecommendationsByMatchFromCache(
  matchRecordId: string
): BetaRecommendationRecord[] {
  return getCachedRecommendations().filter(
    (item) => item.matchRecordId === matchRecordId
  );
}

export function getBetaRecommendationsByVersionFromCache(
  modelVersion: string
): BetaRecommendationRecord[] {
  return getCachedRecommendations().filter(
    (item) => item.modelVersion === modelVersion
  );
}

export function getRollingReportsFromCache(): RollingEvaluationReport[] {
  return getCachedRollingReports();
}

export function getLatestRollingReportFromCache(): RollingEvaluationReport | null {
  return getCachedRollingReports()[0] ?? null;
}

export function clearBetaStorageLocally(): void {
  clearLocalBetaStorage();
  recommendationsCache = [];
  rollingReportsCache = [];
}
