import {
  buildMatchResult,
  createAnalysisSnapshotFromReport,
  generateHistoricalMatchId,
  normalizeHistoricalMatchRecord,
  type HistoricalMatchRecord,
  type SaveMatchInput,
  type SaveMatchOutcome,
  type UpdateMatchResultInput,
} from "@/lib/database/matchSchema";
import { enrichRecordWithReplayValidation } from "@/lib/replay/replayBuilder";
import { runMatchVerification } from "@/lib/database/matchVerification";
import { persistRecommendationLearningForVerifiedMatch } from "@/lib/recommendation/recommendationLearningPersistence";
import { filterTrulyPendingVerificationRecords } from "@/lib/supabase/services/matchRecordPendingPolicy";
import type { AnalysisReport } from "@/lib/analysis/types";
import {
  assessRecommendationDataCompleteness,
  buildAnalysisDataCompletenessMetadata,
} from "@/lib/analysis/analysisDataCompleteness";
import { assessAnalysisCompleteness, assessProductionRecommendationCompleteness } from "@/lib/supabase/services/matchRecordCompletenessGuard";
import { captureReplayRawSources } from "@/lib/replay/replayRawCapture";

const store = new Map<string, HistoricalMatchRecord>();

export function resetInMemoryProductionStore(): void {
  store.clear();
}

export function listInMemoryProductionRecords(): HistoricalMatchRecord[] {
  return [...store.values()].map((record) => structuredClone(record));
}

export async function saveMatchInMemory(
  rawOdds: string,
  report: AnalysisReport,
  matchDate: string
): Promise<SaveMatchOutcome> {
  const duplicate = [...store.values()].find(
    (record) =>
      record.matchDate === matchDate &&
      record.homeTeam === report.match.homeTeam &&
      record.awayTeam === report.match.awayTeam &&
      record.status !== "CANCELLED"
  );

  if (duplicate) {
    return { status: "duplicate", record: structuredClone(duplicate) };
  }

  const now = new Date().toISOString();
  const id = generateHistoricalMatchId();
  const rawSources = await captureReplayRawSources({ report, matchDate });
  const assessment = assessRecommendationDataCompleteness({
    report,
    matchId: id,
    profileDiagnostics: report.analysisContext?.profileDiagnostics,
    rawSources,
  });
  const dataCompleteness = buildAnalysisDataCompletenessMetadata(assessment, now);
  const snapshot = createAnalysisSnapshotFromReport(report, now, id, matchDate, {
    rawSources,
    dataCompleteness,
  });
  const completenessIssue =
    assessAnalysisCompleteness({
      rawOdds,
      marketSelections: report.markets,
      analysisSnapshot: snapshot,
    }) ?? assessProductionRecommendationCompleteness(snapshot);
  if (completenessIssue) {
    return {
      status: "incomplete_analysis_rejected",
      record: null,
      reason: completenessIssue,
    };
  }
  const record = normalizeHistoricalMatchRecord({
    id,
    date: matchDate,
    matchDate,
    league: report.match.league ?? "",
    homeTeam: report.match.homeTeam,
    awayTeam: report.match.awayTeam,
    rawOdds,
    marketSelections: structuredClone(report.markets),
    result: null,
    analysisSnapshot: structuredClone(snapshot),
    candidates: structuredClone(report.candidates),
    status: "PENDING",
    verificationResult: null,
    fixtureId: report.match.fixtureId ?? null,
    leagueId: report.match.leagueId ?? null,
    season: report.match.season ?? null,
    homeTeamId: report.match.homeTeamId ?? null,
    awayTeamId: report.match.awayTeamId ?? null,
    createdAt: now,
    updatedAt: now,
  });

  store.set(record.id, record);
  return { status: "created", record: structuredClone(record) };
}

export async function saveMatchIfNewInMemory(
  input: SaveMatchInput
): Promise<SaveMatchOutcome> {
  const matchDate = input.matchDate ?? input.date;
  const duplicate = [...store.values()].find(
    (record) =>
      record.matchDate === matchDate &&
      record.homeTeam === input.homeTeam &&
      record.awayTeam === input.awayTeam &&
      record.status !== "CANCELLED"
  );
  if (duplicate) {
    return { status: "duplicate", record: structuredClone(duplicate) };
  }

  const now = new Date().toISOString();
  const record = normalizeHistoricalMatchRecord({
    id: input.id ?? generateHistoricalMatchId(),
    date: matchDate,
    matchDate,
    league: input.league,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    rawOdds: input.rawOdds,
    marketSelections: structuredClone(input.marketSelections),
    result: null,
    analysisSnapshot: null,
    candidates: structuredClone(input.candidates ?? []),
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
  store.set(record.id, record);
  return { status: "created", record: structuredClone(record) };
}

export async function verifyMatchInMemory(
  id: string,
  input: UpdateMatchResultInput
): Promise<HistoricalMatchRecord | null> {
  const existing = store.get(id);
  if (!existing || existing.status !== "PENDING") {
    return existing ? structuredClone(existing) : null;
  }

  const withResult = normalizeHistoricalMatchRecord({
    ...existing,
    result: buildMatchResult(input),
    updatedAt: new Date().toISOString(),
  });

  const verifiedPool = [...store.values()]
    .filter((record) => record.result !== null && record.id !== id)
    .map((record) =>
      normalizeHistoricalMatchRecord({
        ...record,
        result: record.result!,
      })
    );

  try {
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
    store.set(id, verified);
    const persistOutcome = await persistRecommendationLearningForVerifiedMatch(verified);
    if (persistOutcome.error) {
      console.error(
        `[recommendation_learning] persist failed for ${verified.id}: ${persistOutcome.error}`
      );
    }
    return structuredClone(verified);
  } catch {
    const failed = normalizeHistoricalMatchRecord({
      ...withResult,
      status: "FAILED",
      updatedAt: new Date().toISOString(),
    });
    store.set(id, failed);
    return structuredClone(failed);
  }
}

export async function listPendingInMemory(): Promise<HistoricalMatchRecord[]> {
  return filterTrulyPendingVerificationRecords([...store.values()]).map((record) =>
    structuredClone(record)
  );
}
