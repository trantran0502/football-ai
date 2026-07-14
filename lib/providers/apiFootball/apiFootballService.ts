import {
  ApiFootballClient,
  getApiFootballClient,
} from "@/lib/providers/apiFootball/apiFootballClient";
import {
  buildApiFootballCacheKey,
  getApiFootballCacheStore,
} from "@/lib/providers/apiFootball/apiFootballCache";
import { mapProviderDataFromBundle } from "@/lib/providers/apiFootball/apiFootballMapper";
import type { ApiFootballMatchBundle } from "@/lib/providers/apiFootball/apiFootballTypes";
import type {
  FeatureProviderKey,
  ProviderDataByKey,
  ProviderRequestByKey,
} from "@/lib/providers/registry/types";

export interface ApiFootballMatchRequest {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
  leagueName?: string;
}

const providerSyncCache = new Map<string, ProviderDataByKey[FeatureProviderKey]>();

export function readApiFootballProviderCache<K extends FeatureProviderKey>(
  providerKey: K,
  request: ProviderRequestByKey[K]
): ProviderDataByKey[K] | null {
  const cacheKey = `${providerKey}:${JSON.stringify(request)}`;
  return (providerSyncCache.get(cacheKey) as ProviderDataByKey[K] | undefined) ?? null;
}

function rememberProviderCache<K extends FeatureProviderKey>(
  providerKey: K,
  request: ProviderRequestByKey[K],
  data: ProviderDataByKey[K]
): void {
  providerSyncCache.set(`${providerKey}:${JSON.stringify(request)}`, data);
}

export async function buildApiFootballMatchBundle(
  request: ApiFootballMatchRequest,
  client: ApiFootballClient = getApiFootballClient()
): Promise<ApiFootballMatchBundle | null> {
  if (!client.isConfigured()) {
    return null;
  }

  const cacheStore = getApiFootballCacheStore();
  const bundleCacheKey = buildApiFootballCacheKey("fixture", {
    home: request.homeTeam,
    away: request.awayTeam,
    date: request.matchDate ?? "",
  });
  const cachedBundle = await cacheStore.get<ApiFootballMatchBundle>(bundleCacheKey);
  if (cachedBundle) {
    return cachedBundle;
  }

  const homeTeam = await client.searchTeam(request.homeTeam);
  const awayTeam = await client.searchTeam(request.awayTeam);
  if (!homeTeam || !awayTeam) {
    return null;
  }

  const fixture = await client.getFixture({
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    matchDate: request.matchDate,
  });

  const leagueId = fixture?.leagueId;
  const season = fixture?.season ?? currentSeason();

  const [homeForm, awayForm, headToHead, standings, homeStatistics, awayStatistics, injuries] =
    await Promise.all([
      loadTeamForm(client, homeTeam.id),
      loadTeamForm(client, awayTeam.id),
      loadHeadToHead(client, homeTeam.id, awayTeam.id),
      leagueId ? loadStandings(client, leagueId, season) : Promise.resolve([]),
      leagueId
        ? loadTeamStatistics(client, homeTeam.id, leagueId, season)
        : Promise.resolve(null),
      leagueId
        ? loadTeamStatistics(client, awayTeam.id, leagueId, season)
        : Promise.resolve(null),
      loadInjuries(client, fixture?.fixtureId, homeTeam.id, awayTeam.id, season),
    ]);

  const bundle: ApiFootballMatchBundle = {
    homeTeam,
    awayTeam,
    fixture,
    homeForm,
    awayForm,
    headToHead,
    standings,
    homeStatistics,
    awayStatistics,
    injuries,
  };

  cacheStore.set(bundleCacheKey, "fixture", bundle);
  return bundle;
}

export async function fetchApiFootballSourceDataAsync<
  K extends FeatureProviderKey,
>(providerKey: K, request: ProviderRequestByKey[K]): Promise<ProviderDataByKey[K] | null> {
  const cached = readApiFootballProviderCache(providerKey, request);
  if (cached) {
    return cached;
  }

  const matchRequest = toMatchRequest(providerKey, request);
  if (!matchRequest) {
    return null;
  }

  const bundle = await buildApiFootballMatchBundle(matchRequest);
  if (!bundle) {
    return null;
  }

  const mapped = mapProviderDataFromBundle(
    providerKey,
    bundle,
    matchRequest.leagueName
  ) as ProviderDataByKey[K] | null;

  if (mapped) {
    rememberProviderCache(providerKey, request, mapped);
  }

  return mapped;
}

export function fetchApiFootballSourceData<K extends FeatureProviderKey>(
  providerKey: K,
  request: ProviderRequestByKey[K]
): ProviderDataByKey[K] | null {
  return readApiFootballProviderCache(providerKey, request);
}

export function resetApiFootballProviderCacheForTests(): void {
  providerSyncCache.clear();
}

