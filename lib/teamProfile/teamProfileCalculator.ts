import { calculateTeamRecentForm, toRecentMatchSummary } from "@/lib/providers/free/recentFormCalculator";
import {
  filterAwayMatches,
  filterHomeMatches,
} from "@/lib/teamProfile/teamProfileNormalizer";
import {
  calculateFormScore,
  calculateMomentumScore,
  clampRate,
  outcomePointsForTeam,
  roundMetric,
} from "@/lib/teamProfile/teamProfileFormScore";
import type {
  TeamProfile,
  TeamProfileAdvancedStatsInput,
  TeamProfileIdentity,
  TeamProfileMatchInput,
  TeamProfileSource,
  TeamProfileSeasonMetadata,
} from "@/lib/teamProfile/teamProfileTypes";

interface VenueMetrics {
  matches: number | null;
  winRate: number | null;
  avgGoals: number | null;
  avgConceded: number | null;
}

export function calculateTeamProfile(input: {
  identity: TeamProfileIdentity;
  matches: TeamProfileMatchInput[];
  advancedStats?: TeamProfileAdvancedStatsInput | null;
  source: TeamProfileSource;
  calculatedAt?: string;
  seasonMetadata?: TeamProfileSeasonMetadata;
}): TeamProfile {
  const recent10 = input.matches.slice(0, 10);
  const sampleSize = recent10.length;
  const calculatedAt = input.calculatedAt ?? new Date().toISOString();

  const recentSummaries = recent10.map((match) =>
    toRecentMatchSummary(
      {
        fixtureId: match.fixtureId,
        date: match.date,
        league: match.league,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeGoals: match.homeGoals,
        awayGoals: match.awayGoals,
        halfTimeHome: match.halfTimeHome,
        halfTimeAway: match.halfTimeAway,
      },
      input.identity.teamName
    )
  );
  const recentForm = calculateTeamRecentForm(recentSummaries, 10);

  const home5 = buildVenueMetrics(
    filterHomeMatches(input.matches, input.identity.teamId).slice(0, 5),
    input.identity.teamId,
    true
  );
  const away5 = buildVenueMetrics(
    filterAwayMatches(input.matches, input.identity.teamId).slice(0, 5),
    input.identity.teamId,
    false
  );

  const over35Rate = calculateOverRate(recent10, 3.5);
  const under25Rate =
    recentForm.over25Rate === null ? null : clampRate(1 - recentForm.over25Rate);
  const cleanSheetRate = calculateCleanSheetRate(recent10, input.identity.teamId);
  const failedToScoreRate =
    recentForm.scoredRate === null
      ? null
      : clampRate(1 - recentForm.scoredRate);

  const outcomes = recent10.map((match) => ({
    date: match.date,
    points: outcomePointsForTeam(match, input.identity.teamId),
  }));

  const perMatchAdvanced = aggregatePerMatchAdvancedStats(recent10);
  const advanced = mergeAdvancedStats(perMatchAdvanced, input.advancedStats ?? null);
  const seasonMetadata = input.seasonMetadata;
  const requestedSeason = seasonMetadata?.requestedSeason ?? input.identity.season;
  const dataSeason = seasonMetadata?.dataSeason ?? input.identity.season;

  const profile: TeamProfile = {
    teamId: input.identity.teamId,
    teamName: input.identity.teamName,
    leagueId: input.identity.leagueId,
    leagueName: input.identity.leagueName,
    season: dataSeason,
    requestedSeason,
    isHistoricalBaseline: seasonMetadata?.isHistoricalBaseline ?? false,
    stalenessYears: seasonMetadata?.stalenessYears ?? null,
    sampleSize,
    recent10Wins: sampleSize > 0 ? recentForm.wins : null,
    recent10Draws: sampleSize > 0 ? recentForm.draws : null,
    recent10Losses: sampleSize > 0 ? recentForm.losses : null,
    recent10PointsPerGame:
      sampleSize > 0
        ? roundMetric((recentForm.wins * 3 + recentForm.draws) / sampleSize)
        : null,
    recent10AvgGoals: recentForm.avgGoalsFor,
    recent10AvgConceded: recentForm.avgGoalsAgainst,
    home5Matches: home5.matches,
    home5WinRate: home5.winRate,
    home5AvgGoals: home5.avgGoals,
    home5AvgConceded: home5.avgConceded,
    away5Matches: away5.matches,
    away5WinRate: away5.winRate,
    away5AvgGoals: away5.avgGoals,
    away5AvgConceded: away5.avgConceded,
    bttsRate: recentForm.bttsRate === null ? null : clampRate(recentForm.bttsRate),
    over25Rate: recentForm.over25Rate === null ? null : clampRate(recentForm.over25Rate),
    over35Rate,
    under25Rate,
    cleanSheetRate,
    failedToScoreRate,
    avgShots: advanced.avgShots ?? null,
    avgShotsOnTarget: advanced.avgShotsOnTarget ?? null,
    avgPossession: advanced.avgPossession ?? null,
    avgXg: advanced.avgXg ?? null,
    avgXga: advanced.avgXga ?? null,
    formScore: calculateFormScore(outcomes),
    momentumScore: calculateMomentumScore(outcomes),
    source: input.source,
    dataCompleteness: 0,
    calculatedAt,
  };

  profile.dataCompleteness = calculateTeamProfileCompleteness(profile);
  return profile;
}

