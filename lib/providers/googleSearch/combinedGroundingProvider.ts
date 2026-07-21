import type { SquadAvailabilityProviderRequest } from "@/lib/analysis/featureScore/providers/squadAvailabilityProvider";
import type { MatchContextProviderRequest } from "@/lib/analysis/featureScore/providers/matchContextProvider";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { buildCombinedGroundingCacheKey } from "@/lib/providers/googleSearch/googleSearchCache";
import {
  buildGroundingChannelDiagnostic,
  fetchGoogleLiveResultWithOutcome,
  type GroundingChannelDiagnostic,
} from "@/lib/providers/googleSearch/googleSearchService";
import {
  isGroundingRateLimitCooldownActive,
  recordGroundingDeferredFixture,
  recordGroundingRequestAvoidedByBudget,
} from "@/lib/providers/googleSearch/groundingRequestBudget";
import { resolveGroundingSkippedReason } from "@/lib/providers/googleSearch/groundingDeferredPolicy";
import {
  readProductionMatchContextResolution,
  rememberProductionMatchContextResolution,
} from "@/lib/providers/matchContext/matchContextCache";
import { resolveMatchContextFromGoogleSearch } from "@/lib/providers/matchContext/matchContextGoogleSource";
import { resolveMatchContextFromMatchRecords } from "@/lib/providers/matchContext/matchContextMatchRecordsSource";
import {
  clearActiveProductionMatchContextContext,
  setActiveProductionMatchContextContext,
} from "@/lib/providers/matchContext/matchContextProviderContext";
import type { ProductionMatchContextResolution } from "@/lib/providers/matchContext/matchContextTypes";
import {
  readProductionSquadAvailabilityResolution,
  rememberProductionSquadAvailabilityResolution,
} from "@/lib/providers/squadAvailability/squadAvailabilityCache";
import { resolveSquadAvailabilityFromGoogleSearch } from "@/lib/providers/squadAvailability/squadAvailabilityGoogleSource";
import { resolveSquadAvailabilityFromMatchRecords } from "@/lib/providers/squadAvailability/squadAvailabilityMatchRecordsSource";
import {
  clearActiveProductionSquadAvailabilityContext,
  setActiveProductionSquadAvailabilityContext,
} from "@/lib/providers/squadAvailability/squadAvailabilityProviderContext";
import type { ProductionSquadAvailabilityResolution } from "@/lib/providers/squadAvailability/squadAvailabilityTypes";

export interface ProductionCombinedGroundingContext {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
  kickoffTime?: string;
  matchRecords?: HistoricalMatchRecord[];
}

export interface ProductionCombinedGroundingPrefetchResult {
  squadResolution: ProductionSquadAvailabilityResolution | null;
  matchContextResolution: ProductionMatchContextResolution | null;
  combinedGroundingRequestId: string;
  combinedGroundingLiveRequest: boolean;
  combinedGrounding: GroundingChannelDiagnostic;
  squadGrounding: GroundingChannelDiagnostic;
  matchContextGrounding: GroundingChannelDiagnostic;
  groundingDeferred: boolean;
  groundingDeferredReason: string | null;
}

const completedCombinedPrefetches = new Map<
  number,
  ProductionCombinedGroundingPrefetchResult
>();

function buildDeferredGroundingDiagnostic(
  skippedReason: string
): GroundingChannelDiagnostic {
  return {
    called: false,
    cacheHit: false,
    skippedReason,
    succeeded: false,
    failureReason: skippedReason,
    httpStatus: null,
    model: null,
    candidateCount: 0,
    parseFailureReason: null,
    groundingFallbackUsed: false,
    hasResponseText: false,
    hasGroundingMetadata: false,
  };
}

function buildCombinedGroundingRequestId(
  context: ProductionCombinedGroundingContext
): string {
  return buildCombinedGroundingCacheKey({
    fixtureId: context.fixtureId,
    homeTeam: context.homeTeam,
    awayTeam: context.awayTeam,
    matchDate: context.matchDate,
    kickoffTime: context.kickoffTime,
  });
}

function buildDerivedChannelDiagnostic(
  combined: GroundingChannelDiagnostic,
  requestId: string
): GroundingChannelDiagnostic {
  return {
    ...combined,
    called: false,
    skippedReason: combined.cacheHit
      ? combined.skippedReason ?? "production_resolution_cache"
      : combined.called
        ? "combined_grounding_channel"
        : combined.skippedReason,
  };
}

export function resetCombinedGroundingPrefetchGuardForTests(): void {
  completedCombinedPrefetches.clear();
}

