import type { AnalysisReport } from "@/lib/analysis/types";
import type { ProductionFixture } from "@/lib/production/productionTypes";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import type { SchedulerFixtureSource } from "@/lib/scheduler/schedulerTypes";

export interface FixtureMappingSkip {
  fixtureId: number | null;
  homeTeam: string | null;
  awayTeam: string | null;
  reason: string;
}

export interface FixtureIntakeResult {
  fixtures: SchedulerFixtureSource[];
  skipped: FixtureMappingSkip[];
  fetchMeta?: {
    apiRaw: number;
    cancelledOrAbandoned: number;
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateApiFixtureRecord(
  fixture: ApiFootballFixtureRecord
): { ok: true } | { ok: false; reason: string } {
  if (!isPositiveInteger(fixture.fixtureId)) {
    return { ok: false, reason: "Missing fixture.id" };
  }
  if (!isPositiveInteger(fixture.leagueId)) {
    return { ok: false, reason: "Missing league.id" };
  }
  if (!isNonEmptyString(fixture.league)) {
    return { ok: false, reason: "Missing league.name" };
  }
  if (!isNonEmptyString(fixture.homeTeam)) {
    return { ok: false, reason: "Missing home team" };
  }
  if (!isNonEmptyString(fixture.awayTeam)) {
    return { ok: false, reason: "Missing away team" };
  }
  if (!isPositiveInteger(fixture.homeTeamId)) {
    return { ok: false, reason: "Missing home team id" };
  }
  if (!isPositiveInteger(fixture.awayTeamId)) {
    return { ok: false, reason: "Missing away team id" };
  }
  return { ok: true };
}

export function mapApiFixtureToSchedulerSource(
  fixture: ApiFootballFixtureRecord
): SchedulerFixtureSource {
  const validation = validateApiFixtureRecord(fixture);
  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  const leagueName = fixture.league!.trim();
  const homeTeam = fixture.homeTeam.trim();
  const awayTeam = fixture.awayTeam.trim();

  return {
    fixtureId: fixture.fixtureId,
    matchDate: fixture.date,
    league: leagueName,
    leagueName,
    leagueId: fixture.leagueId!,
    season: fixture.season,
    kickoffTime: fixture.kickoffTime ?? `${fixture.date}T00:00:00.000Z`,
    homeTeam,
    awayTeam,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    status: fixture.status,
  };
}

export function intakeApiFixtures(
  apiFixtures: ApiFootballFixtureRecord[]
): FixtureIntakeResult {
  const fixtures: SchedulerFixtureSource[] = [];
  const skipped: FixtureMappingSkip[] = [];

  for (const fixture of apiFixtures) {
    const validation = validateApiFixtureRecord(fixture);
    if (!validation.ok) {
      skipped.push({
        fixtureId: fixture.fixtureId ?? null,
        homeTeam: fixture.homeTeam ?? null,
        awayTeam: fixture.awayTeam ?? null,
        reason: validation.reason,
      });
      continue;
    }

    fixtures.push(mapApiFixtureToSchedulerSource(fixture));
  }

  return { fixtures, skipped };
}

export function toProductionFixture(source: SchedulerFixtureSource): ProductionFixture {
  if (!source.rawOdds?.trim()) {
    throw new Error(`Missing rawOdds for fixture ${source.fixtureId}`);
  }

  return {
    matchDate: source.matchDate,
    league: source.leagueName,
    leagueName: source.leagueName,
    leagueId: source.leagueId!,
    season: source.season,
    fixtureId: source.fixtureId,
    kickoffTime: source.kickoffTime,
    homeTeam: source.homeTeam,
    awayTeam: source.awayTeam,
    homeTeamId: source.homeTeamId,
    awayTeamId: source.awayTeamId,
    rawOdds: source.rawOdds,
  };
}

export function enrichAnalysisReportWithFixture(
  report: AnalysisReport,
  fixture: ProductionFixture
): AnalysisReport {
  return {
    ...report,
    match: {
      ...report.match,
      league: fixture.leagueName,
      leagueId: fixture.leagueId,
      season: fixture.season,
      fixtureId: fixture.fixtureId,
      kickoffTime: fixture.kickoffTime,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
    },
  };
}
