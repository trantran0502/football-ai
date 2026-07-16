import {
  EMPTY_SQUAD_AVAILABILITY,
  type SquadAvailabilitySnapshot,
  type TeamSquadAvailability,
} from "@/lib/analysis/featureScore/providers/squadAvailabilityProvider";
import {
  classifySquadPlayerStatus,
  isOfficialAnnouncementUrl,
  type SquadPlayerStatus,
} from "@/lib/providers/squadAvailability/squadAvailabilityOfficialSource";

export interface OfficialSquadPlayerRecord {
  teamName: string;
  playerName: string;
  status: SquadPlayerStatus;
  sourceUrl: string;
  isKeyPlayer?: boolean;
}

export interface SquadAvailabilityNormalizationStats {
  officialRecordCount: number;
  filteredUnofficialCount: number;
  filteredUnconfirmedCount: number;
}

function normalizeTeamName(value: string): string {
  return value.trim().toLowerCase();
}

function teamsMatch(left: string, right: string): boolean {
  const a = normalizeTeamName(left);
  const b = normalizeTeamName(right);
  return a === b || a.includes(b) || b.includes(a);
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
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

function computeImpactScore(input: {
  injuredCount: number;
  suspendedCount: number;
  doubtfulCount: number;
  unavailableCount: number;
  keyPlayersMissing: number;
}): number {
  const weighted =
    input.injuredCount * 0.15 +
    input.suspendedCount * 0.22 +
    input.unavailableCount * 0.18 +
    input.doubtfulCount * 0.08 +
    input.keyPlayersMissing * 0.25;
  return roundMetric(Math.min(1, weighted / 4));
}

function buildTeamAvailability(
  teamName: string,
  records: OfficialSquadPlayerRecord[]
): TeamSquadAvailability {
  const teamRecords = records.filter((record) => teamsMatch(record.teamName, teamName));

  let injuredCount = 0;
  let suspendedCount = 0;
  let doubtfulCount = 0;
  let unavailableCount = 0;
  const keyPlayersMissing: string[] = [];

  for (const record of teamRecords) {
    switch (record.status) {
      case "injured":
        injuredCount += 1;
        break;
      case "suspended":
        suspendedCount += 1;
        break;
      case "doubtful":
        doubtfulCount += 1;
        break;
      case "unavailable":
        unavailableCount += 1;
        break;
    }

    if (
      record.isKeyPlayer &&
      (record.status === "injured" ||
        record.status === "suspended" ||
        record.status === "unavailable")
    ) {
      keyPlayersMissing.push(record.playerName);
    }
  }

  const confirmedOut = injuredCount + suspendedCount + unavailableCount;
  const hasTeamRecords = teamRecords.length > 0;

  return {
    injuries: hasTeamRecords ? injuredCount : null,
    suspensions: hasTeamRecords ? suspendedCount : null,
    doubtfulPlayers: hasTeamRecords ? doubtfulCount : null,
    expectedRotationCount: null,
    missingStartingXI: hasTeamRecords
      ? keyPlayersMissing.length > 0
        ? keyPlayersMissing.length
        : confirmedOut
      : null,
    missingAttackers: null,
    missingMidfielders: null,
    missingDefenders: null,
    missingGoalkeeper: null,
    squadDepthScore: null,
    daysSinceLastMatch: null,
    daysUntilNextMatch: null,
  };
}

export function buildSquadAvailabilitySnapshotFromOfficialRecords(input: {
  homeTeam: string;
  awayTeam: string;
  records: OfficialSquadPlayerRecord[];
  referenceDate: string;
  sourceTimestamp: string | null;
  stats?: SquadAvailabilityNormalizationStats;
}): SquadAvailabilitySnapshot {
  const home = buildTeamAvailability(input.homeTeam, input.records);
  const away = buildTeamAvailability(input.awayTeam, input.records);

  const injuredCount =
    (home.injuries ?? 0) + (away.injuries ?? 0);
  const suspendedCount =
    (home.suspensions ?? 0) + (away.suspensions ?? 0);
  const doubtfulCount =
    (home.doubtfulPlayers ?? 0) + (away.doubtfulPlayers ?? 0);
  const unavailableCount = input.records.filter(
    (record) => record.status === "unavailable"
  ).length;
  const keyPlayers = input.records
    .filter(
      (record) =>
        record.isKeyPlayer &&
        (record.status === "injured" ||
          record.status === "suspended" ||
          record.status === "unavailable")
    )
    .map((record) => record.playerName);

  const sampleSize = input.records.length;
  const dataFreshnessDays = computeDataFreshnessDays(
    input.referenceDate,
    input.sourceTimestamp
  );

  return {
    home,
    away,
    injuredCount,
    suspendedCount,
    doubtfulCount,
    unavailableCount,
    keyPlayersMissing: keyPlayers,
    impactScore: computeImpactScore({
      injuredCount,
      suspendedCount,
      doubtfulCount,
      unavailableCount,
      keyPlayersMissing: keyPlayers.length,
    }),
    dataFreshnessDays,
    sampleSize,
  };
}

export function buildEmptySquadAvailabilitySnapshot(): SquadAvailabilitySnapshot {
  return {
    home: { ...EMPTY_SQUAD_AVAILABILITY },
    away: { ...EMPTY_SQUAD_AVAILABILITY },
    injuredCount: null,
    suspendedCount: null,
    doubtfulCount: null,
    unavailableCount: null,
    keyPlayersMissing: [],
    impactScore: null,
    dataFreshnessDays: null,
    sampleSize: 0,
  };
}

export function normalizeOfficialGooglePlayerRecords(input: {
  injuries: Array<{
    teamName: string;
    playerName: string;
    reason?: string;
    status?: string;
    sourceUrl?: string;
  }>;
  suspensions: Array<{
    teamName: string;
    playerName: string;
    reason?: string;
    status?: string;
    sourceUrl?: string;
  }>;
  keyPlayerNames?: string[];
}): {
  records: OfficialSquadPlayerRecord[];
  stats: SquadAvailabilityNormalizationStats;
} {
  const stats: SquadAvailabilityNormalizationStats = {
    officialRecordCount: 0,
    filteredUnofficialCount: 0,
    filteredUnconfirmedCount: 0,
  };
  const records: OfficialSquadPlayerRecord[] = [];
  const keyPlayers = new Set(
    (input.keyPlayerNames ?? []).map((name) => normalizeTeamName(name))
  );

  for (const item of [...input.injuries, ...input.suspensions]) {
    if (!isOfficialAnnouncementUrl(item.sourceUrl)) {
      stats.filteredUnofficialCount += 1;
      continue;
    }

    const classified = classifySquadPlayerStatus(item.status, item.reason);
    if (!classified) {
      stats.filteredUnconfirmedCount += 1;
      continue;
    }

    records.push({
      teamName: item.teamName,
      playerName: item.playerName,
      status: classified,
      sourceUrl: item.sourceUrl!,
      isKeyPlayer: keyPlayers.has(normalizeTeamName(item.playerName)),
    });
    stats.officialRecordCount += 1;
  }

  return { records, stats };
}
