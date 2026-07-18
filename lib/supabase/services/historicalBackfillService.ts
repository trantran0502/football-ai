import {
  buildMatchResult,
  generateHistoricalMatchId,
  normalizeHistoricalMatchRecord,
  type HistoricalMatchRecord,
} from "@/lib/database/matchSchema";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  assertSupabaseData,
  throwIfSupabaseError,
} from "@/lib/supabase/errors";
import {
  matchRecordDomainToRow,
  matchRecordRowToDomain,
} from "@/lib/supabase/mappers/matchRecordMapper";

export interface HistoricalBackfillInsertInput {
  fixture: ApiFootballFixtureRecord;
}

export interface HistoricalBackfillDuplicateCheck {
  existingFixtureIds: Set<number>;
  existingMatchKeys: Set<string>;
}

function buildMatchKey(matchDate: string, homeTeam: string, awayTeam: string): string {
  return `${matchDate}|${homeTeam.trim().toLowerCase()}|${awayTeam.trim().toLowerCase()}`;
}

export function buildHistoricalBackfillRecord(
  input: HistoricalBackfillInsertInput,
  now = new Date().toISOString()
): HistoricalMatchRecord {
  const { fixture } = input;

  return normalizeHistoricalMatchRecord({
    id: generateHistoricalMatchId(),
    date: fixture.date,
    matchDate: fixture.date,
    league: fixture.league ?? "",
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    rawOdds: "",
    marketSelections: [],
    candidates: [],
    analysisSnapshot: null,
    result: buildMatchResult({
      fullTimeHomeGoals: fixture.homeGoals!,
      fullTimeAwayGoals: fixture.awayGoals!,
      halfTimeHomeGoals: fixture.halfTimeHome!,
      halfTimeAwayGoals: fixture.halfTimeAway!,
    }),
    status: "VERIFIED",
    verificationResult: null,
    fixtureId: fixture.fixtureId,
    leagueId: fixture.leagueId,
    season: fixture.season,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    createdAt: now,
    updatedAt: now,
  });
}

export async function loadHistoricalBackfillDuplicateCheck(
  fixtureIds: number[]
): Promise<HistoricalBackfillDuplicateCheck> {
  const existingFixtureIds = new Set<number>();
  const existingMatchKeys = new Set<string>();

  if (fixtureIds.length === 0) {
    return { existingFixtureIds, existingMatchKeys };
  }

  const supabase = getSupabaseAdmin();
  const fixtureResult = await supabase
    .from("match_records")
    .select("fixture_id")
    .in("fixture_id", fixtureIds);

  const fixtureRows = assertSupabaseData(fixtureResult) ?? [];
  for (const row of fixtureRows as Array<{ fixture_id: number | null }>) {
    if (typeof row.fixture_id === "number") {
      existingFixtureIds.add(row.fixture_id);
    }
  }

  return { existingFixtureIds, existingMatchKeys };
}

export async function insertHistoricalBackfillRecord(
  record: HistoricalMatchRecord
): Promise<HistoricalMatchRecord> {
  const supabase = getSupabaseAdmin();
  const row = matchRecordDomainToRow(record, {
    source: "historical_backfill",
    schemaVersion: 1,
  });

  const result = await supabase
    .from("match_records")
    .insert([row as never])
    .select("*")
    .single();

  throwIfSupabaseError(result.error, result.status ?? null);
  const data = assertSupabaseData(result);
  return matchRecordRowToDomain(data);
}

export function isHistoricalBackfillDuplicate(
  fixture: ApiFootballFixtureRecord,
  check: HistoricalBackfillDuplicateCheck
): boolean {
  if (check.existingFixtureIds.has(fixture.fixtureId)) {
    return true;
  }

  const matchKey = buildMatchKey(fixture.date, fixture.homeTeam, fixture.awayTeam);
  return check.existingMatchKeys.has(matchKey);
}

export function registerHistoricalBackfillDuplicate(
  fixture: ApiFootballFixtureRecord,
  check: HistoricalBackfillDuplicateCheck
): void {
  check.existingFixtureIds.add(fixture.fixtureId);
  check.existingMatchKeys.add(
    buildMatchKey(fixture.date, fixture.homeTeam, fixture.awayTeam)
  );
}

export {
  findMatchRecordByFixtureIdInSupabase,
} from "@/lib/supabase/services/matchRecordService";

export async function loadMatchKeysForDateInSupabase(
  matchDate: string
): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("match_records")
    .select("match_date,home_team,away_team")
    .eq("match_date", matchDate);

  const rows = assertSupabaseData(result) ?? [];
  const keys = new Set<string>();
  for (const row of rows as Array<{
    match_date: string;
    home_team: string;
    away_team: string;
  }>) {
    keys.add(buildMatchKey(row.match_date, row.home_team, row.away_team));
  }
  return keys;
}

