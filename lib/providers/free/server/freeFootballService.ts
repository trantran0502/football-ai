import {
  PREMIUM_UNAVAILABLE_FIELDS,
  UNAVAILABLE_FREE_LABEL,
  type BasicMatchStatistics,
  type DataCompleteness,
  type FinalScore,
  type PremiumUnavailableData,
  type RecentMatchSummary,
  type StandingRow,
  type TeamDataPackage,
  type TeamDataRequest,
  type TeamRecentForm,
} from "@/lib/providers/free/types";
import { RECENT_MATCH_SAMPLE_SIZE, getApiFootballKey, getFootballDataOrgKey } from "@/lib/providers/free/config";
import {
  calculateTeamRecentForm,
  toRecentMatchSummary,
} from "@/lib/providers/free/recentFormCalculator";
import {
  findFixtureOnDate,
  getFixtureStatistics,
  getHeadToHeadFixtures,
  getStandings,
  getTeamRecentFixtures,
  searchTeam,
  type ApiFootballFixture,
} from "@/lib/providers/free/server/apiFootballClient";
import {
  getTeamFinishedMatches,
  searchTeamId,
} from "@/lib/providers/free/server/footballDataOrgClient";
import {
  canMakeApiRequest,
  getApiUsageInfo,
} from "@/lib/providers/free/server/serverQuota";

function emptyPremiumData(): PremiumUnavailableData {
  return {
    xG: null,
    xGA: null,
    injuries: null,
    suspensions: null,
    rotationInfo: null,
    asianOddsHistory: null,
  };
}

function mapFixtureList(
  fixtures: ApiFootballFixture[],
  perspectiveTeam: string
): RecentMatchSummary[] {
  return fixtures.map((fixture) =>
    toRecentMatchSummary(
      {
        fixtureId: fixture.fixtureId,
        date: fixture.date,
        league: fixture.league,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        homeGoals: fixture.homeGoals ?? 0,
        awayGoals: fixture.awayGoals ?? 0,
        halfTimeHome: fixture.halfTimeHome,
        halfTimeAway: fixture.halfTimeAway,
      },
      perspectiveTeam
    )
  );
}

function buildCompleteness(data: {
  fixtureId: number | null;
  finalScore: FinalScore | null;
  standings: StandingRow[] | null;
  homeRecentForm: TeamRecentForm | null;
  awayRecentForm: TeamRecentForm | null;
  homeHomeForm: TeamRecentForm | null;
  awayAwayForm: TeamRecentForm | null;
  headToHeadCount: number;
  matchStatistics: BasicMatchStatistics | null;
}): DataCompleteness {
  const checks: Array<[string, boolean]> = [
    ["fixtureId", data.fixtureId !== null],
    ["finalScore", data.finalScore !== null],
    ["standings", Array.isArray(data.standings) && data.standings.length > 0],
    ["homeRecentForm", data.homeRecentForm !== null && data.homeRecentForm.sampleSize > 0],
    ["awayRecentForm", data.awayRecentForm !== null && data.awayRecentForm.sampleSize > 0],
    ["homeHomeForm", data.homeHomeForm !== null && data.homeHomeForm.sampleSize > 0],
    ["awayAwayForm", data.awayAwayForm !== null && data.awayAwayForm.sampleSize > 0],
    ["headToHead", data.headToHeadCount > 0],
    ["matchStatistics", data.matchStatistics !== null],
  ];

  const available = checks.filter(([, ok]) => ok).length;
  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);

  for (const field of PREMIUM_UNAVAILABLE_FIELDS) {
    missing.push(field);
  }

  const total = checks.length + PREMIUM_UNAVAILABLE_FIELDS.length;
  const percent = Math.round((available / checks.length) * 100);

  return {
    percent,
    available,
    total,
    missing,
  };
}

