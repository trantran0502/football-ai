import type { AnalysisReport } from "@/lib/analysis/types";
import { runMatchVerification } from "@/lib/database/matchVerification";
import {
  buildMatchResult,
  createAnalysisSnapshot,
  createAnalysisSnapshotFromReport,
  generateHistoricalMatchId,
  isAnalysisSnapshot,
  normalizeHistoricalMatchRecord,
  type HistoricalMatchRecord,
  type SaveMatchInput,
  type SaveMatchOutcome,
  type UpdateMatchResultInput,
} from "@/lib/database/matchSchema";
import { enrichRecordWithReplayValidation } from "@/lib/replay/replayBuilder";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  assertSupabaseData,
  throwIfSupabaseError,
} from "@/lib/supabase/errors";
import type { Database } from "@/lib/supabase/database.types";
import {
  matchRecordDomainToRow,
  matchRecordRowToDomain,
} from "@/lib/supabase/mappers/matchRecordMapper";
import {
  assessAnalysisCompleteness,
  assessProductionRecommendationCompleteness,
  buildEnrichedHistoricalBackfillRecord,
  hasCompleteAnalysisRecord,
  isConflictingEnrichmentTarget,
  isIncompleteHistoricalBackfillRecord,
} from "@/lib/supabase/services/matchRecordCompletenessGuard";
import {
  assessRecommendationDataCompleteness,
  buildAnalysisDataCompletenessMetadata,
} from "@/lib/analysis/analysisDataCompleteness";
import { captureReplayRawSources } from "@/lib/replay/replayRawCapture";

type MatchRecordInsertRow =
  Database["public"]["Tables"]["match_records"]["Insert"];

export interface MatchRecordPersistenceDependencies {
  findByKey?: typeof findMatchRecordByKeyInSupabase;
  findByFixtureId?: typeof findMatchRecordByFixtureIdInSupabase;
  insert?: typeof insertMatchRecordToSupabase;
  update?: typeof updateMatchRecordInSupabase;
}

function toInsertRow(record: HistoricalMatchRecord): MatchRecordInsertRow {
  return matchRecordDomainToRow(record) as MatchRecordInsertRow;
}

function cloneRecord(record: HistoricalMatchRecord): HistoricalMatchRecord {
  return structuredClone(normalizeHistoricalMatchRecord(record));
}

export async function findMatchRecordByKeyInSupabase(
  matchDate: string,
  homeTeam: string,
  awayTeam: string
): Promise<HistoricalMatchRecord | null> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("match_records")
    .select("*")
    .eq("match_date", matchDate)
    .eq("home_team", homeTeam)
    .eq("away_team", awayTeam)
    .neq("status", "CANCELLED")
    .maybeSingle();

  const data = assertSupabaseData(result);
  return data ? matchRecordRowToDomain(data) : null;
}

export async function findMatchRecordByFixtureIdInSupabase(
  fixtureId: number
): Promise<HistoricalMatchRecord | null> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("match_records")
    .select("*")
    .eq("fixture_id", fixtureId)
    .maybeSingle();

  const data = assertSupabaseData(result);
  return data ? matchRecordRowToDomain(data) : null;
}

async function resolveExistingMatchRecordForSave(
  input: SaveMatchInput,
  deps: MatchRecordPersistenceDependencies
): Promise<HistoricalMatchRecord | null> {
  const findByFixtureId = deps.findByFixtureId ?? findMatchRecordByFixtureIdInSupabase;
  const findByKey = deps.findByKey ?? findMatchRecordByKeyInSupabase;

  if (typeof input.fixtureId === "number") {
    const byFixture = await findByFixtureId(input.fixtureId);
    if (byFixture) {
      return byFixture;
    }
  }

  const matchDate = input.matchDate ?? input.date;
  return findByKey(matchDate, input.homeTeam, input.awayTeam);
}

