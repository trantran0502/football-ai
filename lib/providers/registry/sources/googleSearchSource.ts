import type {
  FeatureProviderKey,
  ProviderDataByKey,
  ProviderRequestByKey,
} from "@/lib/providers/registry/types";
import {
  extractProviderDataFromContext,
  resolveHybridTeamContext,
} from "@/lib/hybrid/hybridDataResolver";
import {
  buildGoogleSearchCacheKey,
  getCachedGooglePayload,
} from "@/lib/providers/googleSearch/googleSearchCache";

const TEAM_CONTEXT_QUERY = "team context grounding";

/**
 * Google Search / Gemini Grounding source adapter.
 * Reads structured cached payloads only in sync mode; live fetch happens in hybrid resolver.
 */
export function fetchGoogleSearchSourceData<K extends FeatureProviderKey>(
  providerKey: K,
  request: ProviderRequestByKey[K]
): ProviderDataByKey[K] | null {
  if (providerKey === "leagueStrength") {
    const leagueRequest = request as ProviderRequestByKey["leagueStrength"];
    const cacheKey = buildGoogleSearchCacheKey({
      homeTeam: "",
      awayTeam: "",
      query: `${TEAM_CONTEXT_QUERY}:${leagueRequest.leagueName}`,
    });
    const payload = getCachedGooglePayload(cacheKey);
    if (!payload) {
      return null;
    }
    const context = resolveHybridTeamContext(
      { homeTeam: "", awayTeam: "" },
      { googlePayload: payload, apiPayload: null }
    );
    return extractProviderDataFromContext(providerKey, context, request);
  }

  const teamRequest = request as ProviderRequestByKey["recentForm"];
  const cacheKey = buildGoogleSearchCacheKey({
    homeTeam: teamRequest.homeTeam,
    awayTeam: teamRequest.awayTeam,
    matchDate: teamRequest.matchDate,
    query: TEAM_CONTEXT_QUERY,
  });
  const payload = getCachedGooglePayload(cacheKey);
  if (!payload) {
    return null;
  }

  const context = resolveHybridTeamContext(
    {
      homeTeam: teamRequest.homeTeam,
      awayTeam: teamRequest.awayTeam,
      matchDate: teamRequest.matchDate,
    },
    { googlePayload: payload, apiPayload: null }
  );
  return extractProviderDataFromContext(providerKey, context, request);
}
