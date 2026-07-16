/**
 * PR9: Squad availability provider — mock-only in this PR.
 * No API-Football, Google Search, or Supabase integration.
 */

export interface TeamSquadAvailability {
  injuries: number | null;
  suspensions: number | null;
  doubtfulPlayers: number | null;
  expectedRotationCount: number | null;
  missingStartingXI: number | null;
  missingAttackers: number | null;
  missingMidfielders: number | null;
  missingDefenders: number | null;
  missingGoalkeeper: number | null;
  squadDepthScore: number | null;
  daysSinceLastMatch: number | null;
  daysUntilNextMatch: number | null;
}

export interface SquadAvailabilitySnapshot {
  home: TeamSquadAvailability;
  away: TeamSquadAvailability;
  injuredCount?: number | null;
  suspendedCount?: number | null;
  doubtfulCount?: number | null;
  unavailableCount?: number | null;
  keyPlayersMissing?: string[];
  impactScore?: number | null;
  dataFreshnessDays?: number | null;
  sampleSize?: number;
}

export interface SquadAvailabilityProviderRequest {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
}

export interface SquadAvailabilityProvider {
  getSquadAvailability(
    request: SquadAvailabilityProviderRequest
  ): SquadAvailabilitySnapshot;
}

export const EMPTY_SQUAD_AVAILABILITY: TeamSquadAvailability = {
  injuries: null,
  suspensions: null,
  doubtfulPlayers: null,
  expectedRotationCount: null,
  missingStartingXI: null,
  missingAttackers: null,
  missingMidfielders: null,
  missingDefenders: null,
  missingGoalkeeper: null,
  squadDepthScore: null,
  daysSinceLastMatch: null,
  daysUntilNextMatch: null,
};

function buildAvailability(input: Partial<TeamSquadAvailability>): TeamSquadAvailability {
  return {
    ...EMPTY_SQUAD_AVAILABILITY,
    ...input,
  };
}

const CLEAN_SQUAD = buildAvailability({
  injuries: 0,
  suspensions: 0,
  doubtfulPlayers: 0,
  expectedRotationCount: 1,
  missingStartingXI: 0,
  missingAttackers: 0,
  missingMidfielders: 0,
  missingDefenders: 0,
  missingGoalkeeper: 0,
  squadDepthScore: 0.78,
  daysSinceLastMatch: 6,
  daysUntilNextMatch: 5,
});

const SINGLE_STARTER_OUT = buildAvailability({
  injuries: 1,
  suspensions: 0,
  doubtfulPlayers: 1,
  expectedRotationCount: 2,
  missingStartingXI: 1,
  missingAttackers: 0,
  missingMidfielders: 1,
  missingDefenders: 0,
  missingGoalkeeper: 0,
  squadDepthScore: 0.68,
  daysSinceLastMatch: 5,
  daysUntilNextMatch: 4,
});

const MULTIPLE_STARTERS_OUT = buildAvailability({
  injuries: 3,
  suspensions: 1,
  doubtfulPlayers: 2,
  expectedRotationCount: 4,
  missingStartingXI: 4,
  missingAttackers: 2,
  missingMidfielders: 1,
  missingDefenders: 2,
  missingGoalkeeper: 0,
  squadDepthScore: 0.42,
  daysSinceLastMatch: 4,
  daysUntilNextMatch: 3,
});

const GOALKEEPER_OUT = buildAvailability({
  injuries: 1,
  suspensions: 0,
  doubtfulPlayers: 0,
  expectedRotationCount: 2,
  missingStartingXI: 1,
  missingAttackers: 0,
  missingMidfielders: 0,
  missingDefenders: 0,
  missingGoalkeeper: 1,
  squadDepthScore: 0.55,
  daysSinceLastMatch: 5,
  daysUntilNextMatch: 4,
});

const HIGH_ROTATION = buildAvailability({
  injuries: 1,
  suspensions: 0,
  doubtfulPlayers: 2,
  expectedRotationCount: 6,
  missingStartingXI: 2,
  missingAttackers: 1,
  missingMidfielders: 1,
  missingDefenders: 0,
  missingGoalkeeper: 0,
  squadDepthScore: 0.6,
  daysSinceLastMatch: 4,
  daysUntilNextMatch: 2,
});

const LONG_REST = buildAvailability({
  injuries: 0,
  suspensions: 0,
  doubtfulPlayers: 0,
  expectedRotationCount: 1,
  missingStartingXI: 0,
  missingAttackers: 0,
  missingMidfielders: 0,
  missingDefenders: 0,
  missingGoalkeeper: 0,
  squadDepthScore: 0.8,
  daysSinceLastMatch: 12,
  daysUntilNextMatch: 8,
});