export async function prefetchProductionCombinedGrounding(
  context: ProductionCombinedGroundingContext
): Promise<ProductionCombinedGroundingPrefetchResult> {
  const cachedPrefetch = completedCombinedPrefetches.get(context.fixtureId);
  if (cachedPrefetch) {
    return cachedPrefetch;
  }

  const combinedGroundingRequestId = buildCombinedGroundingRequestId(context);
  const squadRequest: SquadAvailabilityProviderRequest = {
    homeTeam: context.homeTeam,
    awayTeam: context.awayTeam,
    matchDate: context.matchDate,
  };
  const matchContextRequest: MatchContextProviderRequest = {
    homeTeam: context.homeTeam,
    awayTeam: context.awayTeam,
    matchDate: context.matchDate,
  };
  const productionSquadRequest = {
    homeTeam: context.homeTeam,
    awayTeam: context.awayTeam,
    matchDate: context.matchDate,
    fixtureId: context.fixtureId,
    kickoffTime: context.kickoffTime,
  };
  const productionMatchRequest = {
    homeTeam: context.homeTeam,
    awayTeam: context.awayTeam,
    matchDate: context.matchDate,
    fixtureId: context.fixtureId,
    kickoffTime: context.kickoffTime,
  };

  const existingSquad = readProductionSquadAvailabilityResolution(productionSquadRequest);
  const existingMatch = readProductionMatchContextResolution(productionMatchRequest);
  if (existingSquad && existingMatch) {
    const cachedDiagnostic: GroundingChannelDiagnostic = {
      called: false,
      cacheHit: true,
      skippedReason: "production_resolution_cache",
      succeeded: true,
      failureReason: null,
      httpStatus: null,
      model: null,
      candidateCount: 0,
      parseFailureReason: null,
      groundingFallbackUsed: false,
      hasResponseText: false,
      hasGroundingMetadata: false,
    };
    const cachedResult: ProductionCombinedGroundingPrefetchResult = {
      squadResolution: {
        ...existingSquad,
        diagnostics: { ...existingSquad.diagnostics, cacheHit: true },
      },
      matchContextResolution: {
        ...existingMatch,
        diagnostics: { ...existingMatch.diagnostics, cacheHit: true },
      },
      combinedGroundingRequestId,
      combinedGroundingLiveRequest: false,
      combinedGrounding: cachedDiagnostic,
      squadGrounding: buildDerivedChannelDiagnostic(cachedDiagnostic, combinedGroundingRequestId),
      matchContextGrounding: buildDerivedChannelDiagnostic(
        cachedDiagnostic,
        combinedGroundingRequestId
      ),
      groundingDeferred: false,
      groundingDeferredReason: null,
    };
    completedCombinedPrefetches.set(context.fixtureId, cachedResult);
    return cachedResult;
  }

  setActiveProductionSquadAvailabilityContext({
    ...context,
    fixtureId: context.fixtureId,
    kickoffTime: context.kickoffTime,
  });
  setActiveProductionMatchContextContext({
    ...context,
    fixtureId: context.fixtureId,
    kickoffTime: context.kickoffTime,
  });

  try {
    const groundingOutcome = await fetchGoogleLiveResultWithOutcome({
      fixtureId: context.fixtureId,
      homeTeam: context.homeTeam,
      awayTeam: context.awayTeam,
      matchDate: context.matchDate,
      kickoffTime: context.kickoffTime,
    });
    const combinedGrounding = buildGroundingChannelDiagnostic(groundingOutcome);
    const squadGrounding = buildDerivedChannelDiagnostic(
      combinedGrounding,
      combinedGroundingRequestId
    );
    const matchContextGrounding = buildDerivedChannelDiagnostic(
      combinedGrounding,
      combinedGroundingRequestId
    );

    const groundingDeferred =
      !groundingOutcome.result &&
      Boolean(
        groundingOutcome.failureReason &&
          [
            "grounding_budget_exhausted",
            "grounding_rate_limited",
            "grounding_cooldown",
          ].includes(groundingOutcome.failureReason)
      );
    const groundingDeferredReason = groundingDeferred
      ? groundingOutcome.failureReason
      : null;

    const fromGoogleSquad = resolveSquadAvailabilityFromGoogleSearch({
      request: squadRequest,
      referenceDate: context.matchDate,
      fixtureId: context.fixtureId,
      kickoffTime: context.kickoffTime,
    });
    const fromGoogleMatch = resolveMatchContextFromGoogleSearch({
      request: matchContextRequest,
      referenceDate: context.matchDate,
      fixtureId: context.fixtureId,
      kickoffTime: context.kickoffTime,
    });

    let squadResolution = fromGoogleSquad;
    if (fromGoogleSquad) {
      rememberProductionSquadAvailabilityResolution(productionSquadRequest, fromGoogleSquad);
    } else if (!existingSquad) {
      const records = context.matchRecords ?? [];
      const fromRecords = resolveSquadAvailabilityFromMatchRecords({
        request: squadRequest,
        records,
        referenceDate: context.matchDate,
      });
      if (fromRecords) {
        rememberProductionSquadAvailabilityResolution(productionSquadRequest, fromRecords);
        squadResolution = fromRecords;
      }
    } else {
      squadResolution = existingSquad;
    }

    let matchContextResolution = fromGoogleMatch;
    if (fromGoogleMatch) {
      rememberProductionMatchContextResolution(productionMatchRequest, fromGoogleMatch);
    } else if (!existingMatch) {
      const records = context.matchRecords ?? [];
      const fromRecords = resolveMatchContextFromMatchRecords({
        request: matchContextRequest,
        records,
        referenceDate: context.matchDate,
      });
      if (fromRecords) {
        rememberProductionMatchContextResolution(productionMatchRequest, fromRecords);
        matchContextResolution = fromRecords;
      }
    } else {
      matchContextResolution = existingMatch;
    }

    const result: ProductionCombinedGroundingPrefetchResult = {
      squadResolution,
      matchContextResolution,
      combinedGroundingRequestId,
      combinedGroundingLiveRequest: combinedGrounding.called,
      combinedGrounding,
      squadGrounding,
      matchContextGrounding,
      groundingDeferred,
      groundingDeferredReason,
    };
    completedCombinedPrefetches.set(context.fixtureId, result);
    return result;
  } finally {
    clearActiveProductionSquadAvailabilityContext();
    clearActiveProductionMatchContextContext();
  }
}

