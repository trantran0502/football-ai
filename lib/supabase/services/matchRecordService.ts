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

type MatchRecordInsertRow =
  Database["public"]["Tables"]["match_records"]["Insert"];

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
  input: SaveMatchInput
): Promise<SaveMatchOutcome> {
  const matchDate = input.matchDate ?? input.date;
  const duplicate = await findMatchRecordByKeyInSupabase(
    matchDate,
    input.homeTeam,
    input.awayTeam
  );

  if (duplicate) {
    return { status: "duplicate", record: cloneRecord(duplicate) };
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
    createdAt: now,
    updatedAt: now,
  });

  const saved = await insertMatchRecordToSupabase(record);
  return { status: "created", record: cloneRecord(saved) };
}

export async function saveMatchFromAnalysisInSupabase(
  rawOdds: string,
  report: AnalysisReport,
  matchDate: string = new Date().toISOString().split("T")[0]
): Promise<SaveMatchOutcome> {
  const id = generateHistoricalMatchId();
  const capturedAt = new Date().toISOString();
  const snapshot = createAnalysisSnapshotFromReport(report, capturedAt, id, matchDate);

  return saveMatchIfNewInSupabase({
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
  });
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

    return updateMatchRecordInSupabase(verified);
  } catch {
    const failed = normalizeHistoricalMatchRecord({
      ...existing,
      result: buildMatchResult(input),
      status: "FAILED",
      updatedAt: new Date().toISOString(),
    });
    return updateMatchRecordInSupabase(failed);
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