export async function insertMatchRecordToSupabase(
  record: HistoricalMatchRecord
): Promise<HistoricalMatchRecord> {
  const supabase = getSupabaseAdmin();
  const row = toInsertRow(record);
  const result = await supabase
    .from("match_records")
    .insert([row as never])
    .select("*")
    .single();

  throwIfSupabaseError(result.error, result.status ?? null);
  const data = assertSupabaseData(result);
  return matchRecordRowToDomain(data);
}

export async function updateMatchRecordInSupabase(
  record: HistoricalMatchRecord
): Promise<HistoricalMatchRecord | null> {
  const supabase = getSupabaseAdmin();
  const row = toInsertRow(record);
  const result = await supabase
    .from("match_records")
    .update(row as never)
    .eq("id", record.id)
    .select("*")
    .maybeSingle();

  throwIfSupabaseError(result.error, result.status ?? null);
  const data = assertSupabaseData(result);
  return data ? matchRecordRowToDomain(data) : null;
}

export async function saveMatchIfNewInSupabase(
  input: SaveMatchInput,
  deps: MatchRecordPersistenceDependencies = {}
): Promise<SaveMatchOutcome> {
  const insert = deps.insert ?? insertMatchRecordToSupabase;
  const update = deps.update ?? updateMatchRecordInSupabase;
  const matchDate = input.matchDate ?? input.date;
  const now = new Date().toISOString();
  const analysisSnapshot = resolveAnalysisSnapshot(
    input.analysis,
    now,
    input.id,
    matchDate
  );
  const candidates = input.candidates ?? analysisSnapshot?.candidates ?? [];
  const completenessIssue = assessAnalysisCompleteness({
    rawOdds: input.rawOdds,
    marketSelections: input.marketSelections,
    analysisSnapshot,
  });

  const existing = await resolveExistingMatchRecordForSave(input, deps);

  if (existing) {
    if (hasCompleteAnalysisRecord(existing)) {
      return { status: "duplicate", record: cloneRecord(existing) };
    }

    const conflict = isConflictingEnrichmentTarget(existing);
    if (conflict) {
      return {
        status: "conflicting_record",
        record: cloneRecord(existing),
        reason: conflict.reason,
      };
    }

    if (isIncompleteHistoricalBackfillRecord(existing)) {
      if (completenessIssue) {
        return {
          status: "incomplete_analysis_rejected",
          record: cloneRecord(existing),
          reason: completenessIssue,
        };
      }

      const enriched = normalizeHistoricalMatchRecord(
        buildEnrichedHistoricalBackfillRecord(
          existing,
          input,
          analysisSnapshot!,
          now
        )
      );
      const saved = await update(enriched);
      if (!saved) {
        throw new Error(
          `Failed to enrich historical backfill record ${existing.id}.`
        );
      }
      return { status: "enriched", record: cloneRecord(saved) };
    }

    if (completenessIssue) {
      return {
        status: "incomplete_analysis_rejected",
        record: cloneRecord(existing),
        reason: completenessIssue,
      };
    }

    return { status: "duplicate", record: cloneRecord(existing) };
  }

  if (completenessIssue) {
    return {
      status: "incomplete_analysis_rejected",
      record: null,
      reason: completenessIssue,
    };
  }

  const matchId = input.id ?? generateHistoricalMatchId();
  const record = normalizeHistoricalMatchRecord({
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
    source: "app",
    createdAt: now,
    updatedAt: now,
  });

  const saved = await insert(record);
  return { status: "created", record: cloneRecord(saved) };
}

