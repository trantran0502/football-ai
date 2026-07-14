/**
 * PR10: Schedule / travel / match context provider — mock-only in this PR.
 * No API-Football, Google Search, or Supabase integration.
 */

export interface TeamMatchContextMetrics {
  daysSinceLastMatch: number | null;
  daysUntilNextMatch: number | null;
  matchesLast14Days: number | null;
  travelDistanceKm: number | null;
  travelTimeHours: number | null;
  timezoneDifference: number | null;
  mustWin: boolean | null;
  alreadyQualified: boolean | null;
  alreadyEliminated: boolean | null;
}

export interface MatchContextSnapshot {
  home: TeamMatchContextMetrics;
  away: TeamMatchContextMetrics;
  isNeutralVenue: boolean | null;
  weatherCondition: string | null;
  temperature: number | null;
  humidity: number | null;
  altitude: number | null;
  competitionStage: string | null;
  mustWin: boolean | null;
  alreadyQualified: boolean | null;
  alreadyEliminated: boolean | null;
  derbyMatch: boolean | null;
  cupMatch: boolean | null;
  leagueMatch: boolean | null;
  internationalBreak: boolean | null;
}

export interface MatchContextProviderRequest {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
}

export interface MatchContextProvider {
  getMatchContext(request: MatchContextProviderRequest): MatchContextSnapshot;
}

export const EMPTY_TEAM_MATCH_CONTEXT: TeamMatchContextMetrics = {
  daysSinceLastMatch: null,
  daysUntilNextMatch: null,
  matchesLast14Days: null,
  travelDistanceKm: null,
  travelTimeHours: null,
  timezoneDifference: null,
  mustWin: null,
  alreadyQualified: null,
  alreadyEliminated: null,
};

function buildTeamContext(
  input: Partial<TeamMatchContextMetrics>
): TeamMatchContextMetrics {
  return {
    ...EMPTY_TEAM_MATCH_CONTEXT,
    ...input,
  };
}

const NORMAL_HOME = buildTeamContext({
  daysSinceLastMatch: 6,
  daysUntilNextMatch: 5,
  matchesLast14Days: 3,
  travelDistanceKm: 0,
  travelTimeHours: 0,
  timezoneDifference: 0,
  mustWin: false,
  alreadyQualified: false,
  alreadyEliminated: false,
});

const NORMAL_AWAY = buildTeamContext({
  daysSinceLastMatch: 6,
  daysUntilNextMatch: 5,
  matchesLast14Days: 3,
  travelDistanceKm: 420,
  travelTimeHours: 5,
  timezoneDifference: 1,
  mustWin: false,
  alreadyQualified: false,
  alreadyEliminated: false,
});

const CONGESTED = buildTeamContext({
  daysSinceLastMatch: 3,
  daysUntilNextMatch: 2,
  matchesLast14Days: 6,
  travelDistanceKm: 180,
  travelTimeHours: 2.5,
  timezoneDifference: 0,
  mustWin: false,
  alreadyQualified: false,
  alreadyEliminated: false,
});

const RESTED = buildTeamContext({
  daysSinceLastMatch: 12,
  daysUntilNextMatch: 8,
  matchesLast14Days: 2,
  travelDistanceKm: 0,
  travelTimeHours: 0,
  timezoneDifference: 0,
  mustWin: false,
  alreadyQualified: false,
  alreadyEliminated: false,
});

const LONG_TRAVEL_AWAY = buildTeamContext({
  daysSinceLastMatch: 5,
  daysUntilNextMatch: 4,
  matchesLast14Days: 4,
  travelDistanceKm: 2800,
  travelTimeHours: 14,
  timezoneDifference: 6,
  mustWin: false,
  alreadyQualified: false,
  alreadyEliminated: false,
});

const MUST_WIN = buildTeamContext({
  daysSinceLastMatch: 5,
  daysUntilNextMatch: 3,
  matchesLast14Days: 4,
  travelDistanceKm: 0,
  travelTimeHours: 0,
  timezoneDifference: 0,
  mustWin: true,
  alreadyQualified: false,
  alreadyEliminated: false,
});

const QUALIFIED = buildTeamContext({
  daysSinceLastMatch: 7,
  daysUntilNextMatch: 6,
  matchesLast14Days: 3,
  travelDistanceKm: 0,
  travelTimeHours: 0,
  timezoneDifference: 0,
  mustWin: false,
  alreadyQualified: true,
  alreadyEliminated: false,
});

const ELIMINATED = buildTeamContext({
  daysSinceLastMatch: 7,
  daysUntilNextMatch: 10,
  matchesLast14Days: 3,
  travelDistanceKm: 0,
  travelTimeHours: 0,
  timezoneDifference: 0,
  mustWin: false,
  alreadyQualified: false,
  alreadyEliminated: true,
});

interface SharedMatchFlags {
  isNeutralVenue: boolean | null;
  weatherCondition: string | null;
  temperature: number | null;
  humidity: number | null;
  altitude: number | null;
  competitionStage: string | null;
  mustWin: boolean | null;
  alreadyQualified: boolean | null;
  alreadyEliminated: boolean | null;
  derbyMatch: boolean | null;
  cupMatch: boolean | null;
  leagueMatch: boolean | null;
  internationalBreak: boolean | null;
}

