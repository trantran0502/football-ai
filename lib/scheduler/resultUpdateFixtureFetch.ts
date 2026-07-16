import { getApiFootballClient } from "@/lib/providers/apiFootball/apiFootballClient";
import {
  getApiFootballCacheStore,
  type ApiFootballCacheStore,
} from "@/lib/providers/apiFootball/apiFootballCache";
import { canMakeApiFootballRequest } from "@/lib/providers/apiFootball/apiFootballQuota";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import {
  readResultUpdateFixturesByDateCache,
  writeResultUpdateFixturesByDateCache,
} from "@/lib/scheduler/resultUpdateFixtureCache";

export const RESULT_UPDATE_QUOTA_WARNING =
  "Result update skipped API fetch due to quota exhaustion and no cached fixtures for date.";

export type ResultUpdateFixtureSource = "cache" | "api" | "none";

export interface ResultUpdateFixtureFetchOutcome {
  fixtures: ApiFootballFixtureRecord[];
  source: ResultUpdateFixtureSource;
  cacheHit: boolean;
  quotaSkipped: boolean;
  warning?: string;
}

export function isApiFootballQuotaExceededError(error: unknown): boolean {
  return error instanceof Error && error.message === "API-Football quota exceeded.";
}

async function defaultFetchFixturesFromApi(
  date: string
): Promise<ApiFootballFixtureRecord[]> {
  const client = getApiFootballClient();
  if (!client.isConfigured()) {
    return [];
  }
  return client.getFixturesByDate(date);
}

export async function fetchResultUpdateFixturesByDate(
  date: string,
  options: {
    fetchFromApi?: (date: string) => Promise<ApiFootballFixtureRecord[]>;
    cacheStore?: ApiFootballCacheStore;
  } = {}
): Promise<ResultUpdateFixtureFetchOutcome> {
  const cacheStore = options.cacheStore ?? getApiFootballCacheStore();
  const cached = await readResultUpdateFixturesByDateCache(date, cacheStore);
  if (cached !== null) {
    return {
      fixtures: cached,
      source: "cache",
      cacheHit: true,
      quotaSkipped: false,
    };
  }

  if (!canMakeApiFootballRequest()) {
    return {
      fixtures: [],
      source: "none",
      cacheHit: false,
      quotaSkipped: true,
      warning: RESULT_UPDATE_QUOTA_WARNING,
    };
  }

  const fetchFromApi = options.fetchFromApi ?? defaultFetchFixturesFromApi;

  try {
    const fixtures = await fetchFromApi(date);
    writeResultUpdateFixturesByDateCache(date, fixtures, cacheStore);
    return {
      fixtures,
      source: "api",
      cacheHit: false,
      quotaSkipped: false,
    };
  } catch (error) {
    if (isApiFootballQuotaExceededError(error)) {
      return {
        fixtures: [],
        source: "none",
        cacheHit: false,
        quotaSkipped: true,
        warning: RESULT_UPDATE_QUOTA_WARNING,
      };
    }
    throw error;
  }
}
