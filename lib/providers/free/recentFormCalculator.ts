import type {
  RecentMatchSummary,
  TeamRecentForm,
} from "@/lib/providers/free/types";

function roundRate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function emptyForm(): TeamRecentForm {
  return {
    sampleSize: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    avgGoalsFor: null,
    avgGoalsAgainst: null,
    bttsRate: null,
    over25Rate: null,
    scoredRate: null,
    firstHalfGoalRate: null,
  };
}

/**
 * 從最近比賽自行計算近況統計。
 * 樣本不足時比率欄位保持 null。
 */
export function calculateTeamRecentForm(
  matches: RecentMatchSummary[],
  maxSample = 10
): TeamRecentForm {
  const sample = matches.slice(0, maxSample);
  if (sample.length === 0) {
    return emptyForm();
  }

  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let bttsCount = 0;
  let over25Count = 0;
  let scoredCount = 0;
  let firstHalfGoalCount = 0;

  for (const match of sample) {
    const scored = match.isHome ? match.homeGoals : match.awayGoals;
    const conceded = match.isHome ? match.awayGoals : match.homeGoals;

    goalsFor += scored;
    goalsAgainst += conceded;

    if (scored > conceded) {
      wins += 1;
    } else if (scored < conceded) {
      losses += 1;
    } else {
      draws += 1;
    }

    if (match.homeGoals > 0 && match.awayGoals > 0) {
      bttsCount += 1;
    }
    if (match.homeGoals + match.awayGoals > 2) {
      over25Count += 1;
    }
    if (scored > 0) {
      scoredCount += 1;
    }

    const htScored = match.isHome
      ? (match.halfTimeHome ?? 0)
      : (match.halfTimeAway ?? 0);
    if (htScored > 0) {
      firstHalfGoalCount += 1;
    }
  }

  const n = sample.length;

  return {
    sampleSize: n,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    avgGoalsFor: roundRate(goalsFor / n),
    avgGoalsAgainst: roundRate(goalsAgainst / n),
    bttsRate: roundRate(bttsCount / n),
    over25Rate: roundRate(over25Count / n),
    scoredRate: roundRate(scoredCount / n),
    firstHalfGoalRate: roundRate(firstHalfGoalCount / n),
  };
}

export function toRecentMatchSummary(
  fixture: {
    fixtureId: number;
    date: string;
    league: string | null;
    homeTeam: string;
    awayTeam: string;
    homeGoals: number;
    awayGoals: number;
    halfTimeHome: number | null;
    halfTimeAway: number | null;
  },
  perspectiveTeam: string
): RecentMatchSummary {
  const isHome =
    fixture.homeTeam.toLowerCase() === perspectiveTeam.toLowerCase();

  return {
    fixtureId: fixture.fixtureId,
    date: fixture.date,
    league: fixture.league,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    homeGoals: fixture.homeGoals,
    awayGoals: fixture.awayGoals,
    halfTimeHome: fixture.halfTimeHome,
    halfTimeAway: fixture.halfTimeAway,
    isHome,
  };
}
