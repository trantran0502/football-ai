import {
  EMPTY_TEAM_MATCH_CONTEXT,
  type MatchContextSnapshot,
} from "@/lib/analysis/featureScore/providers/matchContextProvider";
import { isOfficialAnnouncementUrl } from "@/lib/providers/matchContext/matchContextOfficialSource";

export interface OfficialMatchContextFields {
  matchImportance: string | null;
  mustWin: boolean | null;
  alreadyQualified: boolean | null;
  eliminated: boolean | null;
  neutralVenue: boolean | null;
  travelDistance: number | null;
  restDays: number | null;
  fixtureCongestion: boolean | null;
  weatherImpact: string | null;
}

export interface OfficialRecentFormRecord {
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  sourceUrl?: string;
}

function normalizeTeamName(value: string): string {
  return value.trim().toLowerCase();
}

function teamsMatch(left: string, right: string): boolean {
  const a = normalizeTeamName(left);
  const b = normalizeTeamName(right);
  return a === b || a.includes(b) || b.includes(a);
}

function computeDataFreshnessDays(
  referenceDate: string,
  sourceTimestamp: string | null
): number | null {
  if (!sourceTimestamp) {
    return null;
  }
  const reference = new Date(`${referenceDate}T00:00:00Z`);
  const source = new Date(sourceTimestamp);
  if (Number.isNaN(reference.getTime()) || Number.isNaN(source.getTime())) {
    return null;
  }
  const diffMs = reference.getTime() - source.getTime();
  return Math.max(0, Math.round(diffMs / (24 * 60 * 60 * 1000)));
}

