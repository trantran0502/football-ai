import type { AnalysisReport } from "@/lib/analysis/types";
import { getBrowserHistoryRepository } from "@/lib/database/browserHistoryRepository";
import type {
  HistoricalMatchRecord,
  MatchHistoryStats,
  SaveMatchOutcome,
  UpdateMatchResultInput,
} from "@/lib/database/matchSchema";

/**
 * 瀏覽器端持久化：分析完成後寫入 LocalStorage。
 */
export function persistAnalysisToHistory(
  rawOdds: string,
  report: AnalysisReport
): SaveMatchOutcome {
  const repository = getBrowserHistoryRepository();
  const matchDate = resolveMatchDate(report);
  return repository.saveMatchIfNew({
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
}

export function loadPersistedHistory(): {
  matches: HistoricalMatchRecord[];
  stats: MatchHistoryStats;
} {
  const repository = getBrowserHistoryRepository();
  return {
    matches: repository.getAllMatches(),
    stats: repository.getStats(),
  };
}

export function verifyPersistedMatch(
  matchId: string,
  input: UpdateMatchResultInput
): HistoricalMatchRecord | null {
  const repository = getBrowserHistoryRepository();
  return repository.verifyMatch(matchId, input);
}

export function clearPersistedHistory(): void {
  getBrowserHistoryRepository().clearAll();
}

function resolveMatchDate(report: AnalysisReport): string {
  return new Date().toISOString().split("T")[0];
}