function toMatchRequest<K extends FeatureProviderKey>(
  providerKey: K,
  request: ProviderRequestByKey[K]
): ApiFootballMatchRequest | null {
  if (providerKey === "leagueStrength") {
    return null;
  }

  const teamRequest = request as ProviderRequestByKey["recentForm"];
  return {
    homeTeam: teamRequest.homeTeam,
    awayTeam: teamRequest.awayTeam,
    matchDate: teamRequest.matchDate,
  };
}

async function loadTeamForm(client: ApiFootballClient, teamId: number) {
  const cacheStore = getApiFootballCacheStore();
  const cacheKey = buildApiFootballCacheKey("teamForm", { teamId });
  const cached = await cacheStore.get<Awaited<ReturnType<ApiFootballClient["getTeamForm"]>>>(
    cacheKey
  );
  if (cached) {
    return cached;
  }
  const data = await client.getTeamForm(teamId);
  cacheStore.set(cacheKey, "teamForm", data);
  return data;
}

async function loadHeadToHead(
  client: ApiFootballClient,
  homeTeamId: number,
  awayTeamId: number
) {
  const cacheStore = getApiFootballCacheStore();
  const cacheKey = buildApiFootballCacheKey("h2h", { homeTeamId, awayTeamId });
  const cached = await cacheStore.get<Awaited<ReturnType<ApiFootballClient["getHeadToHead"]>>>(
    cacheKey
  );
  if (cached) {
    return cached;
  }
  const data = await client.getHeadToHead(homeTeamId, awayTeamId);
  cacheStore.set(cacheKey, "h2h", data);
  return data;
}

async function loadStandings(
  client: ApiFootballClient,
  leagueId: number,
  season: number
) {
  const cacheStore = getApiFootballCacheStore();
  const cacheKey = buildApiFootballCacheKey("standings", { leagueId, season });
  const cached = await cacheStore.get<Awaited<ReturnType<ApiFootballClient["getStandings"]>>>(
    cacheKey
  );
  if (cached) {
    return cached;
  }
  const data = await client.getStandings(leagueId, season);
  cacheStore.set(cacheKey, "standings", data);
  return data;
}

async function loadTeamStatistics(
  client: ApiFootballClient,
  teamId: number,
  leagueId: number,
  season: number
) {
  const cacheStore = getApiFootballCacheStore();
  const cacheKey = buildApiFootballCacheKey("teamStatistics", {
    teamId,
    leagueId,
    season,
  });
  const cached = await cacheStore.get<
    Awaited<ReturnType<ApiFootballClient["getTeamStatistics"]>>
  >(cacheKey);
  if (cached) {
    return cached;
  }
  const data = await client.getTeamStatistics({ teamId, leagueId, season });
  if (data) {
    cacheStore.set(cacheKey, "teamStatistics", data);
  }
  return data;
}

async function loadInjuries(
  client: ApiFootballClient,
  fixtureId: number | undefined,
  homeTeamId: number,
  awayTeamId: number,
  season: number
) {
  const cacheStore = getApiFootballCacheStore();
  const cacheKey = buildApiFootballCacheKey("injuries", {
    fixtureId: fixtureId ?? 0,
    homeTeamId,
    awayTeamId,
    season,
  });
  const cached = await cacheStore.get<Awaited<ReturnType<ApiFootballClient["getInjuries"]>>>(
    cacheKey
  );
  if (cached) {
    return cached;
  }

  const fixtureInjuries = fixtureId
    ? await client.getInjuries({ fixtureId })
    : [];
  const homeInjuries =
    fixtureInjuries.length > 0
      ? fixtureInjuries
      : await client.getInjuries({ teamId: homeTeamId, season });
  const awayInjuries =
    fixtureInjuries.length > 0
      ? []
      : await client.getInjuries({ teamId: awayTeamId, season });
  const data = [...homeInjuries, ...awayInjuries];
  cacheStore.set(cacheKey, "injuries", data);
  return data;
}

function currentSeason(): number {
  const now = new Date();
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

export async function prefetchApiFootballProviders(input: {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
  leagueName?: string;
}): Promise<void> {
  const keys: FeatureProviderKey[] = [
    "recentForm",
    "homeAway",
    "goalsXg",
    "scoringPattern",
    "h2h",
    "squadAvailability",
    "matchContext",
  ];

  const bundle = await buildApiFootballMatchBundle(input);
  if (!bundle) {
    return;
  }

  for (const providerKey of keys) {
    const request = {
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      matchDate: input.matchDate,
    } as ProviderRequestByKey[typeof providerKey];
    const mapped = mapProviderDataFromBundle(
      providerKey,
      bundle,
      input.leagueName
    ) as ProviderDataByKey[typeof providerKey] | null;
    if (mapped) {
      rememberProviderCache(providerKey, request, mapped);
    }
  }

  if (input.leagueName) {
    const leagueData = mapProviderDataFromBundle(
      "leagueStrength",
      bundle,
      input.leagueName
    ) as ProviderDataByKey["leagueStrength"];
    rememberProviderCache(
      "leagueStrength",
      { leagueName: input.leagueName },
      leagueData
    );
  }
}