export async function saveMatchFromAnalysisInSupabase(
  rawOdds: string,
  report: AnalysisReport,
  matchDate: string = new Date().toISOString().split("T")[0],
  deps: MatchRecordPersistenceDependencies = {}
): Promise<SaveMatchOutcome> {
  const id = generateHistoricalMatchId();
  const capturedAt = new Date().toISOString();
  const rawSources = await captureReplayRawSources({ report, matchDate });
  const assessment = assessRecommendationDataCompleteness({
    report,
    matchId: id,
    profileDiagnostics: report.analysisContext?.profileDiagnostics,
    rawSources,
  });
  const dataCompleteness = buildAnalysisDataCompletenessMetadata(assessment, capturedAt);
  const snapshot = createAnalysisSnapshotFromReport(report, capturedAt, id, matchDate, {
    rawSources,
    dataCompleteness,
  });

  const existing = await resolveExistingMatchRecordForSave(
    {
      id,
      date: matchDate,
      matchDate,
      league: report.match.league ?? "",
      homeTeam: report.match.homeTeam,
      awayTeam: report.match.awayTeam,
      rawOdds,
      marketSelections: report.markets,
      fixtureId: report.match.fixtureId ?? null,
      leagueId: report.match.leagueId ?? null,
      season: report.match.season ?? null,
      homeTeamId: report.match.homeTeamId ?? null,
      awayTeamId: report.match.awayTeamId ?? null,
    },
    deps
  );
  const isBackfillEnrichment =
    existing !== null && isIncompleteHistoricalBackfillRecord(existing);

  if (!isBackfillEnrichment) {
    const recommendationIssue = assessProductionRecommendationCompleteness(snapshot);
    if (recommendationIssue) {
      return {
        status: "incomplete_analysis_rejected",
        record: null,
        reason: recommendationIssue,
      };
    }
  }

  return saveMatchIfNewInSupabase(
    {
      id,
      date: matchDate,
      matchDate,
      league: report.match.league ?? "",
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
    },
    deps
  );
}

export async function verifyMatchInSupabase(
  id: string,
  input: UpdateMatchResultInput
): Promise<HistoricalMatchRecord | null> {
  const supabase = getSupabaseAdmin();
  const existingResult = await supabase
    .from("match_records")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const existingRow = assertSupabaseData(existingResult);
  if (!existingRow) {
    return null;
  }

  const existing = matchRecordRowToDomain(existingRow);
  if (existing.status !== "PENDING") {
    return null;
  }

  try {
    const withResult = normalizeHistoricalMatchRecord({
      ...existing,
      result: buildMatchResult(input),
      updatedAt: new Date().toISOString(),
    });

    const poolResult = await supabase
      .from("match_records")
      .select("*")
      .not("result", "is", null)
      .neq("id", id);

    const poolRows = assertSupabaseData(poolResult) ?? [];
    const verifiedPool = poolRows.map((row) =>
      normalizeHistoricalMatchRecord({
        ...matchRecordRowToDomain(row),
        result: matchRecordRowToDomain(row).result!,
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

    const saved = await updateMatchRecordInSupabase(verified);
    if (saved?.status === "VERIFIED") {
      const { persistRecommendationLearningForVerifiedMatch } = await import(
        "@/lib/recommendation/recommendationLearningPersistence"
      );
      const persistOutcome = await persistRecommendationLearningForVerifiedMatch(saved);
      if (persistOutcome.error) {
        console.error(
          `[recommendation_learning] persist failed for ${saved.id}: ${persistOutcome.error}`
        );
      }
    }
    return saved;
  } catch (error) {
    const verificationError = error instanceof Error ? error : new Error(String(error));
    const failed = normalizeHistoricalMatchRecord({
      ...existing,
      result: buildMatchResult(input),
      status: "FAILED",
      updatedAt: new Date().toISOString(),
    });

    try {
      return await updateMatchRecordInSupabase(failed);
    } catch (updateError) {
      const updateMessage =
        updateError instanceof Error ? updateError.message : String(updateError);
      throw new Error(
        `verifyMatchInSupabase failed for ${id}: ${verificationError.message}; failed-status update: ${updateMessage}`
      );
    }
  }
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
  if (
    "match" in analysis &&
    "markets" in analysis &&
    "crossMarketValidation" in analysis
  ) {
    return createAnalysisSnapshotFromReport(analysis, capturedAt, matchId, matchDate);
  }
  if (isAnalysisSnapshot(analysis)) {
    return analysis;
  }
  return createAnalysisSnapshot(analysis, capturedAt);
}
