import {
  getDefaultMatchDatabase,
  type MatchDatabase,
} from "@/lib/database/database";
import { runMatchVerification } from "@/lib/database/matchVerification";
import { persistRecommendationLearningLocally } from "@/lib/recommendation/recommendationLearningPersistence";
import type { AnalysisReport } from "@/lib/analysis/types";
import {
  buildMatchHistoryStats,
  buildMatchResult,
  createAnalysisSnapshot,
  createAnalysisSnapshotFromReport,
  generateHistoricalMatchId,
  isAnalysisSnapshot,
  normalizeHistoricalMatchRecord,
  type HistoricalMatchId,
  type HistoricalMatchRecord,
  type MatchHistoryStats,
  type SaveMatchInput,
  type SaveMatchOutcome,
  type UpdateMatchResultInput,
} from "@/lib/database/matchSchema";
import { enrichRecordWithReplayValidation } from "@/lib/replay/replayBuilder";

function cloneRecord(record: HistoricalMatchRecord): HistoricalMatchRecord {
  return structuredClone(normalizeHistoricalMatchRecord(record));
}

function resolveAnalysisSnapshot(
  analysis: SaveMatchInput["analysis"],
  capturedAt: string,
  matchId?: string,
  matchDate?: string
) {
  if (analysis === undefined || analysis === null) {
    return null;
  }
  if ("match" in analysis && "markets" in analysis && "crossMarketValidation" in analysis) {
    return createAnalysisSnapshotFromReport(analysis, capturedAt, matchId, matchDate);
  }
  if (isAnalysisSnapshot(analysis)) {
    return analysis;
  }
  return createAnalysisSnapshot(analysis, capturedAt);
}

/**
 * 歷史比賽 Repository。
 * 負責保存完整比賽資料與 Analysis Engine 快照，供未來回測使用。
 */
export class HistoryRepository {
  constructor(private readonly database: MatchDatabase = getDefaultMatchDatabase()) {}

  findByMatchKey(
    matchDate: string,
    homeTeam: string,
    awayTeam: string
  ): HistoricalMatchRecord | null {
    const found = this.database
      .findAll()
      .find(
        (record) =>
          record.matchDate === matchDate &&
          record.homeTeam === homeTeam &&
          record.awayTeam === awayTeam &&
          record.status !== "CANCELLED"
      );
    return found ? cloneRecord(found) : null;
  }

  saveMatch(input: SaveMatchInput): HistoricalMatchRecord {
    const outcome = this.saveMatchIfNew(input);
    if (outcome.record) {
      return outcome.record;
    }
    if (outcome.status === "incomplete_analysis_rejected") {
      throw new Error(`Save rejected: ${outcome.reason}`);
    }
    throw new Error("Save rejected.");
  }

  saveMatchIfNew(input: SaveMatchInput): SaveMatchOutcome {
    const matchDate = input.matchDate ?? input.date;
    const duplicate = this.findByMatchKey(
      matchDate,
      input.homeTeam,
      input.awayTeam
    );
    if (duplicate) {
      return { status: "duplicate", record: duplicate };
    }

    const now = new Date().toISOString();
    const matchId = input.id ?? generateHistoricalMatchId();
    const analysisSnapshot = resolveAnalysisSnapshot(
      input.analysis,
      now,
      matchId,
      matchDate
    );
    const candidates =
      input.candidates ?? analysisSnapshot?.candidates ?? [];

    const record: HistoricalMatchRecord = normalizeHistoricalMatchRecord({
      id: matchId,
      date: matchDate,
      matchDate,
      league: input.league,
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      rawOdds: input.rawOdds,
      marketSelections: structuredClone(input.marketSelections),
      result: null,
      analysisSnapshot: analysisSnapshot
        ? structuredClone(analysisSnapshot)
        : null,
      candidates: structuredClone(candidates),
      status: input.status ?? "PENDING",
      verificationResult: null,
      fixtureId: input.fixtureId ?? null,
      leagueId: input.leagueId ?? null,
      season: input.season ?? null,
      homeTeamId: input.homeTeamId ?? null,
      awayTeamId: input.awayTeamId ?? null,
      createdAt: now,
      updatedAt: now,
    });

    this.database.insert(record);
    return { status: "created", record: cloneRecord(record) };
  }

