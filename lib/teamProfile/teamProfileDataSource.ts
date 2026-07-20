import type { ApiFootballTeamStatisticsRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import { isFreeMode } from "@/lib/providers/free/config";
import {
  ApiFootballClient,
  getApiFootballClient,
} from "@/lib/providers/apiFootball/apiFootballClient";
import {
  canMakeApiFootballRequest,
  canMakeProfileApiFootballRequest,
  getApiFootballQuotaBlockReason,
  getApiFootballQuotaSnapshot,
  waitForApiFootballQuota,
} from "@/lib/providers/apiFootball/apiFootballQuota";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  createEmptyFetchDiagnostics,
  beginApiAttempt,
  finishApiAttempt,
  recordApiAttempt,
} from "@/lib/teamProfile/teamProfileDiagnostics";
import {
  normalizeApiFootballFixtures,
  normalizeVerifiedMatchRecords,
  sliceRecentMatches,
  sortMatchesDesc,
} from "@/lib/teamProfile/teamProfileNormalizer";
import type { ApiFootballPlanSeasonRange } from "@/lib/providers/apiFootball/apiFootballPlanErrors";
import {
  parsePlanLastParameterRestrictionFromText,
  parsePlanSeasonRestrictionFromText,
} from "@/lib/providers/apiFootball/apiFootballPlanErrors";
import {
  cachePlanSeasonRestriction,
  recordPlanRestrictedRequestAvoided,
  resolveProfileFetchSeason,
  setEffectiveProfileSeason,
} from "@/lib/teamProfile/planCapabilityCache";
import {
  buildHistoricalBaselineWarning,
  computeStalenessYears,
  filterVerifiedMatchesNewerThanSeason,
} from "@/lib/teamProfile/teamProfileSeasonPolicy";
import type {
  TeamProfileAdvancedStatsInput,
  TeamProfileFetchDiagnostics,
  TeamProfileFallbackReason,
  TeamProfileIdentity,
  TeamProfileMatchInput,
  TeamProfileSeasonMetadata,
} from "@/lib/teamProfile/teamProfileTypes";

export interface TeamProfileDataFetchResult {
  matches: TeamProfileMatchInput[];
  advancedStats: TeamProfileAdvancedStatsInput | null;
  source: "api-football" | "match-records" | "incomplete";
  warnings: string[];
  diagnostics: TeamProfileFetchDiagnostics;
  seasonMetadata: TeamProfileSeasonMetadata;
}

const TEAM_FORM_LAST = 15;
export const MAX_TEAM_PROFILE_FIXTURE_REQUESTS = 4;

let teamProfileUseLastOverride: boolean | null = null;

export function resetTeamProfileFixtureFetchState(): void {
  teamProfileUseLastOverride = null;
}

export function setTeamProfileUseLastForTests(value: boolean | null): void {
  teamProfileUseLastOverride = value;
}

export function shouldUseLastParameterForTeamProfile(): boolean {
  if (teamProfileUseLastOverride !== null) {
    return teamProfileUseLastOverride;
  }
  return !isFreeMode();
}

function disableLastParameterForTeamProfileExecution(): void {
  teamProfileUseLastOverride = false;
}

function emptySeasonMetadata(requestedSeason: number | null): TeamProfileSeasonMetadata {
  return {
    requestedSeason,
    dataSeason: null,
    isHistoricalBaseline: false,
    stalenessYears: null,
    fallbackReason: null,
  };
}

function applySeasonMetadataToDiagnostics(
  diagnostics: TeamProfileFetchDiagnostics,
  seasonMetadata: TeamProfileSeasonMetadata,
  planSeasonRange: ApiFootballPlanSeasonRange | null
): void {
  diagnostics.requestedSeason = seasonMetadata.requestedSeason;
  diagnostics.dataSeason = seasonMetadata.dataSeason;
  diagnostics.isHistoricalBaseline = seasonMetadata.isHistoricalBaseline;
  diagnostics.stalenessYears = seasonMetadata.stalenessYears;
  diagnostics.fallbackReason = seasonMetadata.fallbackReason;
  diagnostics.planSeasonRange = planSeasonRange;
  diagnostics.normalizedMatchCount = Math.max(
    diagnostics.normalizedMatchCount,
    0
  );
}

function resolveFallbackSeasonMetadata(
  requestedSeason: number | null,
  resolved: TeamProfileSeasonMetadata | null
): TeamProfileSeasonMetadata {
  if (!resolved) {
    return emptySeasonMetadata(requestedSeason);
  }

  if (
    resolved.isHistoricalBaseline ||
    resolved.dataSeason !== null ||
    resolved.fallbackReason !== null
  ) {
    return resolved;
  }

  return emptySeasonMetadata(requestedSeason);
}

