import type { ApiFootballTeamStatisticsRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import {
  ApiFootballClient,
  getApiFootballClient,
} from "@/lib/providers/apiFootball/apiFootballClient";
import {
  canMakeApiFootballRequest,
  getApiFootballQuotaBlockReason,
  getApiFootballQuotaSnapshot,
  waitForApiFootballQuota,
} from "@/lib/providers/apiFootball/apiFootballQuota";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  createEmptyFetchDiagnostics,
  recordApiAttempt,
} from "@/lib/teamProfile/teamProfileDiagnostics";
import {
  normalizeApiFootballFixtures,
  normalizeVerifiedMatchRecords,
  sortMatchesDesc,
} from "@/lib/teamProfile/teamProfileNormalizer";
import type { ApiFootballPlanSeasonRange } from "@/lib/providers/apiFootball/apiFootballPlanErrors";
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
    try {
      const apiResult = await fetchTeamProfileDataFromApi(client, identity, warnings, options);
      diagnostics = apiResult.diagnostics;

      if (apiResult.matches.length > 0) {
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

      applySeasonMetadataToDiagnostics(
        diagnostics,
        apiResult.seasonMetadata,
        apiResult.planSeasonRange
      );
      warnings.push(
        "API-Football returned no official completed matches after all fetch strategies."
      );
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? error.message
          : "API-Football team profile fetch failed."
      );
    }
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
}> {
  const diagnostics = createEmptyFetchDiagnostics({
    apiConfigured: client.isConfigured(),
    quotaAvailable: canMakeApiFootballRequest(),
    quotaBlockReason: getApiFootballQuotaBlockReason(),
  });

  const apiFetch = await fetchTeamFixturesFromApi(client, identity, warnings, diagnostics);
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
  const triedSeasons = new Set<number>();
  let matches: TeamProfileMatchInput[] = [];

  const tryLeagueSeason = async (
    season: number,
    attemptFallbackReason: TeamProfileFallbackReason = null
  ): Promise<{
    matches: TeamProfileMatchInput[];
    planRange: ApiFootballPlanSeasonRange | null;
  }> => {
    if (identity.leagueId === null || triedSeasons.has(season)) {
      return { matches: [], planRange: planSeasonRange };
    }

    triedSeasons.add(season);
    if (!canMakeApiFootballRequest()) {
      markQuotaExhausted(diagnostics, warnings, "league-scoped fixture fetch");
      return { matches: [], planRange: planSeasonRange };
    }

    const form = await client.getTeamForm(identity.teamId, TEAM_FORM_LAST, {
      leagueId: identity.leagueId,
      season,
      status: "FT",
    });
    const requestUrl =
      form.meta?.requestPath ??
      buildTeamFormPath(identity.teamId, {
        leagueId: identity.leagueId,
        season,
        status: "FT",
      });
    const normalized = normalizeApiFootballFixtures(form.fixtures);
    const planRestricted = Boolean(form.meta?.planRestriction);
    let detectedPlanRange = planSeasonRange;

    if (form.meta?.planRestriction) {
      detectedPlanRange = {
        minSeason: form.meta.planRestriction.minSeason,
        maxSeason: form.meta.planRestriction.maxSeason,
        message: form.meta.planRestriction.message,
      };
      planSeasonRange = detectedPlanRange;
      fallbackReason = "plan_season_restricted";
      warnings.push(
        `API plan restriction for season=${season}: ${form.meta.planRestriction.message}`
      );
    }

    recordApiAttempt(diagnostics, {
      requestUrl,
      rawResponseCount: form.meta?.rawResponseCount ?? 0,
      afterGoalFilterCount: form.fixtures.length,
      normalizedMatchCount: normalized.length,
      season,
      planRestricted,
      fallbackReason: planRestricted ? "plan_season_restricted" : attemptFallbackReason,
    });
    appendFixtureAttemptWarning(
      warnings,
      form.meta,
      form.fixtures.length,
      identity.leagueId,
      season
    );
    warnings.push(
      `Normalizer: ${normalized.length} official completed matches (league=${identity.leagueId}, season=${season}).`
    );

    return { matches: normalized, planRange: detectedPlanRange };
  };

  if (requestedSeason !== null && identity.leagueId !== null) {
    const requestedAttempt = await tryLeagueSeason(requestedSeason);
    matches = requestedAttempt.matches;
    if (matches.length > 0) {
      dataSeason = requestedSeason;
    } else if (requestedAttempt.planRange) {
      const historicalSeason = requestedAttempt.planRange.maxSeason;
      if (!triedSeasons.has(historicalSeason)) {
        const historicalAttempt = await tryLeagueSeason(
          historicalSeason,
          "historical_season_fallback"
        );
        matches = historicalAttempt.matches;
        if (matches.length > 0) {
          dataSeason = historicalSeason;
          fallbackReason = "historical_season_fallback";
          warnings.push(
            buildHistoricalBaselineWarning(historicalSeason, requestedSeason)
          );
        }
      }
    } else {
      const generalFallbackSeason = requestedSeason - 1;
      if (!triedSeasons.has(generalFallbackSeason)) {
        const fallbackAttempt = await tryLeagueSeason(generalFallbackSeason);
        matches = fallbackAttempt.matches;
        if (matches.length > 0) {
          dataSeason = generalFallbackSeason;
        }
      }
    }
  }

  if (matches.length === 0 && canMakeApiFootballRequest()) {
    const form = await client.getTeamForm(identity.teamId, TEAM_FORM_LAST, {
      status: "FT",
    });
    const normalized = normalizeApiFootballFixtures(form.fixtures);
    recordApiAttempt(diagnostics, {
      requestUrl: form.meta?.requestPath ?? buildTeamFormPath(identity.teamId, { status: "FT" }),
      rawResponseCount: form.meta?.rawResponseCount ?? 0,
      afterGoalFilterCount: form.fixtures.length,
      normalizedMatchCount: normalized.length,
      season: null,
    });
    appendFixtureAttemptWarning(warnings, form.meta, form.fixtures.length, null, null);
    warnings.push(`Normalizer: ${normalized.length} official completed matches (global FT).`);
    if (normalized.length > 0) {
      matches = normalized;
      dataSeason = normalized[0]?.date ? Number(normalized[0].date.slice(0, 4)) : dataSeason;
    }
  } else if (matches.length === 0) {
    markQuotaExhausted(diagnostics, warnings, "global FT fixture fetch");
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
    fallbackReason: isHistoricalBaseline ? fallbackReason ?? "historical_season_fallback" : fallbackReason,
  };

  if (isHistoricalBaseline && seasonMetadata.stalenessYears && seasonMetadata.stalenessYears > 0) {
    warnings.push(
      `Historical baseline staleness: ${seasonMetadata.stalenessYears} season(s) behind requested season ${requestedSeason}.`
    );
  }

  diagnostics.normalizedMatchCount = matches.length;
  return { matches, seasonMetadata, planSeasonRange };
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

  if (!canMakeApiFootballRequest()) {
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

function buildTeamFormPath(
  teamId: number,
  options: { leagueId?: number; season?: number; status?: string }
): string {
  const params = new URLSearchParams();
  params.set("team", String(teamId));
  params.set("last", String(TEAM_FORM_LAST));
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
