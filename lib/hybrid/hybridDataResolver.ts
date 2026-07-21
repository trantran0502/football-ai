import {
  createSourceValue,
  mergeHybridField,
  mergeMatchRecordLists,
} from "@/lib/hybrid/conflictResolver";
import { extractApiFootballHybridPayload } from "@/lib/hybrid/extractApiFootballPayload";
import {
  buildHybridCacheKey,
  dedupeHybridResolve,
  getCachedHybridContext,
  rememberHybridContext,
} from "@/lib/hybrid/hybridCache";
import type {
  HybridFormSample,
  HybridMatchStatusContext,
  HybridInjuryRecord,
  HybridResolveRequest,
  HybridResolveResult,
  HybridSourcePayload,
  HybridStandingRecord,
  HybridTeamMetrics,
  NormalizedTeamContext,
} from "@/lib/hybrid/hybridTypes";
import { buildApiFootballMatchBundle } from "@/lib/providers/apiFootball/apiFootballService";
import {
  canMakeApiFootballRequest,
  recordApiFootballRequest,
} from "@/lib/providers/apiFootball/apiFootballQuota";
import { fetchGoogleHybridPayload } from "@/lib/providers/googleSearch/googleSearchService";
import { SupabaseProviderCache } from "@/lib/providers/registry/cache/supabaseProviderCache";
import { isGoogleGroundingEnabled } from "@/lib/providers/teamProfile/providerMode";

const supabaseHybridCache = new SupabaseProviderCache();

function buildFormSample(
  label: HybridFormSample["label"],
  matches: HybridSourcePayload["recentFormLast10Official"],
  includesFriendlies: boolean,
  includesExtraTime: boolean,
  includesPenalties: boolean
): HybridFormSample {
  return {
    label,
    matches,
    includesFriendlies,
    includesExtraTime,
    includesPenalties,
  };
}

function mergeFormField(
  field: string,
  label: HybridFormSample["label"],
  api: HybridSourcePayload | null,
  google: HybridSourcePayload | null,
  selector: (payload: HybridSourcePayload) => HybridSourcePayload["recentFormLast10Official"]
) {
  const mergedMatches = mergeMatchRecordLists(
    field,
    api ? selector(api) : [],
    google ? selector(google) : [],
    api
      ? {
          source: "apiFootball",
          fetchedAt: api.fetchedAt,
          confidence: api.confidence,
          citations: api.citations,
          query: api.queries[0],
        }
      : null,
    google
      ? {
          source: "googleSearch",
          fetchedAt: google.fetchedAt,
          confidence: google.confidence,
          citations: google.citations,
          query: google.queries[0],
        }
      : null
  );

  return {
    ...mergedMatches,
    value:
      mergedMatches.value === null
        ? null
        : buildFormSample(
            label,
            mergedMatches.value,
            Boolean(api?.includesFriendlies || google?.includesFriendlies),
            Boolean(api?.includesExtraTime || google?.includesExtraTime),
            Boolean(api?.includesPenalties || google?.includesPenalties)
          ),
  };
}