function daysBetween(referenceDate: string, matchDate: string): number | null {
  const reference = new Date(`${referenceDate}T00:00:00Z`);
  const match = new Date(`${matchDate}T00:00:00Z`);
  if (Number.isNaN(reference.getTime()) || Number.isNaN(match.getTime())) {
    return null;
  }
  const diffMs = reference.getTime() - match.getTime();
  if (diffMs < 0) {
    return null;
  }
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

function computeRestDaysFromOfficialForm(input: {
  homeTeam: string;
  awayTeam: string;
  records: OfficialRecentFormRecord[];
  referenceDate: string;
}): { homeRest: number | null; awayRest: number | null; averageRest: number | null } {
  const officialRecords = input.records.filter((record) =>
    isOfficialAnnouncementUrl(record.sourceUrl)
  );
  if (officialRecords.length === 0) {
    return { homeRest: null, awayRest: null, averageRest: null };
  }

  let homeRest: number | null = null;
  let awayRest: number | null = null;

  for (const record of officialRecords) {
    const rest = daysBetween(input.referenceDate, record.matchDate);
    if (rest === null) {
      continue;
    }

    if (teamsMatch(record.homeTeam, input.homeTeam) || teamsMatch(record.awayTeam, input.homeTeam)) {
      homeRest = homeRest === null ? rest : Math.min(homeRest, rest);
    }
    if (teamsMatch(record.homeTeam, input.awayTeam) || teamsMatch(record.awayTeam, input.awayTeam)) {
      awayRest = awayRest === null ? rest : Math.min(awayRest, rest);
    }
  }

  if (homeRest === null || awayRest === null) {
    return { homeRest, awayRest, averageRest: null };
  }

  return {
    homeRest,
    awayRest,
    averageRest: Math.round((homeRest + awayRest) / 2),
  };
}

export function countConfirmedMatchContextFields(
  fields: OfficialMatchContextFields
): number {
  let count = 0;
  if (fields.matchImportance !== null) count += 1;
  if (fields.mustWin !== null) count += 1;
  if (fields.alreadyQualified !== null) count += 1;
  if (fields.eliminated !== null) count += 1;
  if (fields.neutralVenue !== null) count += 1;
  if (fields.travelDistance !== null) count += 1;
  if (fields.restDays !== null) count += 1;
  if (fields.fixtureCongestion !== null) count += 1;
  if (fields.weatherImpact !== null) count += 1;
  return count;
}

export function buildMatchContextSnapshotFromOfficialFields(input: {
  fields: OfficialMatchContextFields;
  homeRestDays: number | null;
  awayRestDays: number | null;
  referenceDate: string;
  sourceTimestamp: string | null;
}): MatchContextSnapshot {
  const sampleSize = countConfirmedMatchContextFields(input.fields);
  const dataFreshnessDays = computeDataFreshnessDays(
    input.referenceDate,
    input.sourceTimestamp
  );

  return {
    home: {
      ...EMPTY_TEAM_MATCH_CONTEXT,
      daysSinceLastMatch: input.homeRestDays,
      mustWin: input.fields.mustWin,
      alreadyQualified: input.fields.alreadyQualified,
      alreadyEliminated: input.fields.eliminated,
      travelDistanceKm: input.fields.travelDistance,
    },
    away: {
      ...EMPTY_TEAM_MATCH_CONTEXT,
      daysSinceLastMatch: input.awayRestDays,
      mustWin: input.fields.mustWin,
      alreadyQualified: input.fields.alreadyQualified,
      alreadyEliminated: input.fields.eliminated,
      travelDistanceKm: input.fields.travelDistance,
    },
    isNeutralVenue: input.fields.neutralVenue,
    weatherCondition: input.fields.weatherImpact,
    temperature: null,
    humidity: null,
    altitude: null,
    competitionStage: input.fields.matchImportance,
    mustWin: input.fields.mustWin,
    alreadyQualified: input.fields.alreadyQualified,
    alreadyEliminated: input.fields.eliminated,
    derbyMatch: null,
    cupMatch: null,
    leagueMatch: null,
    internationalBreak: null,
    matchImportance: input.fields.matchImportance,
    eliminated: input.fields.eliminated,
    neutralVenue: input.fields.neutralVenue,
    travelDistance: input.fields.travelDistance,
    restDays: input.fields.restDays,
    fixtureCongestion: input.fields.fixtureCongestion,
    weatherImpact: input.fields.weatherImpact,
    dataFreshnessDays,
    sampleSize,
  };
}

export function buildEmptyMatchContextSnapshot(): MatchContextSnapshot {
  return {
    home: { ...EMPTY_TEAM_MATCH_CONTEXT },
    away: { ...EMPTY_TEAM_MATCH_CONTEXT },
    isNeutralVenue: null,
    weatherCondition: null,
    temperature: null,
    humidity: null,
    altitude: null,
    competitionStage: null,
    mustWin: null,
    alreadyQualified: null,
    alreadyEliminated: null,
    derbyMatch: null,
    cupMatch: null,
    leagueMatch: null,
    internationalBreak: null,
    matchImportance: null,
    eliminated: null,
    neutralVenue: null,
    travelDistance: null,
    restDays: null,
    fixtureCongestion: null,
    weatherImpact: null,
    dataFreshnessDays: null,
    sampleSize: 0,
  };
}

export function extractOfficialMatchContextFields(input: {
  matchStatus: {
    importance?: string | null;
    mustWin?: boolean | null;
    alreadyQualified?: boolean | null;
    alreadyEliminated?: boolean | null;
    weather?: string | null;
    longTravelAway?: boolean | null;
    congestedSchedule?: boolean | null;
  } | null;
  homeTeam: string;
  awayTeam: string;
  recentFormRecords: OfficialRecentFormRecord[];
  referenceDate: string;
}): OfficialMatchContextFields {
  const status = input.matchStatus;

  const matchImportance =
    typeof status?.importance === "string" && status.importance.trim()
      ? status.importance.trim()
      : null;
  const mustWin = typeof status?.mustWin === "boolean" ? status.mustWin : null;
  const alreadyQualified =
    typeof status?.alreadyQualified === "boolean" ? status.alreadyQualified : null;
  const eliminated =
    typeof status?.alreadyEliminated === "boolean" ? status.alreadyEliminated : null;
  const fixtureCongestion =
    typeof status?.congestedSchedule === "boolean" ? status.congestedSchedule : null;
  const weatherImpact =
    typeof status?.weather === "string" && status.weather.trim()
      ? status.weather.trim()
      : null;

  const rest = computeRestDaysFromOfficialForm({
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    records: input.recentFormRecords,
    referenceDate: input.referenceDate,
  });

  return {
    matchImportance,
    mustWin,
    alreadyQualified,
    eliminated,
    neutralVenue: null,
    travelDistance: null,
    restDays: rest.averageRest,
    fixtureCongestion,
    weatherImpact,
  };
}

export function resolveRestDaysForSnapshot(input: {
  homeTeam: string;
  awayTeam: string;
  recentFormRecords: OfficialRecentFormRecord[];
  referenceDate: string;
}): { homeRestDays: number | null; awayRestDays: number | null } {
  const rest = computeRestDaysFromOfficialForm({
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    records: input.recentFormRecords,
    referenceDate: input.referenceDate,
  });
  return {
    homeRestDays: rest.homeRest,
    awayRestDays: rest.awayRest,
  };
}