export function buildSkippedCombinedGroundingPrefetch(input: {
  context: ProductionCombinedGroundingContext;
  budgetExhausted?: boolean;
  rateLimited?: boolean;
  cooldownActive?: boolean;
}): ProductionCombinedGroundingPrefetchResult {
  const skippedReason = resolveGroundingSkippedReason(input);
  if (input.budgetExhausted || input.cooldownActive || input.rateLimited) {
    recordGroundingRequestAvoidedByBudget();
  } else {
    recordGroundingDeferredFixture();
  }

  const diagnostic = buildDeferredGroundingDiagnostic(skippedReason);
  const requestId = buildCombinedGroundingRequestId(input.context);
  return {
    squadResolution: null,
    matchContextResolution: null,
    combinedGroundingRequestId: requestId,
    combinedGroundingLiveRequest: false,
    combinedGrounding: diagnostic,
    squadGrounding: buildDerivedChannelDiagnostic(diagnostic, requestId),
    matchContextGrounding: buildDerivedChannelDiagnostic(diagnostic, requestId),
    groundingDeferred: true,
    groundingDeferredReason: skippedReason,
  };
}

export function shouldDeferGroundingBeforeRequest(): boolean {
  return isGroundingRateLimitCooldownActive();
}

function buildGoogleGroundingDisabledDiagnostic(): GroundingChannelDiagnostic {
  return {
    called: false,
    cacheHit: false,
    skippedReason: "google_grounding_disabled_in_production",
    succeeded: false,
    failureReason: null,
    httpStatus: null,
    model: null,
    candidateCount: 0,
    parseFailureReason: null,
    groundingFallbackUsed: false,
    hasResponseText: false,
    hasGroundingMetadata: false,
  };
}

function resolveProductionProvidersFromMatchRecords(input: {
  context: ProductionCombinedGroundingContext;
  combinedGroundingRequestId: string;
  squadRequest: SquadAvailabilityProviderRequest;
  matchContextRequest: MatchContextProviderRequest;
  productionSquadRequest: {
    homeTeam: string;
    awayTeam: string;
    matchDate?: string;
    fixtureId?: number;
    kickoffTime?: string;
  };
  productionMatchRequest: {
    homeTeam: string;
    awayTeam: string;
    matchDate?: string;
    fixtureId?: number;
    kickoffTime?: string;
  };
  existingSquad: ProductionSquadAvailabilityResolution | null;
  existingMatch: ProductionMatchContextResolution | null;
}): {
  squadResolution: ProductionSquadAvailabilityResolution | null;
  matchContextResolution: ProductionMatchContextResolution | null;
} {
  const records = input.context.matchRecords ?? [];

  let squadResolution = input.existingSquad;
  if (!squadResolution) {
    const fromRecords = resolveSquadAvailabilityFromMatchRecords({
      request: input.squadRequest,
      records,
      referenceDate: input.context.matchDate,
    });
    if (fromRecords) {
      rememberProductionSquadAvailabilityResolution(input.productionSquadRequest, fromRecords);
      squadResolution = fromRecords;
    }
  }

  let matchContextResolution = input.existingMatch;
  if (!matchContextResolution) {
    const fromRecords = resolveMatchContextFromMatchRecords({
      request: input.matchContextRequest,
      records,
      referenceDate: input.context.matchDate,
    });
    if (fromRecords) {
      rememberProductionMatchContextResolution(input.productionMatchRequest, fromRecords);
      matchContextResolution = fromRecords;
    }
  }

  return { squadResolution, matchContextResolution };
}