async function fetchRecentWithBackup(
  teamName: string,
  teamId: number | null,
  venue?: "home" | "away"
): Promise<ApiFootballFixture[]> {
  if (teamId && canMakeApiRequest(1)) {
    try {
      return await getTeamRecentFixtures(teamId, RECENT_MATCH_SAMPLE_SIZE, venue);
    } catch {
      // fallback below
    }
  }

  if (!canMakeApiRequest(1)) {
    return [];
  }

  try {
    const backupTeamId = await searchTeamId(teamName);
    if (!backupTeamId) {
      return [];
    }
    const matches = await getTeamFinishedMatches(backupTeamId, RECENT_MATCH_SAMPLE_SIZE);
    if (!venue) {
      return matches;
    }
    return matches.filter((match) =>
      venue === "home"
        ? match.homeTeam.toLowerCase().includes(teamName.toLowerCase())
        : match.awayTeam.toLowerCase().includes(teamName.toLowerCase())
    );
  } catch {
    return [];
  }
}

export async function fetchFreeTeamData(
  request: TeamDataRequest
): Promise<TeamDataPackage> {
  const errors: string[] = [];
  const sources: TeamDataPackage["sources"] = [];

  const emptyFixture = {
    fixtureId: null,
    league: request.league ?? null,
    leagueId: null,
    date: request.matchDate ?? null,
    homeTeam: request.homeTeam,
    awayTeam: request.awayTeam,
    homeTeamId: null,
    awayTeamId: null,
    status: null,
  };

  const buildEmpty = (message: string): TeamDataPackage => ({
    mode: "free",
    fetchedAt: new Date().toISOString(),
    sources,
    fixture: emptyFixture,
    finalScore: null,
    standings: null,
    homeRecentMatches: [],
    awayRecentMatches: [],
    headToHead: [],
    homeRecentForm: null,
    awayRecentForm: null,
    homeHomeForm: null,
    awayAwayForm: null,
    matchStatistics: null,
    premium: emptyPremiumData(),
    unavailableFields: [...PREMIUM_UNAVAILABLE_FIELDS],
    completeness: buildCompleteness({
      fixtureId: null,
      finalScore: null,
      standings: null,
      homeRecentForm: null,
      awayRecentForm: null,
      homeHomeForm: null,
      awayAwayForm: null,
      headToHeadCount: 0,
      matchStatistics: null,
    }),
    usage: getApiUsageInfo(),
    errors: [message, ...errors],
  });

  if (!getApiFootballKey() && !getFootballDataOrgKey()) {
    return buildEmpty("請在 .env 設定 API_FOOTBALL_KEY 或 FOOTBALL_DATA_ORG_KEY。");
  }

  if (!canMakeApiRequest(1)) {
    return buildEmpty("API 額度已用完，仍可繼續使用盤口分析。");
  }

  let homeTeamId: number | null = null;
  let awayTeamId: number | null = null;
  let fixture = null as Awaited<ReturnType<typeof findFixtureOnDate>> | null;

  try {
    const home = await searchTeam(request.homeTeam);
    const away = await searchTeam(request.awayTeam);
    if (home) {
      homeTeamId = home.id;
      sources.push("api-football");
    }
    if (away) {
      awayTeamId = away.id;
      if (!sources.includes("api-football")) {
        sources.push("api-football");
      }
    }

    if (homeTeamId && awayTeamId) {
      fixture = await findFixtureOnDate(
        homeTeamId,
        awayTeamId,
        request.matchDate
      );
    }
  } catch (error) {
    errors.push(
      error instanceof Error ? error.message : "API-Football 查詢失敗"
    );
  }

  if (!homeTeamId || !awayTeamId) {
    try {
      homeTeamId = homeTeamId ?? (await searchTeamId(request.homeTeam));
      awayTeamId = awayTeamId ?? (await searchTeamId(request.awayTeam));
      if (homeTeamId || awayTeamId) {
        sources.push("football-data.org");
      }
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : "football-data.org 查詢失敗"
      );
    }
  }

  const homeRecentFixtures = await fetchRecentWithBackup(
    request.homeTeam,
    homeTeamId
  );
  const awayRecentFixtures = await fetchRecentWithBackup(
    request.awayTeam,
    awayTeamId
  );
  const homeHomeFixtures = homeTeamId
    ? await fetchRecentWithBackup(request.homeTeam, homeTeamId, "home")
    : [];
  const awayAwayFixtures = awayTeamId
    ? await fetchRecentWithBackup(request.awayTeam, awayTeamId, "away")
    : [];

  let headToHeadFixtures: ApiFootballFixture[] = [];
  if (homeTeamId && awayTeamId && canMakeApiRequest(1)) {
    try {
      headToHeadFixtures = await getHeadToHeadFixtures(
        homeTeamId,
        awayTeamId,
        RECENT_MATCH_SAMPLE_SIZE
      );
      sources.push("api-football");
    } catch {
      errors.push("最近交手資料取得失敗。");
    }
  }

  let standings: StandingRow[] | null = null;
  const leagueId = fixture?.leagueId;
  if (leagueId && canMakeApiRequest(1)) {
    try {
      const season = new Date().getFullYear();
      standings = await getStandings(leagueId, season);
      if (standings.length === 0) {
        standings = null;
      }
    } catch {
      errors.push("積分榜資料取得失敗。");
    }
  }

  let matchStatistics: BasicMatchStatistics | null = null;
  if (fixture?.fixtureId && canMakeApiRequest(1)) {
    try {
      matchStatistics = await getFixtureStatistics(fixture.fixtureId);
    } catch {
      errors.push("比賽統計資料取得失敗。");
    }
  }

  const homeRecentMatches = mapFixtureList(homeRecentFixtures, request.homeTeam);
  const awayRecentMatches = mapFixtureList(awayRecentFixtures, request.awayTeam);
  const headToHead = mapFixtureList(headToHeadFixtures, request.homeTeam);

  const homeRecentForm =
    homeRecentMatches.length > 0
      ? calculateTeamRecentForm(homeRecentMatches)
      : null;
  const awayRecentForm =
    awayRecentMatches.length > 0
      ? calculateTeamRecentForm(awayRecentMatches)
      : null;
  const homeHomeForm =
    homeHomeFixtures.length > 0
      ? calculateTeamRecentForm(mapFixtureList(homeHomeFixtures, request.homeTeam))
      : null;
  const awayAwayForm =
    awayAwayFixtures.length > 0
      ? calculateTeamRecentForm(mapFixtureList(awayAwayFixtures, request.awayTeam))
      : null;

  if (
    homeRecentForm ||
    awayRecentForm ||
    homeHomeForm ||
    awayAwayForm
  ) {
    sources.push("calculated");
  }

  const finalScore =
    fixture &&
    fixture.homeGoals !== null &&
    fixture.awayGoals !== null &&
    ["FT", "AET", "PEN"].includes(fixture.status)
      ? {
          home: fixture.homeGoals,
          away: fixture.awayGoals,
          halfTimeHome: fixture.halfTimeHome,
          halfTimeAway: fixture.halfTimeAway,
        }
      : null;

  const packageData: TeamDataPackage = {
    mode: "free",
    fetchedAt: new Date().toISOString(),
    sources: [...new Set(sources)],
    fixture: {
      fixtureId: fixture?.fixtureId ?? null,
      league: fixture?.league ?? request.league ?? null,
      leagueId: fixture?.leagueId ?? null,
      date: fixture?.date ?? request.matchDate ?? null,
      homeTeam: request.homeTeam,
      awayTeam: request.awayTeam,
      homeTeamId,
      awayTeamId,
      status: fixture?.status ?? null,
    },
    finalScore,
    standings,
    homeRecentMatches,
    awayRecentMatches,
    headToHead,
    homeRecentForm,
    awayRecentForm,
    homeHomeForm,
    awayAwayForm,
    matchStatistics,
    premium: emptyPremiumData(),
    unavailableFields: [...PREMIUM_UNAVAILABLE_FIELDS],
    completeness: buildCompleteness({
      fixtureId: fixture?.fixtureId ?? null,
      finalScore,
      standings,
      homeRecentForm,
      awayRecentForm,
      homeHomeForm,
      awayAwayForm,
      headToHeadCount: headToHead.length,
      matchStatistics,
    }),
    usage: getApiUsageInfo(),
    errors,
  };

  return packageData;
}