  saveMatchFromAnalysis(
    rawOdds: string,
    report: AnalysisReport,
    matchDate: string = new Date().toISOString().split("T")[0]
  ): SaveMatchOutcome {
    const id = generateHistoricalMatchId();
    const capturedAt = new Date().toISOString();
    const snapshot = createAnalysisSnapshotFromReport(report, capturedAt, id, matchDate);

    return this.saveMatchIfNew({
      id,
      date: matchDate,
      matchDate,
      league: report.match.league,
      homeTeam: report.match.homeTeam,
      awayTeam: report.match.awayTeam,
      rawOdds,
      marketSelections: report.markets,
      analysis: snapshot,
      candidates: report.candidates,
      status: "PENDING",
      fixtureId: report.match.fixtureId ?? null,
      leagueId: report.match.leagueId ?? null,
      season: report.match.season ?? null,
      homeTeamId: report.match.homeTeamId ?? null,
      awayTeamId: report.match.awayTeamId ?? null,
    });
  }

  updateResult(
    id: HistoricalMatchId,
    input: UpdateMatchResultInput
  ): HistoricalMatchRecord | null {
    const existing = this.database.findById(id);
    if (!existing) {
      return null;
    }

    const updated = normalizeHistoricalMatchRecord({
      ...existing,
      result: buildMatchResult(input),
      updatedAt: new Date().toISOString(),
    });

    const saved = this.database.update(updated);
    return saved ? cloneRecord(updated) : null;
  }

  verifyMatch(
    id: HistoricalMatchId,
    input: UpdateMatchResultInput
  ): HistoricalMatchRecord | null {
    const existing = this.database.findById(id);
    if (!existing || existing.status !== "PENDING") {
      return null;
    }

    try {
      const withResult = normalizeHistoricalMatchRecord({
        ...existing,
        result: buildMatchResult(input),
        updatedAt: new Date().toISOString(),
      });

      const verifiedPool = this.database
        .findAll()
        .filter((record) => record.result !== null && record.id !== id)
        .map((record) =>
          normalizeHistoricalMatchRecord({
            ...record,
            result: record.result!,
          })
        );

      const verificationResult = runMatchVerification(withResult, [
        ...verifiedPool,
        withResult,
      ]);

      const verified = normalizeHistoricalMatchRecord(
        enrichRecordWithReplayValidation({
          ...withResult,
          status: "VERIFIED",
          verificationResult,
          updatedAt: new Date().toISOString(),
        })
      );

      const saved = this.database.update(verified);
      if (saved) {
        persistRecommendationLearningLocally(verified);
      }
      return saved ? cloneRecord(verified) : null;
    } catch {
      const failed = normalizeHistoricalMatchRecord({
        ...existing,
        result: buildMatchResult(input),
        status: "FAILED",
        updatedAt: new Date().toISOString(),
      });
      this.database.update(failed);
      return cloneRecord(failed);
    }
  }

  getMatch(id: HistoricalMatchId): HistoricalMatchRecord | null {
    const record = this.database.findById(id);
    return record ? cloneRecord(record) : null;
  }

  getAllMatches(): HistoricalMatchRecord[] {
    return this.database.findAll().map((record) => cloneRecord(record));
  }

  getStats(): MatchHistoryStats {
    return buildMatchHistoryStats(this.getAllMatches());
  }

  clearAll(): void {
    this.database.clear();
  }
}

export function createHistoryRepository(
  database: MatchDatabase = getDefaultMatchDatabase()
): HistoryRepository {
  return new HistoryRepository(database);
}