const CONGESTED = buildAvailability({
  injuries: 1,
  suspensions: 0,
  doubtfulPlayers: 1,
  expectedRotationCount: 3,
  missingStartingXI: 1,
  missingAttackers: 0,
  missingMidfielders: 0,
  missingDefenders: 1,
  missingGoalkeeper: 0,
  squadDepthScore: 0.62,
  daysSinceLastMatch: 3,
  daysUntilNextMatch: 2,
});

const PARTIAL_DATA = buildAvailability({
  injuries: 2,
  suspensions: null,
  doubtfulPlayers: null,
  expectedRotationCount: 3,
  missingStartingXI: 2,
  missingAttackers: 1,
  missingMidfielders: null,
  missingDefenders: 1,
  missingGoalkeeper: 0,
  squadDepthScore: 0.58,
  daysSinceLastMatch: 5,
  daysUntilNextMatch: null,
});

function resolveHomeProfile(teamName: string): TeamSquadAvailability {
  const normalized = teamName.trim().toLowerCase();

  if (normalized === "empty home") {
    return { ...EMPTY_SQUAD_AVAILABILITY };
  }
  if (normalized.includes("partial")) {
    return { ...PARTIAL_DATA };
  }
  if (normalized.includes("no-injury") || normalized === "mockhome fc") {
    return { ...CLEAN_SQUAD };
  }
  if (normalized.includes("single-out")) {
    return { ...SINGLE_STARTER_OUT };
  }
  if (normalized.includes("multi-out") || normalized.includes("depleted")) {
    return { ...MULTIPLE_STARTERS_OUT };
  }
  if (normalized.includes("gk-out") || normalized.includes("keeper-out")) {
    return { ...GOALKEEPER_OUT };
  }
  if (normalized.includes("high-rotation")) {
    return { ...HIGH_ROTATION };
  }
  if (normalized.includes("long-rest") || normalized.includes("rested")) {
    return { ...LONG_REST };
  }
  if (normalized.includes("congested") || normalized.includes("fatigue")) {
    return { ...CONGESTED };
  }

  return { ...CLEAN_SQUAD };
}

function resolveAwayProfile(teamName: string): TeamSquadAvailability {
  const normalized = teamName.trim().toLowerCase();

  if (normalized === "empty away") {
    return { ...EMPTY_SQUAD_AVAILABILITY };
  }
  if (normalized.includes("partial")) {
    return {
      ...PARTIAL_DATA,
      injuries: 1,
      missingStartingXI: 1,
      missingAttackers: 0,
    };
  }
  if (normalized.includes("multi-out") || normalized === "mockaway fc") {
    return { ...MULTIPLE_STARTERS_OUT };
  }
  if (normalized.includes("gk-out") || normalized.includes("keeper-out")) {
    return { ...GOALKEEPER_OUT };
  }
  if (normalized.includes("high-rotation")) {
    return { ...HIGH_ROTATION };
  }
  if (normalized.includes("congested") || normalized.includes("fatigue")) {
    return { ...CONGESTED };
  }
  if (normalized.includes("long-rest") || normalized.includes("rested")) {
    return { ...LONG_REST };
  }
  if (normalized.includes("single-out")) {
    return { ...SINGLE_STARTER_OUT };
  }

  return { ...CLEAN_SQUAD };
}

export function createMockSquadAvailabilityProvider(): SquadAvailabilityProvider {
  return {
    getSquadAvailability(
      request: SquadAvailabilityProviderRequest
    ): SquadAvailabilitySnapshot {
      return {
        home: resolveHomeProfile(request.homeTeam),
        away: resolveAwayProfile(request.awayTeam),
        injuredCount: null,
        suspendedCount: null,
        doubtfulCount: null,
        unavailableCount: null,
        keyPlayersMissing: [],
        impactScore: null,
        dataFreshnessDays: 7,
        sampleSize: 12,
      };
    },
  };
}

export const MOCK_SQUAD_AVAILABILITY_FIXTURES = {
  clean: {
    home: CLEAN_SQUAD,
    away: CLEAN_SQUAD,
  },
  homeCleanAwayDepleted: {
    home: CLEAN_SQUAD,
    away: MULTIPLE_STARTERS_OUT,
  },
  goalkeeperOut: {
    home: GOALKEEPER_OUT,
    away: CLEAN_SQUAD,
  },
  empty: {
    home: { ...EMPTY_SQUAD_AVAILABILITY },
    away: { ...EMPTY_SQUAD_AVAILABILITY },
  },
} as const;

export function buildPartialSquadAvailabilitySnapshot(partial: {
  home?: Partial<TeamSquadAvailability>;
  away?: Partial<TeamSquadAvailability>;
}): SquadAvailabilitySnapshot {
  return {
    home: buildAvailability(partial.home ?? {}),
    away: buildAvailability(partial.away ?? {}),
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
