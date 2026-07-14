import type { AnalysisReport } from "@/lib/analysis/types";
import { getBrowserHistoryRepository } from "@/lib/database/browserHistoryRepository";
import type {
  HistoricalMatchRecord,
  MatchHistoryStats,
  SaveMatchInput,
  SaveMatchOutcome,
  UpdateMatchResultInput,
} from "@/lib/database/matchSchema";
import type { StorageHealth } from "@/lib/storage/storageStatus";
import { STORAGE_POLICY } from "@/lib/storage/storageStatus";
import {
  createMatchRecordViaApi,
  listMatchRecordsViaApi,
  verifyMatchRecordViaApi,
} from "@/lib/database/supabaseMatchApi";

export type MatchRecordWriteResult = SaveMatchOutcome & {
  storage: StorageHealth;
};

export interface MatchHistoryLoadResult {
  matches: HistoricalMatchRecord[];
  stats: MatchHistoryStats;
  storage: StorageHealth;
}

export interface MatchRecordVerifyResult {
  record: HistoricalMatchRecord | null;
  storage: StorageHealth;
}

function assertSupabaseFirstPolicy(): void {
  if (STORAGE_POLICY !== "supabase-first") {
    throw new Error(`Unsupported storage policy: ${STORAGE_POLICY}`);
  }
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

export async function saveMatchFromAnalysisComposite(
  rawOdds: string,
  report: AnalysisReport
): Promise<MatchRecordWriteResult> {
  assertSupabaseFirstPolicy();
  const remote = await createMatchRecordViaApi({ rawOdds, report });
  if (remote) {
    return remote;
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
  const remote = await listMatchRecordsViaApi();
  if (remote) {
    return {
      matches: remote.matches,
      stats: remote.stats,
      storage: "supabase",
    };
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
  const remote = await verifyMatchRecordViaApi({ id: matchId, ...input });
  if (remote?.record) {
    return {
      record: remote.record,
      storage: "supabase",
    };
  }

  const localRecord = verifyMatchLocally(matchId, input);
  if (localRecord) {
    return {
      record: localRecord,
      storage: "local",
    };
  }

  return {
    record: null,
    storage: "failed",
  };
}

export function clearMatchHistoryLocally(): void {
  getBrowserHistoryRepository().clearAll();
}
