import type { ApiFootballTeamStatisticsRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import {
  ApiFootballClient,
  getApiFootballClient,
  getApiFootballCurrentSeason,
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
import type {
  TeamProfileAdvancedStatsInput,
  TeamProfileFetchDiagnostics,
  TeamProfileIdentity,
  TeamProfileMatchInput,
} from "@/lib/teamProfile/teamProfileTypes";

export interface TeamProfileDataFetchResult {
  matches: TeamProfileMatchInput[];
  advancedStats: TeamProfileAdvancedStatsInput | null;
  source: "api-football" | "match-records" | "incomplete";
  warnings: string[];
  diagnostics: TeamProfileFetchDiagnostics;
}

const TEAM_FORM_LAST = 15;

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
    return finalizeWithoutApiMatches(identity, options, warnings, diagnostics);
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
      const apiResult = await fetchTeamProfileDataFromApi(client, identity, warnings);
      diagnostics = apiResult.diagnostics;

      if (apiResult.matches.length > 0) {
        return {
          matches: apiResult.matches,
          advancedStats: apiResult.advancedStats,
          source: "api-football",
          warnings,
          diagnostics,
        };
      }

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

  return finalizeWithoutApiMatches(identity, options, warnings, diagnostics);
}

export function mergeTeamProfileMatches(
  primary: TeamProfileMatchInput[],
  fallback: TeamProfileMatchInput[]
): TeamProfileMatchInput[] {
  const merged = new Map<number, TeamProfileMatchInput>();
  for (const match of [...primary, ...fallback]) {
    merged.set(match.fixtureId, match);
  }
  return sortMatchesDesc([...merged.values()]);
}

async function fetchTeamProfileDataFromApi(
  client: ApiFootballClient,
  identity: TeamProfileIdentity,
  warnings: string[]
): Promise<{
  matches: TeamProfileMatchInput[];
  advancedStats: TeamProfileAdvancedStatsInput | null;
  diagnostics: TeamProfileFetchDiagnostics;
}> {
  const diagnostics = createEmptyFetchDiagnostics({
    apiConfigured: client.isConfigured(),
    quotaAvailable: canMakeApiFootballRequest(),
    quotaBlockReason: getApiFootballQuotaBlockReason(),
  });

  const matches = await fetchTeamFixturesFromApi(client, identity, warnings, diagnostics);
  const advancedStats = await fetchAdvancedStatsFromApi(client, identity, warnings, diagnostics);

  return { matches, advancedStats, diagnostics };
}

async function fetchTeamFixturesFromApi(
  client: ApiFootballClient,
  identity: TeamProfileIdentity,
  warnings: string[],
  diagnostics: TeamProfileFetchDiagnostics
): Promise<TeamProfileMatchInput[]> {
  const seasonCandidates = buildSeasonCandidates(identity.season);

  if (identity.leagueId !== null) {
    for (const season of seasonCandidates) {
      if (!canMakeApiFootballRequest()) {
        markQuotaExhausted(diagnostics, warnings, "league-scoped fixture fetch");
        break;
      }

      const form = await client.getTeamForm(identity.teamId, TEAM_FORM_LAST, {
        leagueId: identity.leagueId,
        season,
        status: "FT",
      });
      const matches = normalizeApiFootballFixtures(form.fixtures);
      recordApiAttempt(diagnostics, {
        requestUrl: form.meta?.requestPath ?? buildTeamFormPath(identity.teamId, {
          leagueId: identity.leagueId,
          season,
          status: "FT",
        }),
        rawResponseCount: form.meta?.rawResponseCount ?? 0,
        afterGoalFilterCount: form.fixtures.length,
        normalizedMatchCount: matches.length,
      });
      appendFixtureAttemptWarning(
        warnings,
        form.meta,
        form.fixtures.length,
        identity.leagueId,
        season
      );
      warnings.push(
        `Normalizer: ${matches.length} official completed matches (league=${identity.leagueId}, season=${season}).`
      );
      if (matches.length > 0) {
        return matches;
      }
    }
  }

  if (canMakeApiFootballRequest()) {
    const form = await client.getTeamForm(identity.teamId, TEAM_FORM_LAST, {
      status: "FT",
    });
    const matches = normalizeApiFootballFixtures(form.fixtures);
    recordApiAttempt(diagnostics, {
      requestUrl: form.meta?.requestPath ?? buildTeamFormPath(identity.teamId, { status: "FT" }),
      rawResponseCount: form.meta?.rawResponseCount ?? 0,
      afterGoalFilterCount: form.fixtures.length,
      normalizedMatchCount: matches.length,
    });
    appendFixtureAttemptWarning(warnings, form.meta, form.fixtures.length, null, null);
    warnings.push(`Normalizer: ${matches.length} official completed matches (global FT).`);
    if (matches.length > 0) {
      return matches;
    }
  } else {
    markQuotaExhausted(diagnostics, warnings, "global FT fixture fetch");
  }

  if (canMakeApiFootballRequest()) {
    const form = await client.getTeamForm(identity.teamId, TEAM_FORM_LAST);
    const matches = normalizeApiFootballFixtures(form.fixtures);
    recordApiAttempt(diagnostics, {
      requestUrl: form.meta?.requestPath ?? buildTeamFormPath(identity.teamId, {}),
      rawResponseCount: form.meta?.rawResponseCount ?? 0,
      afterGoalFilterCount: form.fixtures.length,
      normalizedMatchCount: matches.length,
    });
    appendFixtureAttemptWarning(warnings, form.meta, form.fixtures.length, null, null);
    warnings.push(`Normalizer: ${matches.length} official completed matches (global last).`);
    if (matches.length > 0) {
      return matches;
    }
  } else {
    markQuotaExhausted(diagnostics, warnings, "global last fixture fetch");
  }

  return [];
}

async function fetchAdvancedStatsFromApi(
  client: ApiFootballClient,
  identity: TeamProfileIdentity,
  warnings: string[],
  diagnostics: TeamProfileFetchDiagnostics
): Promise<TeamProfileAdvancedStatsInput | null> {
  if (identity.leagueId === null) {
    return null;
  }

  for (const season of buildSeasonCandidates(identity.season)) {
    if (!canMakeApiFootballRequest()) {
      markQuotaExhausted(diagnostics, warnings, "team statistics fetch");
      break;
    }

    const stats = await client.getTeamStatistics({
      teamId: identity.teamId,
      leagueId: identity.leagueId,
      season,
    });
    const requestPath = `/teams/statistics?team=${identity.teamId}&league=${identity.leagueId}&season=${season}`;
    warnings.push(
      stats
        ? `API ${requestPath} returned season stats (fixturesPlayed=${stats.fixturesPlayed ?? 0}).`
        : `API ${requestPath} returned empty.`
    );

    if (stats && (stats.fixturesPlayed ?? 0) > 0) {
      return mapSeasonStatistics(stats);
    }
  }

  return null;
}

async function finalizeWithoutApiMatches(
  identity: TeamProfileIdentity,
  options: {
    listVerifiedRecords?: () => Promise<HistoricalMatchRecord[]>;
  },
  warnings: string[],
  diagnostics: TeamProfileFetchDiagnostics
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
    };
  }

  warnings.push("Insufficient team history from API and verified match records.");
  return {
    matches: [],
    advancedStats: null,
    source: "incomplete",
    warnings,
    diagnostics,
  };
}

function buildSeasonCandidates(season: number | null): number[] {
  const candidates: number[] = [];
  const add = (value: number) => {
    if (!candidates.includes(value)) {
      candidates.push(value);
    }
  };

  if (season !== null) {
    add(season);
    add(season - 1);
  }
  add(getApiFootballCurrentSeason());
  return candidates;
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
