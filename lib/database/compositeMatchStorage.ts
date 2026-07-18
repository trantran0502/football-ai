import type { AnalysisReport } from "@/lib/analysis/types";
import type {
  HistoricalMatchRecord,
  MatchHistoryStats,
  SaveMatchOutcome,
  UpdateMatchResultInput,
} from "@/lib/database/matchSchema";
import { getBrowserHistoryRepository } from "@/lib/database/browserHistoryRepository";
import type { StorageHealth } from "@/lib/storage/storageStatus";
import { STORAGE_POLICY } from "@/lib/storage/storageStatus";
import type { MatchRecordVerifyResult } from "@/lib/database/matchRecordApiTypes";

export type MatchRecordWriteResult = SaveMatchOutcome & {
  storage: StorageHealth;
};

export interface MatchHistoryLoadResult {
  matches: HistoricalMatchRecord[];
  stats: MatchHistoryStats;
  storage: StorageHealth;
}

export type { MatchRecordVerifyResult };

function assertSupabaseFirstPolicy(): void {
  if (STORAGE_POLICY !== "supabase-first") {
    throw new Error(`Unsupported storage policy: ${STORAGE_POLICY}`);
  }
}

function isBrowserClient(): boolean {
  return typeof window !== "undefined";
}

/**
 * Browser clients read/write Supabase via server actions.
 * LocalStorage fallback is allowed only outside production.
 */
export async function saveMatchFromAnalysisComposite(
  rawOdds: string,
  report: AnalysisReport
): Promise<MatchRecordWriteResult> {
  assertSupabaseFirstPolicy();

  if (!isBrowserClient()) {
    const { saveMatchFromAnalysisServerSide } = await import(
      "@/lib/database/serverMatchStorage"
    );
    return saveMatchFromAnalysisServerSide(rawOdds, report);
  }

  const { saveMatchFromAnalysisForBrowser } = await import(
    "@/lib/database/browserMatchStorage"
  );
  return saveMatchFromAnalysisForBrowser(rawOdds, report);
}

export async function loadMatchHistoryComposite(): Promise<MatchHistoryLoadResult> {
  assertSupabaseFirstPolicy();

  if (!isBrowserClient()) {
    const { loadMatchHistoryServerSide } = await import("@/lib/database/serverMatchStorage");
    return loadMatchHistoryServerSide();
  }

  const { loadMatchHistoryForBrowser } = await import("@/lib/database/browserMatchStorage");
  return loadMatchHistoryForBrowser();
}

export async function verifyMatchComposite(
  matchId: string,
  input: UpdateMatchResultInput
): Promise<MatchRecordVerifyResult> {
  assertSupabaseFirstPolicy();

  if (!isBrowserClient()) {
    const { verifyMatchServerSide } = await import("@/lib/database/serverMatchStorage");
    return verifyMatchServerSide(matchId, input);
  }

  const { verifyMatchForBrowser } = await import("@/lib/database/browserMatchStorage");
  return verifyMatchForBrowser(matchId, input);
}

export function clearMatchHistoryLocally(): void {
  getBrowserHistoryRepository().clearAll();
}