const DEFAULT_SHARED: SharedMatchFlags = {
  isNeutralVenue: false,
  weatherCondition: "clear",
  temperature: 18,
  humidity: 55,
  altitude: 120,
  competitionStage: "league_regular",
  mustWin: false,
  alreadyQualified: false,
  alreadyEliminated: false,
  derbyMatch: false,
  cupMatch: false,
  leagueMatch: true,
  internationalBreak: false,
};

function resolveHomeTeamContext(name: string): TeamMatchContextMetrics {
  const normalized = name.trim().toLowerCase();

  if (normalized === "empty home") {
    return { ...EMPTY_TEAM_MATCH_CONTEXT };
  }
  if (normalized.includes("congested") || normalized.includes("fatigue")) {
    return { ...CONGESTED };
  }
  if (normalized.includes("rested") || normalized.includes("long-rest")) {
    return { ...RESTED };
  }
  if (normalized.includes("must-win")) {
    return { ...MUST_WIN };
  }
  if (normalized.includes("qualified")) {
    return { ...QUALIFIED };
  }
  if (normalized.includes("eliminated")) {
    return { ...ELIMINATED };
  }

  return { ...NORMAL_HOME };
}

function resolveAwayTeamContext(name: string): TeamMatchContextMetrics {
  const normalized = name.trim().toLowerCase();

  if (normalized === "empty away") {
    return { ...EMPTY_TEAM_MATCH_CONTEXT };
  }
  if (normalized.includes("long-travel") || normalized.includes("travel")) {
    return { ...LONG_TRAVEL_AWAY };
  }
  if (normalized.includes("congested") || normalized.includes("fatigue")) {
    return { ...CONGESTED };
  }
  if (normalized.includes("rested") || normalized.includes("long-rest")) {
    return { ...RESTED };
  }
  if (normalized.includes("must-win")) {
    return { ...MUST_WIN };
  }
  if (normalized.includes("qualified")) {
    return { ...QUALIFIED };
  }
  if (normalized.includes("eliminated")) {
    return { ...ELIMINATED };
  }

  return { ...NORMAL_AWAY };
}

function resolveSharedFlags(homeTeam: string, awayTeam: string): SharedMatchFlags {
  const home = homeTeam.trim().toLowerCase();
  const away = awayTeam.trim().toLowerCase();
  const combined = `${home} ${away}`;

  if (home === "empty home" && away === "empty away") {
    return {
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
    };
  }

  const flags: SharedMatchFlags = { ...DEFAULT_SHARED };

  if (combined.includes("neutral")) {
    flags.isNeutralVenue = true;
  }
  if (combined.includes("derby")) {
    flags.derbyMatch = true;
    flags.leagueMatch = true;
  }
  if (combined.includes("cup")) {
    flags.cupMatch = true;
    flags.leagueMatch = false;
    flags.competitionStage = "cup_knockout";
  }
  if (combined.includes("extreme-weather") || combined.includes("storm")) {
    flags.weatherCondition = "heavy_rain";
    flags.temperature = 4;
    flags.humidity = 92;
  }
  if (combined.includes("heat") || combined.includes("hot")) {
    flags.weatherCondition = "hot";
    flags.temperature = 36;
    flags.humidity = 78;
  }
  if (combined.includes("altitude") || combined.includes("high-alt")) {
    flags.altitude = 2650;
  }
  if (home.includes("must-win") || away.includes("must-win")) {
    flags.mustWin = true;
  }
  if (home.includes("qualified") || away.includes("qualified")) {
    flags.alreadyQualified = true;
  }
  if (home.includes("eliminated") || away.includes("eliminated")) {
    flags.alreadyEliminated = true;
  }
  if (combined.includes("international-break")) {
    flags.internationalBreak = true;
  }

  return flags;
}

export function createMockMatchContextProvider(): MatchContextProvider {
  return {
    getMatchContext(request: MatchContextProviderRequest): MatchContextSnapshot {
      const shared = resolveSharedFlags(request.homeTeam, request.awayTeam);
      return {
        home: resolveHomeTeamContext(request.homeTeam),
        away: resolveAwayTeamContext(request.awayTeam),
        ...shared,
      };
    },
  };
}

export const MOCK_MATCH_CONTEXT_FIXTURES = {
  normal: createMockMatchContextProvider().getMatchContext({
    homeTeam: "MockHome FC",
    awayTeam: "MockAway FC",
  }),
  neutralDerby: createMockMatchContextProvider().getMatchContext({
    homeTeam: "Neutral Derby Home",
    awayTeam: "Neutral Derby Away",
  }),
  empty: createMockMatchContextProvider().getMatchContext({
    homeTeam: "Empty Home",
    awayTeam: "Empty Away",
  }),
} as const;

export function buildPartialMatchContextSnapshot(partial: {
  home?: Partial<TeamMatchContextMetrics>;
  away?: Partial<TeamMatchContextMetrics>;
  shared?: Partial<Omit<MatchContextSnapshot, "home" | "away">>;
}): MatchContextSnapshot {
  const emptyShared = resolveSharedFlags("Empty Home", "Empty Away");
  return {
    home: buildTeamContext(partial.home ?? {}),
    away: buildTeamContext(partial.away ?? {}),
    ...emptyShared,
    ...partial.shared,
  };
}
