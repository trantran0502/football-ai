import {
  buildCombinedGroundingCacheKey,
  buildGoogleMatchKey,
  COMBINED_GROUNDING_QUERY,
  canSearchForMatch,
  dedupeGoogleFetch,
  getCachedGoogleRecordAsync,
  recordMatchSearch,
  rememberGoogleLiveResult,
} from "@/lib/providers/googleSearch/googleSearchCache";
import {
  canMakeGroundingLiveRequest,
  isGroundingRateLimitCooldownActive,
  recordGroundingLiveRequestUsed,
  recordGroundingRequestAvoidedByBudget,
  recordGroundingRequestAvoidedByCache,
  triggerGroundingRateLimitCooldown,
} from "@/lib/providers/googleSearch/groundingRequestBudget";
import {
  getGoogleSearchProvider,
  type GoogleSearchMatchRequest,
} from "@/lib/providers/googleSearch/googleSearchProvider";
import type { GeminiGroundingDiagnostics } from "@/lib/providers/googleSearch/googleSearchTypes";
import type { HybridSourcePayload } from "@/lib/hybrid/hybridTypes";
import type { GoogleSearchLiveResult } from "@/lib/providers/googleSearch/googleSearchTypes";
import {
  initializeGroundingRuntimeMetrics,
  recordGroundingCacheHit,
  recordGroundingLiveCall,
  recordGroundingNotConfigured,
} from "@/lib/admin/groundingRuntimeMetrics";
import { recordCacheHit, recordCacheMiss } from "@/lib/admin/adminCacheMetrics";

export const TEAM_CONTEXT_QUERY = COMBINED_GROUNDING_QUERY;

export interface GoogleFetchOutcome {
  result: GoogleSearchLiveResult | null;
  cacheHit: boolean;
  configured: boolean;
  called: boolean;
  failureReason: string | null;
  diagnostics: GeminiGroundingDiagnostics | null;
}

function buildNormalizedGroundingPayload(
  result: GoogleSearchLiveResult,
  source: "live" | "cache"
): Record<string, unknown> {
  const existing =
    result.rawResponse &&
    typeof result.rawResponse === "object" &&
    !Array.isArray(result.rawResponse)
      ? (result.rawResponse as Record<string, unknown>)
      : {};

  return {
    ...existing,
    source: "google-grounding",
    captureSource: source,
    query: result.query,
    model: result.model ?? existing.model ?? null,
    capturedAt: result.searchTime,
    confidence: result.confidence,
    citations: result.citations,
    payload: result.payload,
  };
}

