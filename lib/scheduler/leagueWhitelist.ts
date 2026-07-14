import type { SchedulerFixtureSource } from "@/lib/scheduler/schedulerTypes";

/** API-Football league IDs aligned with top European competitions. */
export const DEFAULT_SCHEDULER_LEAGUE_IDS = [
  39, // Premier League
  140, // La Liga
  135, // Serie A
  78, // Bundesliga
  61, // Ligue 1
  2, // UEFA Champions League
  3, // UEFA Europa League
] as const;

export const SCHEDULER_LEAGUE_ID_LABELS: Record<number, string> = {
  39: "Premier League",
  140: "La Liga",
  135: "Serie A",
  78: "Bundesliga",
  61: "Ligue 1",
  2: "UEFA Champions League",
  3: "UEFA Europa League",
};

export function parseLeagueIdWhitelist(raw: string | undefined): number[] {
  if (!raw?.trim()) {
    return [];
  }

  return raw
   .split(",")
    .map((item) => Number(item.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

export function filterFixturesByLeagueIdWhitelist(
  fixtures: SchedulerFixtureSource[],
  leagueIdWhitelist: number[]
): SchedulerFixtureSource[] {
  if (leagueIdWhitelist.length === 0) {
    return fixtures;
  }

  const allowed = new Set(leagueIdWhitelist);
  return fixtures.filter(
    (fixture) =>
      fixture.leagueId !== null &&
      fixture.leagueId !== undefined &&
      allowed.has(fixture.leagueId)
  );
}
