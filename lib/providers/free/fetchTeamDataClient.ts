import {
  buildFixtureCacheKey,
  getCachedTeamData,
  saveApiUsage,
  saveFinalScorePermanently,
  setCachedTeamData,
} from "@/lib/providers/free/providerCache";
import type {
  TeamDataPackage,
  TeamDataRequest,
  TeamDataResponse,
} from "@/lib/providers/free/types";

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

  const response = await fetch("/api/football/team-data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  const payload = (await response.json()) as TeamDataResponse;

  if (payload.ok && payload.data) {
    setCachedTeamData(cacheKey, payload.data);
    saveApiUsage(payload.data.usage);

    if (payload.data.finalScore && payload.data.fixture.fixtureId) {
      saveFinalScorePermanently(
        payload.data.fixture.fixtureId,
        payload.data.finalScore
      );
    }
  }

  return payload;
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