export function resolveHybridTeamContext(
  request: HybridResolveRequest,
  options: {
    apiPayload?: HybridSourcePayload | null;
    googlePayload?: HybridSourcePayload | null;
    skipFetch?: boolean;
  } = {}
): NormalizedTeamContext {
  const warnings: string[] = [];
  const api = options.apiPayload ?? null;
  const google = options.googlePayload ?? null;

  if (!api && !google) {
    warnings.push("No API-Football or Google Search payload available.");
  } else if (!api) {
    warnings.push("API-Football payload missing; Google Search only.");
  } else if (!google) {
    warnings.push("Google Search payload missing; API-Football only.");
  }

  const context: NormalizedTeamContext = {
    homeTeam: request.homeTeam,
    awayTeam: request.awayTeam,
    matchDate: request.matchDate,
    resolvedAt: new Date().toISOString(),
    recentFormLast10Official: mergeFormField(
      "recentFormLast10Official",
      "last10Official",
      api,
      google,
      (payload) => payload.recentFormLast10Official
    ),
    recentFormLast5Home: mergeFormField(
      "recentFormLast5Home",
      "last5Home",
      api,
      google,
      (payload) => payload.recentFormLast5Home
    ),
    recentFormLast5Away: mergeFormField(
      "recentFormLast5Away",
      "last5Away",
      api,
      google,
      (payload) => payload.recentFormLast5Away
    ),
    h2hLast5Official: mergeMatchRecordLists(
      "h2hLast5Official",
      api?.h2hLast5Official ?? [],
      google?.h2hLast5Official ?? [],
      api
        ? {
            source: "apiFootball",
            fetchedAt: api.fetchedAt,
            confidence: api.confidence,
            citations: api.citations,
          }
        : null,
      google
        ? {
            source: "googleSearch",
            fetchedAt: google.fetchedAt,
            confidence: google.confidence,
            citations: google.citations,
          }
        : null
    ),
    standings: mergeHybridField<HybridStandingRecord[]>(
      "standings",
      api
        ? createSourceValue(
            "apiFootball",
            api.standings,
            api.fetchedAt,
            api.citations
          )
        : null,
      google
        ? createSourceValue(
            "googleSearch",
            google.standings,
            google.fetchedAt,
            google.citations,
            google.queries[0]
          )
        : null
    ),
    injuries: mergeHybridField<HybridInjuryRecord[]>(
      "injuries",
      api
        ? createSourceValue(
            "apiFootball",
            api.injuries,
            api.fetchedAt,
            api.citations
          )
        : null,
      google
        ? createSourceValue(
            "googleSearch",
            google.injuries,
            google.fetchedAt,
            google.citations,
            google.queries[0]
          )
        : null
    ),
    homeMetrics: mergeHybridField<HybridTeamMetrics>(
      "homeMetrics",
      api?.homeMetrics
        ? createSourceValue(
            "apiFootball",
            api.homeMetrics,
            api.fetchedAt,
            api.citations
          )
        : null,
      google?.homeMetrics
        ? createSourceValue(
            "googleSearch",
            google.homeMetrics,
            google.fetchedAt,
            google.citations,
            google.queries[0]
          )
        : null
    ),
    awayMetrics: mergeHybridField<HybridTeamMetrics>(
      "awayMetrics",
      api?.awayMetrics
        ? createSourceValue(
            "apiFootball",
            api.awayMetrics,
            api.fetchedAt,
            api.citations
          )
        : null,
      google?.awayMetrics
        ? createSourceValue(
            "googleSearch",
            google.awayMetrics,
            google.fetchedAt,
            google.citations,
            google.queries[0]
          )
        : null
    ),
    matchStatus: mergeHybridField<HybridMatchStatusContext>(
      "matchStatus",
      api?.matchStatus
        ? createSourceValue(
            "apiFootball",
            api.matchStatus,
            api.fetchedAt,
            api.citations
          )
        : null,
      google?.matchStatus
        ? createSourceValue(
            "googleSearch",
            google.matchStatus,
            google.fetchedAt,
            google.citations,
            google.queries[0]
          )
        : null
    ),
    warnings,
  };

  if (options.skipFetch) {
    return context;
  }

  return context;
}

async function loadSupabaseHybridContext(
  cacheKey: string
): Promise<NormalizedTeamContext | null> {
  const cached = await supabaseHybridCache.get<NormalizedTeamContext>(cacheKey);
  return cached?.data ?? null;
}

async function persistSupabaseHybridContext(
  cacheKey: string,
  context: NormalizedTeamContext
): Promise<void> {
  await supabaseHybridCache.set(cacheKey, {
    data: context,
    source: "apiFootball",
    fetchedAt: context.resolvedAt,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    confidence: 0.85,
    warnings: context.warnings,
  });
}

async function fetchApiPayload(
  request: HybridResolveRequest
): Promise<HybridSourcePayload | null> {
  if (!canMakeApiFootballRequest()) {
    return null;
  }

  const bundle = await buildApiFootballMatchBundle({
    homeTeam: request.homeTeam,
    awayTeam: request.awayTeam,
    matchDate: request.matchDate,
    leagueName: request.leagueName,
  });
  if (!bundle) {
    return null;
  }

  return extractApiFootballHybridPayload(bundle);
}

export async function resolveHybridData(
  request: HybridResolveRequest
): Promise<HybridResolveResult> {
  const cacheKey = buildHybridCacheKey(request);

  const memoryHit = getCachedHybridContext(cacheKey);
  if (memoryHit) {
    return {
      context: memoryHit,
      cacheHit: true,
      apiUsed: false,
      googleUsed: false,
    };
  }

  const supabaseHit = await loadSupabaseHybridContext(cacheKey);
  if (supabaseHit) {
    rememberHybridContext(cacheKey, supabaseHit);
    return {
      context: supabaseHit,
      cacheHit: true,
      apiUsed: false,
      googleUsed: false,
    };
  }

  const context = await dedupeHybridResolve(cacheKey, async () => {
    const apiPayload = await fetchApiPayload(request);
    const googlePayload = isGoogleGroundingEnabled()
      ? await fetchGoogleHybridPayload(request)
      : null;

    const resolved = resolveHybridTeamContext(request, {
      apiPayload,
      googlePayload,
    });
    rememberHybridContext(cacheKey, resolved);
    void persistSupabaseHybridContext(cacheKey, resolved);
    return resolved;
  });

  return {
    context,
    cacheHit: false,
    apiUsed: true,
    googleUsed: isGoogleGroundingEnabled(),
  };
}

export { extractProviderDataFromContext } from "@/lib/hybrid/normalizeTeamContext";