export function calculateTeamProfileCompleteness(profile: TeamProfile): number {
  let essentialPresent = 0;
  const essentialTotal = 6;

  if (profile.sampleSize > 0) {
    essentialPresent += 1;
  }
  if (profile.recent10AvgGoals !== null) {
    essentialPresent += 1;
  }
  if (profile.recent10AvgConceded !== null) {
    essentialPresent += 1;
  }
  if ((profile.home5Matches ?? 0) > 0 || (profile.away5Matches ?? 0) > 0) {
    essentialPresent += 1;
  }
  if (profile.bttsRate !== null) {
    essentialPresent += 1;
  }
  if (profile.over25Rate !== null) {
    essentialPresent += 1;
  }

  let advancedPresent = 0;
  const advancedTotal = 5;
  if (profile.avgShots !== null) {
    advancedPresent += 1;
  }
  if (profile.avgShotsOnTarget !== null) {
    advancedPresent += 1;
  }
  if (profile.avgPossession !== null) {
    advancedPresent += 1;
  }
  if (profile.avgXg !== null) {
    advancedPresent += 1;
  }
  if (profile.avgXga !== null) {
    advancedPresent += 1;
  }

  const essentialScore = (essentialPresent / essentialTotal) * 70;
  const advancedScore = (advancedPresent / advancedTotal) * 30;
  let score = Math.min(100, essentialScore + advancedScore);

  if (profile.isHistoricalBaseline && profile.stalenessYears && profile.stalenessYears > 0) {
    score = Math.max(0, score - Math.min(35, profile.stalenessYears * 12));
  }

  return roundMetric(score, 1);
}

function buildVenueMetrics(
  matches: TeamProfileMatchInput[],
  teamId: number,
  isHomeVenue: boolean
): VenueMetrics {
  if (matches.length === 0) {
    return {
      matches: null,
      winRate: null,
      avgGoals: null,
      avgConceded: null,
    };
  }

  let wins = 0;
  let goals = 0;
  let conceded = 0;

  for (const match of matches) {
    const isHome = match.homeTeamId === teamId;
    if (isHomeVenue !== isHome) {
      continue;
    }
    const scored = isHome ? match.homeGoals : match.awayGoals;
    const against = isHome ? match.awayGoals : match.homeGoals;
    goals += scored;
    conceded += against;
    if (scored > against) {
      wins += 1;
    }
  }

  const count = matches.length;
  return {
    matches: count,
    winRate: clampRate(wins / count),
    avgGoals: roundMetric(goals / count),
    avgConceded: roundMetric(conceded / count),
  };
}

function calculateOverRate(matches: TeamProfileMatchInput[], line: number): number | null {
  if (matches.length === 0) {
    return null;
  }
  const hits = matches.filter(
    (match) => match.homeGoals + match.awayGoals > line
  ).length;
  return clampRate(hits / matches.length);
}

function calculateCleanSheetRate(
  matches: TeamProfileMatchInput[],
  teamId: number
): number | null {
  if (matches.length === 0) {
    return null;
  }
  const cleanSheets = matches.filter((match) => {
    const isHome = match.homeTeamId === teamId;
    const conceded = isHome ? match.awayGoals : match.homeGoals;
    return conceded === 0;
  }).length;
  return clampRate(cleanSheets / matches.length);
}

function aggregatePerMatchAdvancedStats(matches: TeamProfileMatchInput[]): TeamProfileAdvancedStatsInput {
  const fields: Array<keyof TeamProfileAdvancedStatsInput> = [
    "avgShots",
    "avgShotsOnTarget",
    "avgPossession",
    "avgXg",
    "avgXga",
  ];
  const sourceMap: Record<keyof TeamProfileAdvancedStatsInput, keyof TeamProfileMatchInput> = {
    avgShots: "shots",
    avgShotsOnTarget: "shotsOnTarget",
    avgPossession: "possession",
    avgXg: "xg",
    avgXga: "xga",
  };

  const result: TeamProfileAdvancedStatsInput = {};
  for (const field of fields) {
    const sourceField = sourceMap[field];
    const values = matches
      .map((match) => match[sourceField])
      .filter((value): value is number => typeof value === "number");
    result[field] = values.length > 0
      ? roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length)
      : null;
  }
  return result;
}

function mergeAdvancedStats(
  perMatch: TeamProfileAdvancedStatsInput,
  seasonStats: TeamProfileAdvancedStatsInput | null
): TeamProfileAdvancedStatsInput {
  return {
    avgShots: perMatch.avgShots ?? seasonStats?.avgShots ?? null,
    avgShotsOnTarget:
      perMatch.avgShotsOnTarget ?? seasonStats?.avgShotsOnTarget ?? null,
    avgPossession: perMatch.avgPossession ?? seasonStats?.avgPossession ?? null,
    avgXg: perMatch.avgXg ?? seasonStats?.avgXg ?? null,
    avgXga: perMatch.avgXga ?? seasonStats?.avgXga ?? null,
  };
}
