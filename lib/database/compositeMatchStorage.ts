import type { AnalysisReport } from "@/lib/analysis/types";
import type {
  HistoricalMatchRecord,
  MatchHistoryStats,
  SaveMatchInput,
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

function saveMatchIfNewLocally(input: SaveMatchInput): SaveMatchOutcome {
  return getBrowserHistoryRepository().saveMatchIfNew(input);
}

function loadMatchHistoryLocally(): {
  matches: HistoricalMatchRecord[];
  stats: MatchHistoryStats;
} {
  const repository = getBrowserHistoryRepository();
  return {
    matches: repository.getAllMatches(),
    stats: repository.getStats(),
  };
}

function verifyMatchLocally(
  matchId: string,
  input: UpdateMatchResultInput
): HistoricalMatchRecord | null {
  return getBrowserHistoryRepository().verifyMatch(matchId, input);
}

/**
 * Browser clients persist locally only (RC2).
 * Protected Supabase writes must go through admin-authenticated API routes or server jobs.
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

  const matchDate = new Date().toISOString().split("T")[0];
  const outcome = saveMatchIfNewLocally({
    date: matchDate,
    matchDate,
    league: report.match.league ?? "",
    homeTeam: report.match.homeTeam,
    awayTeam: report.match.awayTeam,
    rawOdds,
    marketSelections: report.markets,
    analysis: report,
    candidates: report.candidates,
    status: "PENDING",
  });

  return {
    ...outcome,
    storage: "local",
  };
}

export async function loadMatchHistoryComposite(): Promise<MatchHistoryLoadResult> {
  assertSupabaseFirstPolicy();

  if (!isBrowserClient()) {
    const { loadMatchHistoryServerSide } = await import("@/lib/database/serverMatchStorage");
    return loadMatchHistoryServerSide();
  }

  const local = loadMatchHistoryLocally();
  return {
    ...local,
    storage: "local",
  };
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

  const localRecord = verifyMatchLocally(matchId, input);
  return {
    record: localRecord,
    storage: localRecord ? "local" : "failed",
  };
}

export function clearMatchHistoryLocally(): void {
  getBrowserHistoryRepository().clearAll();
}