/**
 * Production path: squad + match context from match_records only (no Gemini HTTP).
 */
export async function prefetchProductionProvidersFromMatchRecords(
  context: ProductionCombinedGroundingContext
): Promise<ProductionCombinedGroundingPrefetchResult> {
  const cachedPrefetch = completedCombinedPrefetches.get(context.fixtureId);
  if (cachedPrefetch) {
    return cachedPrefetch;
  }

  const combinedGroundingRequestId = buildCombinedGroundingRequestId(context);
  const squadRequest: SquadAvailabilityProviderRequest = {
    homeTeam: context.homeTeam,
    awayTeam: context.awayTeam,
    matchDate: context.matchDate,
  };
  const matchContextRequest: MatchContextProviderRequest = {
    homeTeam: context.homeTeam,
    awayTeam: context.awayTeam,
    matchDate: context.matchDate,
  };
  const productionSquadRequest = {
    homeTeam: context.homeTeam,
    awayTeam: context.awayTeam,
    matchDate: context.matchDate,
    fixtureId: context.fixtureId,
    kickoffTime: context.kickoffTime,
  };
  const productionMatchRequest = {
    homeTeam: context.homeTeam,
    awayTeam: context.awayTeam,
    matchDate: context.matchDate,
    fixtureId: context.fixtureId,
    kickoffTime: context.kickoffTime,
  };

  const existingSquad = readProductionSquadAvailabilityResolution(productionSquadRequest);
  const existingMatch = readProductionMatchContextResolution(productionMatchRequest);
  if (existingSquad && existingMatch) {
    const cachedDiagnostic: GroundingChannelDiagnostic = {
      called: false,
      cacheHit: true,
      skippedReason: "production_resolution_cache",
      succeeded: true,
      failureReason: null,
      httpStatus: null,
      model: null,
      candidateCount: 0,
      parseFailureReason: null,
      groundingFallbackUsed: false,
      hasResponseText: false,
      hasGroundingMetadata: false,
    };
    const cachedResult: ProductionCombinedGroundingPrefetchResult = {
      squadResolution: {
        ...existingSquad,
        diagnostics: { ...existingSquad.diagnostics, cacheHit: true },
      },
      matchContextResolution: {
        ...existingMatch,
        diagnostics: { ...existingMatch.diagnostics, cacheHit: true },
      },
      combinedGroundingRequestId,
      combinedGroundingLiveRequest: false,
      combinedGrounding: cachedDiagnostic,
      squadGrounding: buildDerivedChannelDiagnostic(cachedDiagnostic, combinedGroundingRequestId),
      matchContextGrounding: buildDerivedChannelDiagnostic(
        cachedDiagnostic,
        combinedGroundingRequestId
      ),
      groundingDeferred: false,
      groundingDeferredReason: null,
    };
    completedCombinedPrefetches.set(context.fixtureId, cachedResult);
    return cachedResult;
  }

  setActiveProductionSquadAvailabilityContext({
    ...context,
    fixtureId: context.fixtureId,
    kickoffTime: context.kickoffTime,
  });
  setActiveProductionMatchContextContext({
    ...context,
    fixtureId: context.fixtureId,
    kickoffTime: context.kickoffTime,
  });

  try {
    const disabledDiagnostic = buildGoogleGroundingDisabledDiagnostic();
    const { squadResolution, matchContextResolution } =
      resolveProductionProvidersFromMatchRecords({
        context,
        combinedGroundingRequestId,
        squadRequest,
        matchContextRequest,
        productionSquadRequest,
        productionMatchRequest,
        existingSquad,
        existingMatch,
      });

    const result: ProductionCombinedGroundingPrefetchResult = {
      squadResolution,
      matchContextResolution,
      combinedGroundingRequestId,
      combinedGroundingLiveRequest: false,
      combinedGrounding: disabledDiagnostic,
      squadGrounding: buildDerivedChannelDiagnostic(
        disabledDiagnostic,
        combinedGroundingRequestId
      ),
      matchContextGrounding: buildDerivedChannelDiagnostic(
        disabledDiagnostic,
        combinedGroundingRequestId
      ),
      groundingDeferred: false,
      groundingDeferredReason: null,
    };
    completedCombinedPrefetches.set(context.fixtureId, result);
    return result;
  } finally {
    clearActiveProductionSquadAvailabilityContext();
    clearActiveProductionMatchContextContext();
  }
}
