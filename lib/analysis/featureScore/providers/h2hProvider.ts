/**
 * PR8: Head-to-head (H2H) provider — mock-only in this PR.
 * No API-Football, Google Search, or Supabase integration.
 */

export interface H2HMatchRecord {
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number | null;
  awayGoals: number | null;
  venue: string;
  competition: string;
  neutralVenue: boolean;
}

export interface H2HSnapshot {
  matches: H2HMatchRecord[];
  sampleSize: number;
  dataFreshnessDays: number | null;
}

export interface H2HProviderRequest {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
}

export interface H2HProvider {
  getH2HHistory(request: H2HProviderRequest): H2HSnapshot;
}

const REFERENCE_DATE = "2026-07-15";

function daysBetween(later: string, earlier: string): number {
  const end = new Date(later).getTime();
  const start = new Date(earlier).getTime();
  if (!Number.isFinite(end) || !Number.isFinite(start)) {
    return 0;
  }
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function buildSnapshot(
  matches: H2HMatchRecord[],
  referenceDate: string
): H2HSnapshot {
  const limited = matches.slice(0, 5);
  const mostRecent = limited[0]?.matchDate ?? null;
  return {
    matches: limited,
    sampleSize: limited.length,
    dataFreshnessDays: mostRecent
      ? daysBetween(referenceDate, mostRecent)
      : null,
  };
}

function match(
  homeTeam: string,
  awayTeam: string,
  homeGoals: number | null,
  awayTeamGoals: number | null,
  matchDate: string,
  options?: {
    venue?: string;
    competition?: string;
    neutralVenue?: boolean;
  }
): H2HMatchRecord {
  return {
    matchDate,
    homeTeam,
    awayTeam,
    homeGoals,
    awayGoals: awayTeamGoals,
    venue: options?.venue ?? `${homeTeam} Home`,
    competition: options?.competition ?? "League",
    neutralVenue: options?.neutralVenue ?? false,
  };
}

function homeDominantHistory(home: string, away: string): H2HMatchRecord[] {
  return [
    match(home, away, 2, 0, "2025-04-12"),
    match(away, home, 1, 3, "2024-11-03"),
    match(home, away, 1, 1, "2024-03-18"),
    match(home, away, 3, 1, "2023-09-25"),
    match(away, home, 0, 2, "2023-02-11"),
  ];
}

function awayDominantHistory(home: string, away: string): H2HMatchRecord[] {
  return [
    match(home, away, 0, 2, "2025-05-20"),
    match(away, home, 2, 1, "2024-12-08"),
    match(home, away, 1, 2, "2024-04-02"),
    match(home, away, 0, 1, "2023-10-15"),
    match(away, home, 1, 3, "2023-01-29"),
  ];
}

function balancedHistory(home: string, away: string): H2HMatchRecord[] {
  return [
    match(home, away, 2, 1, "2025-06-01"),
    match(away, home, 2, 0, "2024-10-10"),
    match(home, away, 1, 1, "2024-02-14"),
    match(home, away, 0, 1, "2023-08-22"),
    match(away, home, 1, 2, "2023-03-05"),
  ];
}

function smallSampleHistory(home: string, away: string): H2HMatchRecord[] {
  return [
    match(home, away, 2, 1, "2025-03-01"),
    match(away, home, 0, 1, "2024-09-12"),
  ];
}

function staleHistory(home: string, away: string): H2HMatchRecord[] {
  return [
    match(home, away, 2, 0, "2021-04-12"),
    match(away, home, 1, 2, "2020-11-03"),
    match(home, away, 1, 0, "2020-03-18"),
    match(home, away, 2, 2, "2019-09-25"),
    match(away, home, 0, 1, "2019-02-11"),
  ];
}

function neutralVenueHistory(home: string, away: string): H2HMatchRecord[] {
  return [
    match(home, away, 1, 1, "2025-06-15", {
      venue: "National Stadium",
      competition: "Cup",
      neutralVenue: true,
    }),
    match(home, away, 2, 0, "2024-12-01"),
    match(away, home, 1, 2, "2024-04-20"),
    match(home, away, 3, 2, "2023-11-08", {
      venue: "Final Stadium",
      neutralVenue: true,
    }),
    match(home, away, 1, 0, "2023-05-14"),
  ];
}

function partialScoreHistory(home: string, away: string): H2HMatchRecord[] {
  return [
    match(home, away, 2, 1, "2025-05-01"),
    match(away, home, null, null, "2024-11-20"),
    match(home, away, 1, 1, "2024-03-09"),
    match(home, away, null, 0, "2023-09-01"),
    match(away, home, 2, 3, "2023-01-15"),
  ];
}

function resolveHistory(
  homeTeam: string,
  awayTeam: string,
  profile: string
): H2HMatchRecord[] {
  switch (profile) {
    case "homeDominant":
      return homeDominantHistory(homeTeam, awayTeam);
    case "awayDominant":
      return awayDominantHistory(homeTeam, awayTeam);
    case "balanced":
      return balancedHistory(homeTeam, awayTeam);
    case "smallSample":
      return smallSampleHistory(homeTeam, awayTeam);
    case "stale":
      return staleHistory(homeTeam, awayTeam);
    case "neutralVenue":
      return neutralVenueHistory(homeTeam, awayTeam);
    case "partialScores":
      return partialScoreHistory(homeTeam, awayTeam);
    case "empty":
    default:
      return [];
  }
}

function resolveProfile(homeTeam: string, awayTeam: string): string {
  const home = homeTeam.trim().toLowerCase();
  const away = awayTeam.trim().toLowerCase();

  if (home === "empty home" || away === "empty away") {
    return "empty";
  }
  if (home.includes("partial") || away.includes("partial")) {
    return "partialScores";
  }
  if (home.includes("neutral") || away.includes("neutral")) {
    return "neutralVenue";
  }
  if (home.includes("stale") || away.includes("stale")) {
    return "stale";
  }
  if (home.includes("small-sample") || away.includes("small-sample")) {
    return "smallSample";
  }
  if (
    home.includes("strong") ||
    home === "mockhome fc" ||
    home.includes("法國")
  ) {
    return "homeDominant";
  }
  if (
    away.includes("weak") ||
    away === "mockaway fc" ||
    away.includes("保級") ||
    away.includes("strong-away")
  ) {
    return "awayDominant";
  }
  if (home.includes("balanced") || away.includes("balanced")) {
    return "balanced";
  }

  return "balanced";
}

export function createMockH2HProvider(): H2HProvider {
  return {
    getH2HHistory(request: H2HProviderRequest): H2HSnapshot {
      const referenceDate = request.matchDate ?? REFERENCE_DATE;
      const profile = resolveProfile(request.homeTeam, request.awayTeam);
      const matches = resolveHistory(request.homeTeam, request.awayTeam, profile);
      return buildSnapshot(matches, referenceDate);
    },
  };
}

export const MOCK_H2H_FIXTURES = {
  homeDominant: buildSnapshot(
    homeDominantHistory("MockHome FC", "MockAway FC"),
    REFERENCE_DATE
  ),
  awayDominant: buildSnapshot(
    awayDominantHistory("MockHome FC", "MockAway FC"),
    REFERENCE_DATE
  ),
  balanced: buildSnapshot(
    balancedHistory("Balanced Home", "Balanced Away"),
    REFERENCE_DATE
  ),
  empty: buildSnapshot([], REFERENCE_DATE),
} as const;

export function buildPartialH2HSnapshot(input: {
  matches?: H2HMatchRecord[];
  referenceDate?: string;
}): H2HSnapshot {
  return buildSnapshot(input.matches ?? [], input.referenceDate ?? REFERENCE_DATE);
}
