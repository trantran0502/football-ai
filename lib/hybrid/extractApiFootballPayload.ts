import type { ApiFootballMatchBundle } from "@/lib/providers/apiFootball/apiFootballTypes";
import {
  filterOfficialMatches,
  filterVenueMatches,
  inferCompetitionType,
  sortMatchesDesc,
  takeRecentMatches,
} from "@/lib/hybrid/matchComparison";
import type {
  HybridInjuryRecord,
  HybridMatchRecord,
  HybridSourcePayload,
  HybridStandingRecord,
  HybridTeamMetrics,
  HybridVenueSide,
} from "@/lib/hybrid/hybridTypes";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";

function mapFixtureToHybridRecord(
  fixture: ApiFootballFixtureRecord,
  perspectiveTeamId: number
): HybridMatchRecord {
  const isHome = fixture.homeTeamId === perspectiveTeamId;
  const venue: HybridVenueSide = fixture.neutralVenue
    ? "neutral"
    : isHome
      ? "home"
      : "away";

  return {
    matchDate: fixture.date,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    homeGoals: fixture.homeGoals,
    awayGoals: fixture.awayGoals,
    competition: fixture.league ?? "Unknown",
    competitionType: inferCompetitionType(fixture.league ?? ""),
    venue,
    neutralVenue: fixture.neutralVenue,
    includesExtraTime: fixture.status === "AET",
    includesPenalties: fixture.status === "PEN",
  };
}

function mapFixturesForTeam(
  fixtures: ApiFootballFixtureRecord[],
  teamId: number
): HybridMatchRecord[] {
  return sortMatchesDesc(
    fixtures.map((fixture) => mapFixtureToHybridRecord(fixture, teamId))
  );
}

function buildStandings(bundle: ApiFootballMatchBundle): HybridStandingRecord[] {
  return bundle.standings.map((standing) => ({
    teamName: standing.team,
    rank: standing.rank,
    played: standing.played,
    points: standing.points,
    goalsFor: standing.goalsFor,
    goalsAgainst: standing.goalsAgainst,
  }));
}

function buildInjuries(bundle: ApiFootballMatchBundle): HybridInjuryRecord[] {
  return bundle.injuries.map((injury) => ({
    teamName:
      injury.teamId === bundle.homeTeam.id
        ? bundle.homeTeam.name
        : injury.teamId === bundle.awayTeam.id
          ? bundle.awayTeam.name
          : "Unknown",
    playerName: injury.playerName,
    reason: injury.reason ?? "",
    status: injury.type ?? "",
  }));
}

function buildMetrics(
  stats: ApiFootballMatchBundle["homeStatistics"]
): HybridTeamMetrics | null {
  if (!stats) {
    return null;
  }

  return {
    goalsFor: stats.goalsFor,
    goalsAgainst: stats.goalsAgainst,
    xg: stats.expectedGoals,
    xga: stats.expectedGoalsAgainst,
    shots: stats.shotsTotal,
    shotsOnTarget: stats.shotsOnTarget,
    possession: null,
    cleanSheets: stats.cleanSheets,
    failedToScore: stats.failedToScore,
  };
}

export function extractApiFootballHybridPayload(
  bundle: ApiFootballMatchBundle,
  fetchedAt: string = new Date().toISOString()
): HybridSourcePayload {
  const homeFixtures = mapFixturesForTeam(bundle.homeForm.fixtures, bundle.homeTeam.id);
  const awayFixtures = mapFixturesForTeam(bundle.awayForm.fixtures, bundle.awayTeam.id);
  const officialHome = filterOfficialMatches(homeFixtures, false);
  const officialAway = filterOfficialMatches(awayFixtures, false);

  return {
    source: "apiFootball",
    fetchedAt,
    confidence: 0.85,
    citations: [],
    queries: [],
    homeTeam: bundle.homeTeam.name,
    awayTeam: bundle.awayTeam.name,
    matchDate: bundle.fixture?.date,
    recentFormLast10Official: takeRecentMatches(officialHome, 10),
    recentFormLast5Home: takeRecentMatches(
      filterVenueMatches(officialHome, bundle.homeTeam.name, "home"),
      5
    ),
    recentFormLast5Away: takeRecentMatches(
      filterVenueMatches(officialAway, bundle.awayTeam.name, "away"),
      5
    ),
    includesFriendlies: false,
    includesExtraTime: false,
    includesPenalties: false,
    h2hLast5Official: takeRecentMatches(
      filterOfficialMatches(
        sortMatchesDesc(
          bundle.headToHead.map((fixture) =>
            mapFixtureToHybridRecord(fixture, bundle.homeTeam.id)
          )
        ),
        false
      ),
      5
    ),
    standings: buildStandings(bundle),
    injuries: buildInjuries(bundle),
    suspensions: [],
    homeMetrics: buildMetrics(bundle.homeStatistics),
    awayMetrics: buildMetrics(bundle.awayStatistics),
    matchStatus: {
      importance: bundle.fixture?.league ?? null,
      mustWin: null,
      alreadyQualified: null,
      alreadyEliminated: null,
      weather: null,
      longTravelAway: null,
      congestedSchedule: null,
      coachNews: null,
      officialNews: null,
      rotation: null,
    },
  };
}