function buildHistoricalSeasonMetadata(
  requestedSeason: number | null,
  dataSeason: number,
  fallbackReason: TeamProfileFallbackReason
): TeamProfileSeasonMetadata {
  return {
    requestedSeason,
    dataSeason,
    isHistoricalBaseline:
      requestedSeason !== null && dataSeason !== requestedSeason,
    stalenessYears: computeStalenessYears(requestedSeason, dataSeason),
    fallbackReason,
  };
}

export async function fetchTeamProfileData(
  identity: TeamProfileIdentity,
  options: {
    allowApiFetch?: boolean;
    listVerifiedRecords?: () => Promise<HistoricalMatchRecord[]>;
    waitForQuota?: boolean;
    maxQuotaWaitMs?: number;
  } = {}
): Promise<TeamProfileDataFetchResult> {
  const allowApiFetch = options.allowApiFetch ?? true;
  const waitForQuota = options.waitForQuota ?? true;
  const maxQuotaWaitMs =
    options.maxQuotaWaitMs ??
    readTeamProfileQuotaWaitMsFromEnv();
  const warnings: string[] = [];
  const quotaAvailableAtStart = canMakeApiFootballRequest();
  const client = getApiFootballClient();
  const apiConfigured = client.isConfigured();
  let diagnostics = createEmptyFetchDiagnostics({
    apiConfigured,
    quotaAvailable: quotaAvailableAtStart,
    quotaExhausted: !quotaAvailableAtStart,
    quotaBlockReason: getApiFootballQuotaBlockReason(),
  });

  if (allowApiFetch && !apiConfigured) {
    warnings.push("API-Football is not configured; team profile API fetch skipped.");
    const seasonMetadata = emptySeasonMetadata(identity.season);
    applySeasonMetadataToDiagnostics(diagnostics, seasonMetadata, null);
    return finalizeWithoutApiMatches(identity, options, warnings, diagnostics, seasonMetadata);
  }

  if (allowApiFetch && !quotaAvailableAtStart) {
    diagnostics.quotaExhausted = true;
    diagnostics.quotaBlockReason = getApiFootballQuotaBlockReason();
    warnings.push(
      `API-Football quota exhausted before team profile fetch (${diagnostics.quotaBlockReason ?? "unknown"}).`
    );

    if (waitForQuota) {
      const waitResult = await waitForApiFootballQuota({ maxWaitMs: maxQuotaWaitMs });
      warnings.push(
        waitResult.available
          ? `API-Football quota became available after ${waitResult.waitedMs}ms.`
          : `API-Football quota still unavailable after waiting ${waitResult.waitedMs}ms.`
      );
      diagnostics.quotaAvailableAtStart = waitResult.available;
      diagnostics.quotaExhausted = !waitResult.available;
      diagnostics.quotaBlockReason = waitResult.available
        ? null
        : getApiFootballQuotaBlockReason();
    }
  }

  if (allowApiFetch && canMakeApiFootballRequest()) {
    let resolvedSeasonMetadata: TeamProfileSeasonMetadata | null = null;
    let resolvedPlanRange: ApiFootballPlanSeasonRange | null = null;
    let resolvedMatches: TeamProfileMatchInput[] = [];
    let resolvedAdvancedStats: TeamProfileAdvancedStatsInput | null = null;

    try {
      const apiResult = await fetchTeamProfileDataFromApi(client, identity, warnings, options);
      diagnostics = apiResult.diagnostics;
      resolvedSeasonMetadata = apiResult.seasonMetadata;
      resolvedPlanRange = apiResult.planSeasonRange;
      resolvedMatches = apiResult.matches;
      resolvedAdvancedStats = apiResult.advancedStats;

      if (apiResult.fetchError) {
        const recovered = await recoverPlanRestrictionFromCatchError(
          client,
          identity,
          apiResult.fetchError,
          warnings,
          diagnostics,
          options
        );
        if (recovered) {
          diagnostics = recovered.diagnostics;
          resolvedSeasonMetadata = recovered.seasonMetadata;
          resolvedPlanRange = recovered.planSeasonRange;
          resolvedMatches = recovered.matches;
          resolvedAdvancedStats = recovered.advancedStats;
          applySeasonMetadataToDiagnostics(
            diagnostics,
            recovered.seasonMetadata,
            recovered.planSeasonRange
          );

          if (recovered.matches.length > 0) {
            return {
              matches: recovered.matches,
              advancedStats: recovered.advancedStats,
              source: "api-football",
              warnings,
              diagnostics,
              seasonMetadata: recovered.seasonMetadata,
            };
          }
        }
      } else if (apiResult.matches.length > 0) {
        applySeasonMetadataToDiagnostics(
          diagnostics,
          apiResult.seasonMetadata,
          apiResult.planSeasonRange
        );
        return {
          matches: apiResult.matches,
          advancedStats: apiResult.advancedStats,
          source: "api-football",
          warnings,
          diagnostics,
          seasonMetadata: apiResult.seasonMetadata,
        };
      }

      if (!apiResult.fetchError) {
        applySeasonMetadataToDiagnostics(
          diagnostics,
          apiResult.seasonMetadata,
          apiResult.planSeasonRange
        );
        warnings.push(
          "API-Football returned no official completed matches after all fetch strategies."
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "API-Football team profile fetch failed.";
      warnings.push(message);

      const recovered = await recoverPlanRestrictionFromCatchError(
        client,
        identity,
        message,
        warnings,
        diagnostics,
        options
      );
      if (recovered) {
        diagnostics = recovered.diagnostics;
        resolvedSeasonMetadata = recovered.seasonMetadata;
        resolvedPlanRange = recovered.planSeasonRange;
        resolvedMatches = recovered.matches;
        resolvedAdvancedStats = recovered.advancedStats;
        applySeasonMetadataToDiagnostics(
          diagnostics,
          recovered.seasonMetadata,
          recovered.planSeasonRange
        );

        if (recovered.matches.length > 0) {
          return {
            matches: recovered.matches,
            advancedStats: recovered.advancedStats,
            source: "api-football",
            warnings,
            diagnostics,
            seasonMetadata: recovered.seasonMetadata,
          };
        }
      }
    }

    const seasonMetadata = resolveFallbackSeasonMetadata(
      identity.season,
      resolvedSeasonMetadata
    );
    applySeasonMetadataToDiagnostics(diagnostics, seasonMetadata, resolvedPlanRange);

    if (resolvedMatches.length > 0) {
      return {
        matches: resolvedMatches,
        advancedStats: resolvedAdvancedStats,
        source: "api-football",
        warnings,
        diagnostics,
        seasonMetadata,
      };
    }

    return finalizeWithoutApiMatches(
      identity,
      options,
      warnings,
      diagnostics,
      seasonMetadata
    );
  } else if (allowApiFetch) {
    diagnostics.quotaExhausted = true;
    diagnostics.quotaBlockReason = getApiFootballQuotaBlockReason();
    warnings.push(
      `API-Football quota exhausted; team profile API fetch skipped (${diagnostics.quotaBlockReason ?? "unknown"}).`
    );
  }

  const seasonMetadata = emptySeasonMetadata(identity.season);
  applySeasonMetadataToDiagnostics(diagnostics, seasonMetadata, null);
  return finalizeWithoutApiMatches(identity, options, warnings, diagnostics, seasonMetadata);
}

export function mergeTeamProfileMatches(
  primary: TeamProfileMatchInput[],
  fallback: TeamProfileMatchInput[]
): TeamProfileMatchInput[] {
  return mergeTeamProfileMatchesDeduped([...primary, ...fallback]);
}

export function mergeTeamProfileMatchesDeduped(
  matches: TeamProfileMatchInput[]
): TeamProfileMatchInput[] {
  const deduped = new Map<string, TeamProfileMatchInput>();
  for (const match of sortMatchesDesc(matches)) {
    const key = `${match.date}:${match.homeTeam.toLowerCase()}:${match.awayTeam.toLowerCase()}`;
    if (!deduped.has(key)) {
      deduped.set(key, match);
    }
  }
  return sortMatchesDesc([...deduped.values()]);
}

async function fetchTeamProfileDataFromApi(
  client: ApiFootballClient,
  identity: TeamProfileIdentity,
  warnings: string[],
  options: {
    listVerifiedRecords?: () => Promise<HistoricalMatchRecord[]>;
  }
): Promise<{
  matches: TeamProfileMatchInput[];
  advancedStats: TeamProfileAdvancedStatsInput | null;
  diagnostics: TeamProfileFetchDiagnostics;
  seasonMetadata: TeamProfileSeasonMetadata;
  planSeasonRange: ApiFootballPlanSeasonRange | null;
  fetchError: string | null;
}> {
  const diagnostics = createEmptyFetchDiagnostics({
    apiConfigured: client.isConfigured(),
    quotaAvailable: canMakeApiFootballRequest(),
    quotaBlockReason: getApiFootballQuotaBlockReason(),
  });
  resetTeamProfileFixtureFetchState();

  let apiFetch: {
    matches: TeamProfileMatchInput[];
    seasonMetadata: TeamProfileSeasonMetadata;
    planSeasonRange: ApiFootballPlanSeasonRange | null;
  };
  try {
    apiFetch = await fetchTeamFixturesFromApi(client, identity, warnings, diagnostics);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "API-Football team profile fixture fetch failed.";
    warnings.push(message);
    return {
      matches: [],
      advancedStats: null,
      diagnostics,
      seasonMetadata: emptySeasonMetadata(identity.season),
      planSeasonRange: null,
      fetchError: message,
    };
  }

  const advancedStats = await fetchAdvancedStatsFromApi(
    client,
    identity,
    warnings,
    diagnostics,
    apiFetch.seasonMetadata.dataSeason
  );

  const fused = await fuseWithVerifiedRecords(
    identity,
    options,
    apiFetch.matches,
    apiFetch.seasonMetadata,
    warnings,
    diagnostics
  );

  return {
    matches: fused.matches,
    advancedStats,
    diagnostics,
    seasonMetadata: fused.seasonMetadata,
    planSeasonRange: apiFetch.planSeasonRange,
    fetchError: null,
  };
}

async function fetchTeamFixturesFromApi(
  client: ApiFootballClient,
  identity: TeamProfileIdentity,
  warnings: string[],
  diagnostics: TeamProfileFetchDiagnostics
): Promise<{
  matches: TeamProfileMatchInput[];
  seasonMetadata: TeamProfileSeasonMetadata;
  planSeasonRange: ApiFootballPlanSeasonRange | null;
}> {
  const requestedSeason = identity.season;
  let planSeasonRange: ApiFootballPlanSeasonRange | null = null;
  let dataSeason: number | null = null;
  let fallbackReason: TeamProfileFallbackReason = null;
  let matches: TeamProfileMatchInput[] = [];
  const requestBudget = { used: 0 };

  if (requestedSeason !== null && identity.leagueId !== null) {
    const seasonPlan = resolveProfileFetchSeason({
      leagueId: identity.leagueId,
      requestedSeason,
    });

    if (seasonPlan.skipRequestedSeasonAttempt && seasonPlan.initialFetchSeason !== null) {
      const historicalSeason = seasonPlan.initialFetchSeason;
      fallbackReason = "historical_season_fallback";
      const historicalAttempt = await fetchTeamFormForProfile(
        client,
        identity,
        warnings,
        diagnostics,
        requestBudget,
        {
          leagueId: identity.leagueId,
          season: historicalSeason,
          status: "FT",
          attemptFallbackReason: "historical_season_fallback",
        }
      );

      if (historicalAttempt?.planRange) {
        planSeasonRange = historicalAttempt.planRange;
      }

      matches = historicalAttempt?.matches ?? [];
      dataSeason = historicalSeason;
      setEffectiveProfileSeason(historicalSeason);

      if (matches.length > 0) {
        warnings.push(
          buildHistoricalBaselineWarning(historicalSeason, requestedSeason)
        );
      } else if (requestBudget.used < MAX_TEAM_PROFILE_FIXTURE_REQUESTS) {
        const leagueFallbackAttempt = await fetchTeamFormForProfile(
          client,
          identity,
          warnings,
          diagnostics,
          requestBudget,
          {
            season: historicalSeason,
            status: "FT",
            attemptFallbackReason: "historical_season_fallback",
          }
        );
        matches = leagueFallbackAttempt?.matches ?? [];
        if (matches.length > 0) {
          dataSeason = historicalSeason;
          warnings.push(
            buildHistoricalBaselineWarning(historicalSeason, requestedSeason)
          );
        } else {
          warnings.push(
            `Historical fallback season=${historicalSeason} returned no official completed matches.`
          );
        }
      }
    } else {
      const requestedAttempt = await fetchTeamFormForProfile(
        client,
        identity,
        warnings,
        diagnostics,
        requestBudget,
        {
          leagueId: identity.leagueId,
          season: requestedSeason,
          status: "FT",
        }
      );

      if (requestedAttempt?.planRange) {
        planSeasonRange = requestedAttempt.planRange;
        cachePlanSeasonRestriction({
          leagueId: identity.leagueId,
          requestedSeason,
          planRange: requestedAttempt.planRange,
        });
      }

      matches = requestedAttempt?.matches ?? [];
      if (matches.length > 0) {
        dataSeason = requestedSeason;
        setEffectiveProfileSeason(requestedSeason);
      } else if (requestedAttempt?.planRange) {
        const historicalSeason = requestedAttempt.planRange.maxSeason;
        fallbackReason = "historical_season_fallback";
        recordPlanRestrictedRequestAvoided();
        const historicalAttempt = await fetchTeamFormForProfile(
          client,
          identity,
          warnings,
          diagnostics,
          requestBudget,
          {
            leagueId: identity.leagueId,
            season: historicalSeason,
            status: "FT",
            attemptFallbackReason: "historical_season_fallback",
          }
        );

        matches = historicalAttempt?.matches ?? [];
        dataSeason = historicalSeason;
        setEffectiveProfileSeason(historicalSeason);

        if (matches.length > 0) {
          warnings.push(
            buildHistoricalBaselineWarning(historicalSeason, requestedSeason)
          );
        } else if (requestBudget.used < MAX_TEAM_PROFILE_FIXTURE_REQUESTS) {
          const leagueFallbackAttempt = await fetchTeamFormForProfile(
            client,
            identity,
            warnings,
            diagnostics,
            requestBudget,
            {
              season: historicalSeason,
              status: "FT",
              attemptFallbackReason: "historical_season_fallback",
            }
          );
          matches = leagueFallbackAttempt?.matches ?? [];
          if (matches.length > 0) {
            dataSeason = historicalSeason;
            warnings.push(
              buildHistoricalBaselineWarning(historicalSeason, requestedSeason)
            );
          } else {
            warnings.push(
              `Historical fallback season=${historicalSeason} returned no official completed matches.`
            );
          }
        } else {
          warnings.push(
            `Historical fallback season=${historicalSeason} returned no official completed matches.`
          );
        }
      }
    }
  }

  const isHistoricalBaseline =
    requestedSeason !== null &&
    dataSeason !== null &&
    dataSeason !== requestedSeason;
  const seasonMetadata: TeamProfileSeasonMetadata = {
    requestedSeason,
    dataSeason,
    isHistoricalBaseline,
    stalenessYears: computeStalenessYears(requestedSeason, dataSeason),
    fallbackReason: isHistoricalBaseline
      ? fallbackReason ?? "historical_season_fallback"
      : fallbackReason,
  };

  if (isHistoricalBaseline && seasonMetadata.stalenessYears && seasonMetadata.stalenessYears > 0) {
    warnings.push(
      `Historical baseline staleness: ${seasonMetadata.stalenessYears} season(s) behind requested season ${requestedSeason}.`
    );
  }

  diagnostics.normalizedMatchCount = matches.length;
  return { matches, seasonMetadata, planSeasonRange };
}

interface TeamFormProfileFetchOptions {
  leagueId?: number;
  season?: number;
  status?: string;
  attemptFallbackReason?: TeamProfileFallbackReason;
}

async function fetchTeamFormForProfile(
  client: ApiFootballClient,
  identity: TeamProfileIdentity,
  warnings: string[],
  diagnostics: TeamProfileFetchDiagnostics,
  requestBudget: { used: number },
  options: TeamFormProfileFetchOptions,
  forceNoLast = false
): Promise<{
  matches: TeamProfileMatchInput[];
  planRange: ApiFootballPlanSeasonRange | null;
} | null> {
  if (requestBudget.used >= MAX_TEAM_PROFILE_FIXTURE_REQUESTS) {
    warnings.push("Team profile fixture request budget exhausted.");
    return null;
  }
  if (!canMakeProfileApiFootballRequest()) {
    markQuotaExhausted(diagnostics, warnings, "fixture fetch");
    return { matches: [], planRange: null };
  }
  requestBudget.used += 1;

  if (!canMakeApiFootballRequest()) {
    markQuotaExhausted(diagnostics, warnings, "fixture fetch");
    return { matches: [], planRange: null };
  }

  const status = options.status ?? "FT";
  const useLast = forceNoLast ? false : shouldUseLastParameterForTeamProfile();
  const requestUrl = buildTeamFormPathForProfile(identity.teamId, {
    leagueId: options.leagueId,
    season: options.season,
    status,
  }, useLast);

  beginApiAttempt(diagnostics, {
    requestUrl,
    season: options.season ?? null,
    leagueId: options.leagueId ?? null,
    status,
    fallbackReason: options.attemptFallbackReason ?? null,
  });

  try {
    const form = await client.getTeamForm(identity.teamId, TEAM_FORM_LAST, {
      leagueId: options.leagueId,
      season: options.season,
      status,
      useLast,
    });

    if (form.meta?.planLastParameterRestricted) {
      disableLastParameterForTeamProfileExecution();
      finishApiAttempt(diagnostics, {
        success: false,
        error: form.meta.planLastParameterRestricted.message,
        planRestricted: true,
      });

      if (useLast && requestBudget.used < MAX_TEAM_PROFILE_FIXTURE_REQUESTS) {
        return fetchTeamFormForProfile(
          client,
          identity,
          warnings,
          diagnostics,
          requestBudget,
          options,
          true
        );
      }

      return { matches: [], planRange: null };
    }

    const actualRequestUrl = form.meta?.requestPath ?? requestUrl;
    if (actualRequestUrl !== requestUrl) {
      const lastAttempt = diagnostics.attempts.at(-1);
      if (lastAttempt) {
        lastAttempt.requestUrl = actualRequestUrl;
      }
    }

    let planRange: ApiFootballPlanSeasonRange | null = null;
    let planRestricted = false;
    if (form.meta?.planRestriction) {
      planRange = {
        minSeason: form.meta.planRestriction.minSeason,
        maxSeason: form.meta.planRestriction.maxSeason,
        message: form.meta.planRestriction.message,
      };
      planRestricted = true;
      warnings.push(
        `API plan restriction for season=${options.season}: ${planRange.message}`
      );
    }

    const normalized = limitTeamProfileMatches(
      normalizeApiFootballFixtures(form.fixtures)
    );

    finishApiAttempt(diagnostics, {
      success: true,
      rawResponseCount: form.meta?.rawResponseCount ?? 0,
      afterGoalFilterCount: form.fixtures.length,
      normalizedMatchCount: normalized.length,
      planRestricted,
      fallbackReason: planRestricted
        ? "plan_season_restricted"
        : options.attemptFallbackReason,
    });

    appendFixtureAttemptWarning(
      warnings,
      form.meta,
      form.fixtures.length,
      options.leagueId ?? null,
      options.season ?? null
    );
    const scope =
      options.leagueId !== undefined && options.season !== undefined
        ? `league=${options.leagueId}, season=${options.season}`
        : options.season !== undefined
          ? `season=${options.season}`
          : "global";
    warnings.push(
      `Normalizer: ${normalized.length} official completed matches (${scope}).`
    );

    return { matches: normalized, planRange };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lastRestriction = parsePlanLastParameterRestrictionFromText(message);
    if (lastRestriction) {
      disableLastParameterForTeamProfileExecution();
      finishApiAttempt(diagnostics, {
        success: false,
        error: message,
        planRestricted: true,
      });

      if (useLast && requestBudget.used < MAX_TEAM_PROFILE_FIXTURE_REQUESTS) {
        return fetchTeamFormForProfile(
          client,
          identity,
          warnings,
          diagnostics,
          requestBudget,
          options,
          true
        );
      }

      return { matches: [], planRange: null };
    }

    const planRange = parsePlanSeasonRestrictionFromText(message);
    if (planRange) {
      finishApiAttempt(diagnostics, {
        success: false,
        error: message,
        planRestricted: true,
        fallbackReason: "plan_season_restricted",
      });
      warnings.push(
        `API plan restriction for season=${options.season}: ${planRange.message}`
      );
      return { matches: [], planRange };
    }

    finishApiAttempt(diagnostics, {
      success: false,
      error: message,
    });
    throw error;
  }
}

function limitTeamProfileMatches(
  matches: TeamProfileMatchInput[]
): TeamProfileMatchInput[] {
  return sliceRecentMatches(matches, TEAM_FORM_LAST);
}

async function recoverPlanRestrictionFromCatchError(
  client: ApiFootballClient,
  identity: TeamProfileIdentity,
  errorMessage: string,
  warnings: string[],
  diagnostics: TeamProfileFetchDiagnostics,
  options: {
    listVerifiedRecords?: () => Promise<HistoricalMatchRecord[]>;
  }
): Promise<{
  matches: TeamProfileMatchInput[];
  advancedStats: TeamProfileAdvancedStatsInput | null;
  diagnostics: TeamProfileFetchDiagnostics;
  seasonMetadata: TeamProfileSeasonMetadata;
  planSeasonRange: ApiFootballPlanSeasonRange | null;
} | null> {
  const lastRestriction = parsePlanLastParameterRestrictionFromText(errorMessage);
  if (lastRestriction) {
    disableLastParameterForTeamProfileExecution();
    warnings.push(
      `Recovered Last parameter plan restriction: ${lastRestriction.message}`
    );
    const requestBudget = { used: diagnostics.attempts.length };
    const recoveredFetch = await fetchTeamFixturesFromApi(
      client,
      identity,
      warnings,
      diagnostics
    );
    const advancedStats = await fetchAdvancedStatsFromApi(
      client,
      identity,
      warnings,
      diagnostics,
      recoveredFetch.seasonMetadata.dataSeason
    );
    const fused = await fuseWithVerifiedRecords(
      identity,
      options,
      recoveredFetch.matches,
      recoveredFetch.seasonMetadata,
      warnings,
      diagnostics
    );
    return {
      matches: fused.matches,
      advancedStats,
      diagnostics,
      seasonMetadata: fused.seasonMetadata,
      planSeasonRange: recoveredFetch.planSeasonRange,
    };
  }

  const planRange = parsePlanSeasonRestrictionFromText(errorMessage);
  if (!planRange || identity.season === null || identity.leagueId === null) {
    return null;
  }

  const requestedSeason = identity.season;
  const requestedPath = buildTeamFormPathForProfile(identity.teamId, {
    leagueId: identity.leagueId,
    season: requestedSeason,
    status: "FT",
  });

  warnings.push(
    `Recovered plan restriction from API error for season=${requestedSeason}: ${planRange.message}`
  );
  beginApiAttempt(diagnostics, {
    requestUrl: requestedPath,
    season: requestedSeason,
    leagueId: identity.leagueId,
    status: "FT",
    fallbackReason: "plan_season_restricted",
  });
  finishApiAttempt(diagnostics, {
    success: false,
    rawResponseCount: 0,
    afterGoalFilterCount: 0,
    normalizedMatchCount: 0,
    planRestricted: true,
    fallbackReason: "plan_season_restricted",
    error: errorMessage,
  });

  const historicalSeason = planRange.maxSeason;
  const requestBudget = { used: diagnostics.attempts.length };
  const historicalAttempt = await fetchTeamFormForProfile(
    client,
    identity,
    warnings,
    diagnostics,
    requestBudget,
    {
      leagueId: identity.leagueId,
      season: historicalSeason,
      status: "FT",
      attemptFallbackReason: "historical_season_fallback",
    }
  );

  let normalized = historicalAttempt?.matches ?? [];
  if (normalized.length === 0 && requestBudget.used < MAX_TEAM_PROFILE_FIXTURE_REQUESTS) {
    const leagueFallbackAttempt = await fetchTeamFormForProfile(
      client,
      identity,
      warnings,
      diagnostics,
      requestBudget,
      {
        season: historicalSeason,
        status: "FT",
        attemptFallbackReason: "historical_season_fallback",
      }
    );
    normalized = leagueFallbackAttempt?.matches ?? [];
  }

  const seasonMetadata = buildHistoricalSeasonMetadata(
    requestedSeason,
    historicalSeason,
    "historical_season_fallback"
  );
  if (normalized.length > 0) {
    warnings.push(buildHistoricalBaselineWarning(historicalSeason, requestedSeason));
  } else {
    warnings.push(
      `Historical fallback season=${historicalSeason} returned no official completed matches.`
    );
  }

  const fused = await fuseWithVerifiedRecords(
    identity,
    options,
    normalized,
    seasonMetadata,
    warnings,
    diagnostics
  );
  const advancedStats = await fetchAdvancedStatsFromApi(
    client,
    identity,
    warnings,
    diagnostics,
    historicalSeason
  );

  return {
    matches: fused.matches,
    advancedStats,
    diagnostics,
    seasonMetadata: fused.seasonMetadata,
    planSeasonRange: planRange,
  };
}

async function fetchAdvancedStatsFromApi(
  client: ApiFootballClient,
  identity: TeamProfileIdentity,
  warnings: string[],
  diagnostics: TeamProfileFetchDiagnostics,
  dataSeason: number | null
): Promise<TeamProfileAdvancedStatsInput | null> {
  if (identity.leagueId === null || dataSeason === null) {
    return null;
  }

  if (!canMakeProfileApiFootballRequest()) {
    markQuotaExhausted(diagnostics, warnings, "team statistics fetch");
    return null;
  }

  const stats = await client.getTeamStatistics({
    teamId: identity.teamId,
    leagueId: identity.leagueId,
    season: dataSeason,
  });
  const requestPath = `/teams/statistics?team=${identity.teamId}&league=${identity.leagueId}&season=${dataSeason}`;
  warnings.push(
    stats
      ? `API ${requestPath} returned season stats (fixturesPlayed=${stats.fixturesPlayed ?? 0}).`
      : `API ${requestPath} returned empty.`
  );

  if (stats && (stats.fixturesPlayed ?? 0) > 0) {
    return mapSeasonStatistics(stats);
  }

  return null;
}

async function fuseWithVerifiedRecords(
  identity: TeamProfileIdentity,
  options: {
    listVerifiedRecords?: () => Promise<HistoricalMatchRecord[]>;
  },
  apiMatches: TeamProfileMatchInput[],
  seasonMetadata: TeamProfileSeasonMetadata,
  warnings: string[],
  diagnostics: TeamProfileFetchDiagnostics
): Promise<{
  matches: TeamProfileMatchInput[];
  seasonMetadata: TeamProfileSeasonMetadata;
}> {
  const verifiedRecords = options.listVerifiedRecords
    ? await options.listVerifiedRecords()
    : await loadVerifiedRecordsFallback(identity.teamName);

  const verifiedMatches = normalizeVerifiedMatchRecords(
    verifiedRecords,
    identity.teamId,
    identity.teamName
  );
  const newerVerified = filterVerifiedMatchesNewerThanSeason(
    verifiedMatches,
    seasonMetadata.dataSeason
  );

  if (newerVerified.length > 0) {
    warnings.push(
      `Merged ${newerVerified.length} newer VERIFIED match_records after API baseline.`
    );
  }

  const merged = mergeTeamProfileMatches(newerVerified, apiMatches);
  diagnostics.normalizedMatchCount = merged.length;

  return {
    matches: merged,
    seasonMetadata,
  };
}

async function finalizeWithoutApiMatches(
  identity: TeamProfileIdentity,
  options: {
    listVerifiedRecords?: () => Promise<HistoricalMatchRecord[]>;
  },
  warnings: string[],
  diagnostics: TeamProfileFetchDiagnostics,
  seasonMetadata: TeamProfileSeasonMetadata
): Promise<TeamProfileDataFetchResult> {
  const verifiedRecords = options.listVerifiedRecords
    ? await options.listVerifiedRecords()
    : await loadVerifiedRecordsFallback(identity.teamName);

  const verifiedMatches = normalizeVerifiedMatchRecords(
    verifiedRecords,
    identity.teamId,
    identity.teamName
  );

  if (verifiedMatches.length > 0) {
    diagnostics.normalizedMatchCount = verifiedMatches.length;
    return {
      matches: verifiedMatches,
      advancedStats: null,
      source: "match-records",
      warnings,
      diagnostics,
      seasonMetadata: {
        ...seasonMetadata,
        dataSeason: seasonMetadata.dataSeason ?? extractLatestSeasonYear(verifiedMatches),
      },
    };
  }

  warnings.push("Insufficient team history from API and verified match records.");
  return {
    matches: [],
    advancedStats: null,
    source: "incomplete",
    warnings,
    diagnostics,
    seasonMetadata,
  };
}

function extractLatestSeasonYear(matches: TeamProfileMatchInput[]): number | null {
  if (matches.length === 0) {
    return null;
  }
  return Number(matches[0].date.slice(0, 4));
}

function appendFixtureAttemptWarning(
  warnings: string[],
  meta: { requestPath: string; rawResponseCount: number } | undefined,
  afterGoalFilterCount: number,
  leagueId: number | null,
  season: number | null
): void {
  if (!meta) {
    return;
  }

  const scope =
    leagueId !== null && season !== null
      ? `league=${leagueId}, season=${season}`
      : "global";
  warnings.push(
    `API ${meta.requestPath} raw=${meta.rawResponseCount} afterGoalFilter=${afterGoalFilterCount} (${scope}).`
  );
}

function markQuotaExhausted(
  diagnostics: TeamProfileFetchDiagnostics,
  warnings: string[],
  phase: string
): void {
  diagnostics.quotaExhausted = true;
  diagnostics.quotaBlockReason = getApiFootballQuotaBlockReason();
  warnings.push(
    `API-Football quota exhausted during ${phase} (${diagnostics.quotaBlockReason ?? "unknown"}).`
  );
}

export function buildTeamFormPathForProfile(
  teamId: number,
  options: { leagueId?: number; season?: number; status?: string },
  useLast = shouldUseLastParameterForTeamProfile()
): string {
  const params = new URLSearchParams();
  params.set("team", String(teamId));
  if (useLast) {
    params.set("last", String(TEAM_FORM_LAST));
  }
  if (options.leagueId !== undefined) {
    params.set("league", String(options.leagueId));
  }
  if (options.season !== undefined) {
    params.set("season", String(options.season));
  }
  if (options.status) {
    params.set("status", options.status);
  }
  return `/fixtures?${params.toString()}`;
}

function mapSeasonStatistics(
  stats: ApiFootballTeamStatisticsRecord | null
): TeamProfileAdvancedStatsInput | null {
  if (!stats) {
    return null;
  }

  return {
    avgShots: stats.shotsTotal,
    avgShotsOnTarget: stats.shotsOnTarget,
    avgPossession: null,
    avgXg: stats.expectedGoals,
    avgXga: stats.expectedGoalsAgainst,
  };
}

async function loadVerifiedRecordsFallback(
  teamName: string
): Promise<HistoricalMatchRecord[]> {
  try {
    if (typeof window !== "undefined") {
      return [];
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const { matchRecordRowToDomain } = await import("@/lib/supabase/mappers/matchRecordMapper");
    const supabase = getSupabaseAdmin();

    const [homeResult, awayResult] = await Promise.all([
      supabase
        .from("match_records")
        .select("*")
        .eq("status", "VERIFIED")
        .eq("home_team", teamName)
        .order("match_date", { ascending: false })
        .limit(20),
      supabase
        .from("match_records")
        .select("*")
        .eq("status", "VERIFIED")
        .eq("away_team", teamName)
        .order("match_date", { ascending: false })
        .limit(20),
    ]);

    const rows = [...(homeResult.data ?? []), ...(awayResult.data ?? [])];
    const deduped = new Map<string, HistoricalMatchRecord>();
    for (const row of rows) {
      const record = matchRecordRowToDomain(row);
      deduped.set(record.id, record);
    }

    return [...deduped.values()].sort((left, right) =>
      right.matchDate.localeCompare(left.matchDate)
    );
  } catch {
    return [];
  }
}

export function getTeamProfileQuotaSnapshotForDiagnostics() {
  return getApiFootballQuotaSnapshot();
}

function readTeamProfileQuotaWaitMsFromEnv(): number {
  const raw = process.env.TEAM_PROFILE_QUOTA_WAIT_MS?.trim();
  if (!raw) {
    return 65_000;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 65_000;
}
