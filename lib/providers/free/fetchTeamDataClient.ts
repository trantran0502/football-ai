import {
  buildFixtureCacheKey,
  getCachedTeamData,
} from "@/lib/providers/free/providerCache";
import type {
  TeamDataPackage,
  TeamDataRequest,
  TeamDataResponse,
} from "@/lib/providers/free/types";

function isBrowserClient(): boolean {
  return typeof window !== "undefined";
}

/**
 * RC2: browser clients may only read local cache.
 * Live team-data fetch requires admin-authenticated server route.
 */
export async function fetchTeamDataClient(
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

  if (isBrowserClient()) {
    return {
      ok: false,
      data: null,
      fromCache: false,
      message: "Team data API requires server-side access. Using local cache only.",
    };
  }

  const { fetchTeamDataServerSide } = await import("@/lib/providers/free/server/fetchTeamDataServer");
  return fetchTeamDataServerSide(request);
}

export function formatUnavailableField(field: string): string {
  return `${field}：免費資料源未提供`;
}

export function summarizeTeamForm(
  label: string,
  form: TeamDataPackage["homeRecentForm"]
): string | null {
  if (!form || form.sampleSize === 0) {
    return null;
  }

  return `${label}（${form.sampleSize} 場）${form.wins}勝${form.draws}和${form.losses}負，進 ${form.goalsFor} 失 ${form.goalsAgainst}`;
}
