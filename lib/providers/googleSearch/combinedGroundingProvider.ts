import type { SquadAvailabilityProviderRequest } from "@/lib/analysis/featureScore/providers/squadAvailabilityProvider";
import type { MatchContextProviderRequest } from "@/lib/analysis/featureScore/providers/matchContextProvider";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
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
  combinedGrounding: GroundingChannelDiagnostic;
  squadGrounding: GroundingChannelDiagnostic;
  matchContextGrounding: GroundingChannelDiagnostic;
  groundingDeferred: boolean;
  groundingDeferredReason: string | null;
}

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

function cloneGroundingDiagnostic(
  diagnostic: GroundingChannelDiagnostic
): GroundingChannelDiagnostic {
  return { ...diagnostic };
}

export async function prefetchProductionCombinedGrounding(
  context: ProductionCombinedGroundingContext
): Promise<ProductionCombinedGroundingPrefetchResult> {
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
    return {
      squadResolution: {
        ...existingSquad,
        diagnostics: { ...existingSquad.diagnostics, cacheHit: true },
      },
      matchContextResolution: {
        ...existingMatch,
        diagnostics: { ...existingMatch.diagnostics, cacheHit: true },
      },
      combinedGrounding: cachedDiagnostic,
      squadGrounding: cloneGroundingDiagnostic(cachedDiagnostic),
      matchContextGrounding: cloneGroundingDiagnostic(cachedDiagnostic),
      groundingDeferred: false,
      groundingDeferredReason: null,
    };
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
    const squadGrounding = cloneGroundingDiagnostic(combinedGrounding);
    const matchContextGrounding = cloneGroundingDiagnostic(combinedGrounding);

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

    return {
      squadResolution,
      matchContextResolution,
      combinedGrounding,
      squadGrounding,
      matchContextGrounding,
      groundingDeferred,
      groundingDeferredReason,
    };
  } finally {
    clearActiveProductionSquadAvailabilityContext();
    clearActiveProductionMatchContextContext();
  }
}

export function buildSkippedCombinedGroundingPrefetch(input: {
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
  return {
    squadResolution: null,
    matchContextResolution: null,
    combinedGrounding: diagnostic,
    squadGrounding: cloneGroundingDiagnostic(diagnostic),
    matchContextGrounding: cloneGroundingDiagnostic(diagnostic),
    groundingDeferred: true,
    groundingDeferredReason: skippedReason,
  };
}

export function shouldDeferGroundingBeforeRequest(): boolean {
  return isGroundingRateLimitCooldownActive();
}
