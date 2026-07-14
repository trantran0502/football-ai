import { fetchFreeTeamData } from "@/lib/providers/free/server/freeFootballService";
import {
  buildFixtureCacheKey,
  getCachedTeamData,
  saveApiUsage,
  saveFinalScorePermanently,
  setCachedTeamData,
} from "@/lib/providers/free/providerCache";
import type { TeamDataRequest, TeamDataResponse } from "@/lib/providers/free/types";

export async function fetchTeamDataServerSide(
  request: TeamDataRequest
): Promise<TeamDataResponse> {
  const cacheKey = buildFixtureCacheKey(
    request.homeTeam,
    request.awayTeam,
    request.matchDate
  );

  const cached = getCachedTeamData(cacheKey);
  if (cached) {
    return {
      ok: true,
      data: cached,
      fromCache: true,
    };
  }

  try {
    const data = await fetchFreeTeamData({
      homeTeam: request.homeTeam.trim(),
      awayTeam: request.awayTeam.trim(),
      matchDate: request.matchDate,
      league: request.league,
    });

    setCachedTeamData(cacheKey, data);
    saveApiUsage(data.usage);

    if (data.finalScore && data.fixture.fixtureId) {
      saveFinalScorePermanently(data.fixture.fixtureId, data.finalScore);
    }

    return {
      ok: true,
      data,
      fromCache: false,
    };
  } catch (error) {
    return {
      ok: false,
      data: null,
      fromCache: false,
      message: error instanceof Error ? error.message : "Failed to fetch team data.",
    };
  }
}
