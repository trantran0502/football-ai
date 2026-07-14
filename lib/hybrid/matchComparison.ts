import type {
  HybridCompetitionType,
  HybridMatchRecord,
  HybridVenueSide,
} from "@/lib/hybrid/hybridTypes";

const FRIENDLY_PATTERN = /friendly|friendlies|exhibition|test match/i;
const CUP_PATTERN = /cup|fa |copa|champions|europa|conference|super cup|playoff/i;

export function normalizeTeamName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, "");
}

export function inferCompetitionType(competition: string): HybridCompetitionType {
  if (FRIENDLY_PATTERN.test(competition)) {
    return "friendly";
  }
  if (CUP_PATTERN.test(competition)) {
    return "cup";
  }
  if (competition.trim().length === 0) {
    return "other";
  }
  return "league";
}

export function isOfficialMatch(record: HybridMatchRecord): boolean {
  return record.competitionType !== "friendly";
}

export function buildMatchFingerprint(record: HybridMatchRecord): string {
  const teams = [normalizeTeamName(record.homeTeam), normalizeTeamName(record.awayTeam)]
    .sort()
    .join("|");
  return `${record.matchDate}:${teams}:${record.competition.toLowerCase()}`;
}

export function areSameFixture(
  left: HybridMatchRecord,
  right: HybridMatchRecord,
  dateToleranceDays = 0
): boolean {
  const leftHome = normalizeTeamName(left.homeTeam);
  const leftAway = normalizeTeamName(left.awayTeam);
  const rightHome = normalizeTeamName(right.homeTeam);
  const rightAway = normalizeTeamName(right.awayTeam);

  const sameDirection = leftHome === rightHome && leftAway === rightAway;
  const reversedDirection = leftHome === rightAway && leftAway === rightHome;
  if (!sameDirection && !reversedDirection) {
    return false;
  }

  if (dateToleranceDays === 0) {
    return left.matchDate === right.matchDate;
  }

  const leftTime = Date.parse(left.matchDate);
  const rightTime = Date.parse(right.matchDate);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
    return left.matchDate === right.matchDate;
  }

  const diffDays = Math.abs(leftTime - rightTime) / 86_400_000;
  return diffDays <= dateToleranceDays;
}

export function hasHomeAwayDirectionConflict(
  left: HybridMatchRecord,
  right: HybridMatchRecord
): boolean {
  if (!areSameFixture(left, right, 0)) {
    return false;
  }

  const leftHome = normalizeTeamName(left.homeTeam);
  const leftAway = normalizeTeamName(left.awayTeam);
  const rightHome = normalizeTeamName(right.homeTeam);
  const rightAway = normalizeTeamName(right.awayTeam);

  return leftHome === rightAway && leftAway === rightHome;
}

export function hasScoreConflict(
  left: HybridMatchRecord,
  right: HybridMatchRecord
): boolean {
  if (
    left.homeGoals === null ||
    left.awayGoals === null ||
    right.homeGoals === null ||
    right.awayGoals === null
  ) {
    return false;
  }

  if (hasHomeAwayDirectionConflict(left, right)) {
    return (
      left.homeGoals !== right.awayGoals || left.awayGoals !== right.homeGoals
    );
  }

  return left.homeGoals !== right.homeGoals || left.awayGoals !== right.awayGoals;
}

export function dedupeMatchRecords(records: HybridMatchRecord[]): HybridMatchRecord[] {
  const seen = new Set<string>();
  const output: HybridMatchRecord[] = [];

  for (const record of records) {
    const fingerprint = buildMatchFingerprint(record);
    if (seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    output.push(record);
  }

  return output;
}

export function filterOfficialMatches(
  records: HybridMatchRecord[],
  includeFriendlies: boolean
): HybridMatchRecord[] {
  if (includeFriendlies) {
    return records;
  }
  return records.filter(isOfficialMatch);
}

export function filterVenueMatches(
  records: HybridMatchRecord[],
  teamName: string,
  venue: Exclude<HybridVenueSide, "neutral">
): HybridMatchRecord[] {
  const normalized = normalizeTeamName(teamName);
  return records.filter((record) => {
    if (record.venue === "neutral") {
      return false;
    }
    if (venue === "home") {
      return normalizeTeamName(record.homeTeam) === normalized;
    }
    return normalizeTeamName(record.awayTeam) === normalized;
  });
}

export function sortMatchesDesc(records: HybridMatchRecord[]): HybridMatchRecord[] {
  return [...records].sort((left, right) => right.matchDate.localeCompare(left.matchDate));
}

export function takeRecentMatches(
  records: HybridMatchRecord[],
  limit: number
): HybridMatchRecord[] {
  return sortMatchesDesc(records).slice(0, limit);
}