export async function fetchGoogleLiveResultWithOutcome(
  request: GoogleSearchMatchRequest
): Promise<GoogleFetchOutcome> {
  const provider = getGoogleSearchProvider();
  const configured = provider.isConfigured();
  initializeGroundingRuntimeMetrics(configured);

  if (!configured) {
    recordGroundingNotConfigured();
    return {
      result: null,
      cacheHit: false,
      configured: false,
      called: false,
      failureReason: "not_configured",
      diagnostics: null,
    };
  }

  const matchKey = buildGoogleMatchKey(request);
  const cacheKey = buildCombinedGroundingCacheKey({
    fixtureId: request.fixtureId,
    homeTeam: request.homeTeam,
    awayTeam: request.awayTeam,
    kickoffTime: request.kickoffTime,
    matchDate: request.matchDate,
  });

  const cached = await getCachedGoogleRecordAsync(cacheKey);
  if (cached) {
    recordGroundingCacheHit();
    recordGroundingRequestAvoidedByCache();
    recordCacheHit();
    const result: GoogleSearchLiveResult = {
      payload: cached.payload,
      citations: cached.citations,
      confidence: cached.confidence,
      searchTime: cached.searchTime,
      query: cached.query,
      rawResponse: cached.rawResponse ?? buildNormalizedGroundingPayload(
        {
          payload: cached.payload,
          citations: cached.citations,
          confidence: cached.confidence,
          searchTime: cached.searchTime,
          query: cached.query,
          rawResponse: cached.rawResponse,
        },
        "cache"
      ),
      model:
        typeof cached.rawResponse === "object" &&
        cached.rawResponse &&
        typeof (cached.rawResponse as { model?: unknown }).model === "string"
          ? ((cached.rawResponse as { model: string }).model)
          : undefined,
    };
    return {
      result,
      cacheHit: true,
      configured: true,
      called: false,
      failureReason: null,
      diagnostics: null,
    };
  }

  recordCacheMiss();

  if (isGroundingRateLimitCooldownActive()) {
    recordGroundingRequestAvoidedByBudget();
    return {
      result: null,
      cacheHit: false,
      configured: true,
      called: false,
      failureReason: "grounding_cooldown",
      diagnostics: null,
    };
  }

  if (!canMakeGroundingLiveRequest()) {
    recordGroundingRequestAvoidedByBudget();
    return {
      result: null,
      cacheHit: false,
      configured: true,
      called: false,
      failureReason: "grounding_budget_exhausted",
      diagnostics: null,
    };
  }

  if (!canSearchForMatch(matchKey)) {
    recordGroundingLiveCall({ succeeded: false, failureReason: "match_search_limit_reached" });
    return {
      result: null,
      cacheHit: false,
      configured: true,
      called: false,
      failureReason: "match_search_limit_reached",
      diagnostics: null,
    };
  }

  let lastDiagnostics: GeminiGroundingDiagnostics | null = null;
  let lastFailureReason: string | null = null;

  const liveResult = await dedupeGoogleFetch(cacheKey, async () => {
    recordMatchSearch(matchKey);
    recordGroundingLiveRequestUsed();
    try {
      const outcome = await provider.fetchTeamContextWithDiagnostics(request);
      lastDiagnostics = outcome.diagnostics;
      lastFailureReason = outcome.diagnostics.failureReason;

      if (
        outcome.diagnostics.httpStatus === 429 ||
        outcome.diagnostics.failureReason === "rate_limited"
      ) {
        triggerGroundingRateLimitCooldown();
        lastFailureReason = "grounding_rate_limited";
      }

      if (!outcome.result) {
        recordGroundingLiveCall({
          succeeded: false,
          failureReason: lastFailureReason ?? outcome.diagnostics.failureReason ?? "empty_grounding_response",
          diagnostics: outcome.diagnostics,
        });
        return null;
      }

      const normalizedRaw = buildNormalizedGroundingPayload(outcome.result, "live");
      const persisted: GoogleSearchLiveResult = {
        ...outcome.result,
        rawResponse: normalizedRaw,
      };
      rememberGoogleLiveResult(cacheKey, persisted);
      recordGroundingLiveCall({
        succeeded: true,
        diagnostics: outcome.diagnostics,
      });
      return persisted;
    } catch (error) {
      const failureReason =
        error instanceof Error ? error.message : "network_error";
      recordGroundingLiveCall({ succeeded: false, failureReason });
      console.warn("Gemini unavailable:", error);
      return null;
    }
  });

  return {
    result: liveResult,
    cacheHit: false,
    configured: true,
    called: true,
    failureReason: liveResult
      ? null
      : lastFailureReason ??
        (isGroundingRateLimitCooldownActive()
          ? "grounding_rate_limited"
          : "grounding_fetch_failed"),
    diagnostics: lastDiagnostics,
  };
}

export async function fetchGoogleLiveResult(
  request: GoogleSearchMatchRequest
): Promise<GoogleSearchLiveResult | null> {
  const outcome = await fetchGoogleLiveResultWithOutcome(request);
  return outcome.result;
}

export async function fetchGoogleHybridPayload(
  request: GoogleSearchMatchRequest
): Promise<HybridSourcePayload | null> {
  const result = await fetchGoogleLiveResult(request);
  return result?.payload ?? null;
}

export interface GroundingChannelDiagnostic {
  called: boolean;
  cacheHit: boolean;
  skippedReason: string | null;
  succeeded: boolean;
  failureReason: string | null;
  httpStatus: number | null;
  model: string | null;
  candidateCount: number;
  parseFailureReason: string | null;
  groundingFallbackUsed: boolean;
  hasResponseText: boolean;
  hasGroundingMetadata: boolean;
}

export function buildGroundingChannelDiagnostic(
  outcome: GoogleFetchOutcome,
  skippedReasonOverride?: string | null
): GroundingChannelDiagnostic {
  const diagnostics = outcome.diagnostics;
  return {
    called: outcome.called,
    cacheHit: outcome.cacheHit,
    skippedReason: skippedReasonOverride ?? outcome.failureReason,
    succeeded: Boolean(outcome.result),
    failureReason: outcome.failureReason,
    httpStatus: diagnostics?.httpStatus ?? null,
    model: diagnostics?.model ?? outcome.result?.model ?? null,
    candidateCount: diagnostics?.candidateCount ?? 0,
    parseFailureReason: diagnostics?.parseFailureReason ?? null,
    groundingFallbackUsed: diagnostics?.groundingFallbackUsed ?? false,
    hasResponseText: diagnostics?.hasResponseText ?? Boolean(outcome.result),
    hasGroundingMetadata: diagnostics?.hasGroundingMetadata ?? false,
  };
}
