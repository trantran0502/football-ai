import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { getApiFootballClient } from "@/lib/providers/apiFootball/apiFootballClient";
import {
  getApiFootballCacheStore,
  type ApiFootballCacheStore,
} from "@/lib/providers/apiFootball/apiFootballCache";
import {
  canMakeApiFootballRequestForResultUpdate,
  runWithApiFootballQuotaPurpose,
} from "@/lib/providers/apiFootball/apiFootballQuota";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import {
  readGlobalFixturesByDateCache,
  writeGlobalFixturesByDateCache,
} from "@/lib/scheduler/resultUpdateFixtureCache";

const VERIFICATION_FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

export type ResultUpdatePendingFixtureRecord = Pick<
  HistoricalMatchRecord,
  "fixtureId" | "homeTeam" | "awayTeam" | "matchDate"
>;

export function findCachedFixtureForPendingRecord(
  record: ResultUpdatePendingFixtureRecord,
  cached: ApiFootballFixtureRecord[]
): ApiFootballFixtureRecord | undefined {
  if (record.fixtureId != null) {
    const byId = cached.find((fixture) => fixture.fixtureId === record.fixtureId);
    if (byId) {
      return byId;
    }
  }

  return cached.find(
    (fixture) =>
      fixture.date === record.matchDate &&
      fixture.homeTeam === record.homeTeam &&
      fixture.awayTeam === record.awayTeam
  );
}

export function isCachedFixtureVerificationReady(
  fixture: ApiFootballFixtureRecord
): boolean {
  return (
    VERIFICATION_FINISHED_STATUSES.has(fixture.status) &&
    fixture.homeGoals !== null &&
    fixture.awayGoals !== null &&
    fixture.halfTimeHome !== null &&
    fixture.halfTimeAway !== null
  );
}

export function shouldRefreshGlobalFixturesCacheForVerification(
  date: string,
  pendingRecords: ResultUpdatePendingFixtureRecord[],
  cached: ApiFootballFixtureRecord[]
): boolean {
  const relevantPending = pendingRecords.filter((record) => record.matchDate === date);
  if (relevantPending.length === 0) {
    return false;
  }

  for (const record of relevantPending) {
    const fixture = findCachedFixtureForPendingRecord(record, cached);
    if (!fixture || !isCachedFixtureVerificationReady(fixture)) {
      return true;
    }
  }

  return false;
}

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
    pendingRecords?: ResultUpdatePendingFixtureRecord[];
  } = {}
): Promise<ResultUpdateFixtureFetchOutcome> {
  const cacheStore = options.cacheStore ?? getApiFootballCacheStore();
  const pendingRecords = options.pendingRecords ?? [];
  const cached = await readGlobalFixturesByDateCache(date, cacheStore);
  const cacheIsVerificationReady =
    cached !== null &&
    !shouldRefreshGlobalFixturesCacheForVerification(date, pendingRecords, cached);

  if (cacheIsVerificationReady) {
    return {
      fixtures: cached,
      source: "cache",
      cacheHit: true,
      quotaSkipped: false,
    };
  }

  if (!canMakeApiFootballRequestForResultUpdate()) {
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
    const fixtures = await runWithApiFootballQuotaPurpose("result_update", () =>
      fetchFromApi(date)
    );
    writeGlobalFixturesByDateCache(date, fixtures, cacheStore);
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
