import type { SchedulerFixtureSource } from "@/lib/scheduler/schedulerTypes";

export const PRE_MATCH_KICKOFF_BUFFER_MS = 15 * 60 * 1000;

export const PRE_MATCH_ALLOWED_STATUSES = new Set(["NS", "TBD"]);

export const PRE_MATCH_STARTED_STATUSES = new Set([
  "1H",
  "HT",
  "2H",
  "ET",
  "BT",
  "P",
  "SUSP",
  "INT",
]);

export const PRE_MATCH_TERMINAL_STATUSES = new Set([
  "FT",
  "AET",
  "PEN",
  "PST",
  "CANC",
  "ABD",
  "AWD",
  "WO",
]);

export type PreMatchEligibilitySkipReason =
  | "eligible"
  | "terminal_status"
  | "started_status"
  | "invalid_status"
  | "invalid_kickoff"
  | "past_kickoff"
  | "kickoff_too_soon";

export interface PreMatchEligibilityStats {
  pastKickoffSkipped: number;
  startedFixtureSkipped: number;
  terminalStatusSkipped: number;
  eligibleUpcomingCount: number;
}

export function normalizeFixtureStatus(status: string | null | undefined): string {
  return status?.trim().toUpperCase() ?? "";
}

export function parseKickoffTimeUtc(
  kickoffTime: string | null | undefined
): number | null {
  if (!kickoffTime?.trim()) {
    return null;
  }

  const parsed = Date.parse(kickoffTime.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function isKickoffEligibleForBetting(
  kickoffTime: string | null | undefined,
  now: Date,
  bufferMs: number = PRE_MATCH_KICKOFF_BUFFER_MS
): boolean {
  const kickoffMs = parseKickoffTimeUtc(kickoffTime);
  if (kickoffMs === null) {
    return false;
  }

  return kickoffMs > now.getTime() + bufferMs;
}

export function classifyPreMatchFixtureEligibility(
  fixture: Pick<SchedulerFixtureSource, "status" | "kickoffTime" | "matchDate">,
  now: Date,
  bufferMs: number = PRE_MATCH_KICKOFF_BUFFER_MS
): PreMatchEligibilitySkipReason {
  const status = normalizeFixtureStatus(fixture.status);

  if (PRE_MATCH_TERMINAL_STATUSES.has(status)) {
    return "terminal_status";
  }

  if (PRE_MATCH_STARTED_STATUSES.has(status)) {
    return "started_status";
  }

  if (!PRE_MATCH_ALLOWED_STATUSES.has(status)) {
    return "invalid_status";
  }

  const kickoffMs = parseKickoffTimeUtc(fixture.kickoffTime);
  if (kickoffMs === null) {
    return "invalid_kickoff";
  }

  if (kickoffMs <= now.getTime()) {
    return "past_kickoff";
  }

  if (kickoffMs <= now.getTime() + bufferMs) {
    return "kickoff_too_soon";
  }

  return "eligible";
}

export function isPreMatchEligibleFixture(
  fixture: Pick<SchedulerFixtureSource, "status" | "kickoffTime" | "matchDate">,
  now: Date,
  bufferMs: number = PRE_MATCH_KICKOFF_BUFFER_MS
): boolean {
  return classifyPreMatchFixtureEligibility(fixture, now, bufferMs) === "eligible";
}

export function filterPreMatchEligibleFixtures(
  fixtures: SchedulerFixtureSource[],
  now: Date,
  bufferMs: number = PRE_MATCH_KICKOFF_BUFFER_MS
): {
  eligible: SchedulerFixtureSource[];
  stats: PreMatchEligibilityStats;
} {
  const stats: PreMatchEligibilityStats = {
    pastKickoffSkipped: 0,
    startedFixtureSkipped: 0,
    terminalStatusSkipped: 0,
    eligibleUpcomingCount: 0,
  };
  const eligible: SchedulerFixtureSource[] = [];

  for (const fixture of fixtures) {
    const reason = classifyPreMatchFixtureEligibility(fixture, now, bufferMs);
    switch (reason) {
      case "eligible":
        stats.eligibleUpcomingCount += 1;
        eligible.push(fixture);
        break;
      case "terminal_status":
        stats.terminalStatusSkipped += 1;
        break;
      case "started_status":
      case "invalid_status":
        stats.startedFixtureSkipped += 1;
        break;
      case "past_kickoff":
      case "kickoff_too_soon":
      case "invalid_kickoff":
        stats.pastKickoffSkipped += 1;
        break;
    }
  }

  return { eligible, stats };
}
