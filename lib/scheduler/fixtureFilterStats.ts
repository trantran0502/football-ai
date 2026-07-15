import type { FixtureIntakeResult } from "@/lib/scheduler/fixtureMapping";
import { isLeagueAllowed } from "@/lib/scheduler/schedulerConfig";
import type { SchedulerFixtureSource } from "@/lib/scheduler/schedulerTypes";

const FINISHED_OR_CANCELLED = new Set(["FT", "AET", "PEN", "CANC", "ABD", "AWD", "WO"]);

const INTAKE_SKIP_REASON_FIELDS = {
  "Missing fixture.id": "missingFixtureId",
  "Missing league.id": "missingLeagueId",
  "Missing league.name": "missingLeagueName",
  "Missing home team": "missingHomeTeam",
  "Missing away team": "missingAwayTeam",
  "Missing home team id": "missingHomeTeamId",
  "Missing away team id": "missingAwayTeamId",
} as const;

export interface FixtureFilterStats {
  total: number;
  apiRaw: number;
  cancelledOrAbandoned: number;
  intakeValid: number;
  intakeSkipped: number;
  intakeSkipReasons: Record<string, number>;
  missingFixtureId: number;
  missingLeagueId: number;
  missingLeagueName: number;
  missingHomeTeam: number;
  missingAwayTeam: number;
  missingHomeTeamId: number;
  missingAwayTeamId: number;
  analyzable: number;
  blockedFinishedStatus: number;
  finishedStatusCounts: Record<string, number>;
  blockedMissingLeague: number;
  blockedLeagueId: number;
  blockedLeagueName: number;
  allowedLeague: number;
  afterWhitelist: number;
  whitelist: {
    leagueIdWhitelist: number[];
    leagueNameWhitelist: string[];
    leagueIdWhitelistConfigured: boolean;
    leagueNameWhitelistConfigured: boolean;
    leagueIdWhitelistEmpty: boolean;
    leagueIdWhitelistReadFailed: boolean;
    activePolicy: "league_id" | "league_name" | "none";
  };
}

export function buildFixtureFilterStats(
  intake: FixtureIntakeResult,
  config: {
    leagueIdWhitelist: number[];
    leagueWhitelist: string[];
  }
): FixtureFilterStats {
  const intakeSkipReasons: Record<string, number> = {};
  const counters = {
    missingFixtureId: 0,
    missingLeagueId: 0,
    missingLeagueName: 0,
    missingHomeTeam: 0,
    missingAwayTeam: 0,
    missingHomeTeamId: 0,
    missingAwayTeamId: 0,
  };

  for (const skip of intake.skipped) {
    intakeSkipReasons[skip.reason] = (intakeSkipReasons[skip.reason] ?? 0) + 1;
    const field =
      INTAKE_SKIP_REASON_FIELDS[
        skip.reason as keyof typeof INTAKE_SKIP_REASON_FIELDS
      ];
    if (field) {
      counters[field] += 1;
    }
  }

  const finishedStatusCounts: Record<string, number> = {};
  let blockedFinishedStatus = 0;
  for (const fixture of intake.fixtures) {
    if (!FINISHED_OR_CANCELLED.has(fixture.status)) {
      continue;
    }
    blockedFinishedStatus += 1;
    finishedStatusCounts[fixture.status] =
      (finishedStatusCounts[fixture.status] ?? 0) + 1;
  }

  const analyzable = intake.fixtures.filter(
    (fixture) => !FINISHED_OR_CANCELLED.has(fixture.status)
  );

  const leagueIdWhitelistConfigured = config.leagueIdWhitelist.length > 0;
  const leagueNameWhitelistConfigured =
    !leagueIdWhitelistConfigured && config.leagueWhitelist.length > 0;
  const allowedLeagueIds = new Set(config.leagueIdWhitelist);

  let blockedMissingLeague = 0;
  let blockedLeagueId = 0;
  let blockedLeagueName = 0;
  let allowedLeague = 0;

  for (const fixture of analyzable) {
    const leagueDecision = classifyLeaguePolicyFixture(fixture, {
      leagueIdWhitelistConfigured,
      leagueNameWhitelistConfigured,
      allowedLeagueIds,
      leagueWhitelist: config.leagueWhitelist,
    });

    if (leagueDecision === "missing_league") {
      blockedMissingLeague += 1;
    } else if (leagueDecision === "blocked_league_id") {
      blockedLeagueId += 1;
    } else if (leagueDecision === "blocked_league_name") {
      blockedLeagueName += 1;
    } else {
      allowedLeague += 1;
    }
  }

  const total = intake.fixtures.length + intake.skipped.length;
  const apiRaw = intake.fetchMeta?.apiRaw ?? total;
  const cancelledOrAbandoned = intake.fetchMeta?.cancelledOrAbandoned ?? 0;

  return {
    total,
    apiRaw,
    cancelledOrAbandoned,
    intakeValid: intake.fixtures.length,
    intakeSkipped: intake.skipped.length,
    intakeSkipReasons,
    ...counters,
    analyzable: analyzable.length,
    blockedFinishedStatus,
    finishedStatusCounts,
    blockedMissingLeague,
    blockedLeagueId,
    blockedLeagueName,
    allowedLeague,
    afterWhitelist: allowedLeague,
    whitelist: {
      leagueIdWhitelist: [...config.leagueIdWhitelist],
      leagueNameWhitelist: [...config.leagueWhitelist],
      leagueIdWhitelistConfigured,
      leagueNameWhitelistConfigured,
      leagueIdWhitelistEmpty: config.leagueIdWhitelist.length === 0,
      leagueIdWhitelistReadFailed: false,
      activePolicy: leagueIdWhitelistConfigured
        ? "league_id"
        : leagueNameWhitelistConfigured
          ? "league_name"
          : "none",
    },
  };
}

function classifyLeaguePolicyFixture(
  fixture: SchedulerFixtureSource,
  options: {
    leagueIdWhitelistConfigured: boolean;
    leagueNameWhitelistConfigured: boolean;
    allowedLeagueIds: Set<number>;
    leagueWhitelist: string[];
  }
): "allowed" | "missing_league" | "blocked_league_id" | "blocked_league_name" {
  const hasValidLeague =
    typeof fixture.leagueId === "number" &&
    Number.isInteger(fixture.leagueId) &&
    fixture.leagueId > 0 &&
    fixture.leagueName.trim().length > 0;

  if (!hasValidLeague) {
    return "missing_league";
  }

  if (
    options.leagueIdWhitelistConfigured &&
    !options.allowedLeagueIds.has(fixture.leagueId!)
  ) {
    return "blocked_league_id";
  }

  if (
    options.leagueNameWhitelistConfigured &&
    !isLeagueAllowed(fixture.leagueName, options.leagueWhitelist)
  ) {
    return "blocked_league_name";
  }

  return "allowed";
}

export function filterAnalyzableFixtures(
  fixtures: SchedulerFixtureSource[]
): SchedulerFixtureSource[] {
  return fixtures.filter((fixture) => !FINISHED_OR_CANCELLED.has(fixture.status));
}
