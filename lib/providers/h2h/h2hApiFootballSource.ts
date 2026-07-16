import type { H2HProviderRequest } from "@/lib/analysis/featureScore/providers/h2hProvider";
import {
  ApiFootballClient,
  getApiFootballClient,
} from "@/lib/providers/apiFootball/apiFootballClient";
import {
  buildApiFootballCacheKey,
  getApiFootballCacheStore,
} from "@/lib/providers/apiFootball/apiFootballCache";
import {
  canMakeApiFootballRequest,
  getApiFootballQuotaBlockReason,
} from "@/lib/providers/apiFootball/apiFootballQuota";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import { computeH2HProviderConfidence } from "@/lib/providers/h2h/h2hConfidence";
import {
  buildH2HSnapshotFromMatches,
  normalizeApiH2HFixtures,
} from "@/lib/providers/h2h/h2hNormalizer";
import { getActiveProductionH2HContext } from "@/lib/providers/h2h/h2hProviderContext";
import {
  buildH2HApiRequestUrl,
  createEmptyH2HDiagnostics,
  type ProductionH2HResolution,
} from "@/lib/providers/h2h/h2hTypes";

export async function fetchApiFootballH2HFixtures(input: {
  homeTeamId: number;
  awayTeamId: number;
  client?: ApiFootballClient;
}): Promise<{
  fixtures: ApiFootballFixtureRecord[];
  requestUrl: string;
  rawCount: number;
  cacheHit: boolean;
} | null> {
  const client = input.client ?? getApiFootballClient();
  if (!client.isConfigured()) {
    return null;
  }

  const requestUrl = buildH2HApiRequestUrl(input.homeTeamId, input.awayTeamId);
  const cacheStore = getApiFootballCacheStore();
  const cacheKey = buildApiFootballCacheKey("h2h", {
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
  });

  const cached = await cacheStore.get<ApiFootballFixtureRecord[]>(cacheKey);
  if (cached) {
    return {
      fixtures: cached,
      requestUrl,
      rawCount: cached.length,
      cacheHit: true,
    };
  }

  if (!canMakeApiFootballRequest()) {
    return null;
  }

  const fixtures = await client.getHeadToHead(
    input.homeTeamId,
    input.awayTeamId,
    10
  );
  await cacheStore.set(cacheKey, "h2h", fixtures);

  return {
    fixtures,
    requestUrl,
    rawCount: fixtures.length,
    cacheHit: false,
  };
}

export async function resolveH2HFromApiFootball(
  request: H2HProviderRequest,
  options: {
    homeTeamId?: number | null;
    awayTeamId?: number | null;
    client?: ApiFootballClient;
  } = {}
): Promise<ProductionH2HResolution | null> {
  const context = getActiveProductionH2HContext();
  const homeTeamId = options.homeTeamId ?? context?.homeTeamId ?? null;
  const awayTeamId = options.awayTeamId ?? context?.awayTeamId ?? null;

  const diagnostics = createEmptyH2HDiagnostics("unavailable");
  diagnostics.requestUrl =
    homeTeamId && awayTeamId
      ? buildH2HApiRequestUrl(homeTeamId, awayTeamId)
      : null;

  if (!homeTeamId || !awayTeamId) {
    diagnostics.warnings.push("H2H API fallback skipped: team IDs unavailable.");
    return null;
  }

  if (!canMakeApiFootballRequest()) {
    diagnostics.quotaSkipped = true;
    diagnostics.warnings.push(
      `H2H API fallback skipped due to quota (${getApiFootballQuotaBlockReason() ?? "unknown"}).`
    );
    return null;
  }

  let apiResult: Awaited<ReturnType<typeof fetchApiFootballH2HFixtures>> = null;
  try {
    apiResult = await fetchApiFootballH2HFixtures({
      homeTeamId,
      awayTeamId,
      client: options.client,
    });
  } catch (error) {
    diagnostics.warnings.push(
      error instanceof Error ? error.message : "H2H API request failed."
    );
    return null;
  }

  if (!apiResult) {
    if (!canMakeApiFootballRequest()) {
      diagnostics.quotaSkipped = true;
      diagnostics.warnings.push("H2H API fallback skipped due to quota exhaustion.");
    }
    return null;
  }

  diagnostics.cacheHit = apiResult.cacheHit;
  diagnostics.rawCount = apiResult.rawCount;
  diagnostics.requestUrl = apiResult.requestUrl;

  const { matches, stats } = normalizeApiH2HFixtures(apiResult.fixtures);
  diagnostics.normalizedCount = matches.length;
  diagnostics.filteredFriendlyCount = stats.filteredFriendlyCount;
  diagnostics.filteredIncompleteCount = stats.filteredIncompleteCount;
  diagnostics.filteredStatusCount = stats.filteredStatusCount;

  if (matches.length === 0) {
    diagnostics.warnings.push("H2H API returned no formal completed fixtures.");
    return null;
  }

  const referenceDate = request.matchDate ?? new Date().toISOString().slice(0, 10);
  const snapshot = buildH2HSnapshotFromMatches({
    matches,
    referenceDate,
    currentHomeTeam: request.homeTeam,
    currentAwayTeam: request.awayTeam,
  });

  diagnostics.sampleSize = snapshot.sampleSize;
  diagnostics.source = "apiFootball";

  return {
    snapshot,
    source: "apiFootball",
    confidence: computeH2HProviderConfidence(snapshot, "apiFootball"),
    diagnostics,
  };
}
