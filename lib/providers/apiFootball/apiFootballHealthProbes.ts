import { ApiFootballClient } from "@/lib/providers/apiFootball/apiFootballClient";
import {
  API_FOOTBALL_HEALTH_PROBE_SEASONS,
  API_FOOTBALL_HEALTH_PROBE_TEAM_ID,
  buildProbeDiagnostics,
  classifyConnectivityOutcome,
  classifyDataOutcome,
  isValidFixtureRecord,
  isValidTeamRecord,
  parseApiFootballEnvelope,
  type ApiFootballProbeDiagnostics,
  type ApiFootballProbeOutcome,
} from "@/lib/providers/apiFootball/apiFootballEnvelopeValidation";

export interface ApiFootballQuotaHeaderSnapshot {
  requestsLimit: string | null;
  requestsRemaining: string | null;
}

const DEFAULT_BASE_URL = "https://v3.football.api-sports.io";

export interface ApiFootballIntegrationProbeResult {
  baseUrl: string;
  rawEndpoint: ApiFootballProbeDiagnostics;
  teamLookup: ApiFootballProbeDiagnostics;
  fixtureLookup: ApiFootballProbeDiagnostics;
  quotaHeaders: ApiFootballQuotaHeaderSnapshot;
  fixtureCount: number;
  teamId: number | null;
  teamName: string | null;
  latencyMs: number;
}

function resolveBaseUrl(): string {
  return process.env.API_FOOTBALL_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

function readQuotaHeaders(headers: Headers): ApiFootballQuotaHeaderSnapshot {
  return {
    requestsLimit:
      headers.get("x-ratelimit-requests-limit") ??
      headers.get("X-RateLimit-Requests-Limit"),
    requestsRemaining:
      headers.get("x-ratelimit-requests-remaining") ??
      headers.get("X-RateLimit-Requests-Remaining"),
  };
}

async function fetchProviderEnvelope(input: {
  baseUrl: string;
  apiKey: string;
  path: string;
  endpoint: string;
  queryParameters?: Record<string, string | number>;
}): Promise<{
  httpStatus: number;
  parsed: ReturnType<typeof parseApiFootballEnvelope>;
  quotaHeaders: ApiFootballQuotaHeaderSnapshot;
}> {
  const response = await fetch(`${input.baseUrl}${input.path}`, {
    headers: { "x-apisports-key": input.apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json();
  return {
    httpStatus: response.status,
    parsed: parseApiFootballEnvelope(payload),
    quotaHeaders: readQuotaHeaders(response.headers),
  };
}

export async function runApiFootballIntegrationProbes(input?: {
  apiKey?: string;
  baseUrl?: string;
}): Promise<ApiFootballIntegrationProbeResult> {
  const started = Date.now();
  const apiKey = input?.apiKey ?? process.env.API_FOOTBALL_KEY ?? "";
  const baseUrl = (input?.baseUrl ?? resolveBaseUrl()).replace(/\/$/, "");

  const timezone = await fetchProviderEnvelope({
    baseUrl,
    apiKey,
    path: "/timezone",
    endpoint: "/timezone",
  });
  const rawOutcome = classifyConnectivityOutcome(timezone.httpStatus, timezone.parsed);
  const rawEndpoint = buildProbeDiagnostics({
    endpoint: "/timezone",
    httpStatus: timezone.httpStatus,
    parsed: timezone.parsed,
    outcome: rawOutcome,
    gateReason:
      rawOutcome === "PASS"
        ? "HTTP 200 with valid API-Football envelope and no provider errors"
        : timezone.parsed.schemaValidationReason,
  });

  const client = new ApiFootballClient({ apiKey, baseUrl });
  let teamLookup: ApiFootballProbeDiagnostics;
  let teamId: number | null = null;
  let teamName: string | null = null;

  try {
    const team = await client.getTeamById(API_FOOTBALL_HEALTH_PROBE_TEAM_ID);
    teamId = team?.id ?? null;
    teamName = team?.name ?? null;
    const outcome: ApiFootballProbeOutcome = team ? "PASS" : "NO_DATA";
    teamLookup = {
      endpoint: "/teams",
      httpStatus: 200,
      topLevelKeys: rawEndpoint.topLevelKeys,
      resultsCount: team ? 1 : 0,
      errorsSummary: null,
      responseLength: team ? 1 : 0,
      envelopeValid: true,
      schemaValidationReason: team
        ? "team id and name returned via ApiFootballClient.getTeamById"
        : "no team record returned",
      queryParameters: { id: API_FOOTBALL_HEALTH_PROBE_TEAM_ID },
      outcome,
      gateReason: team
        ? `team=${team.name} id=${team.id}`
        : "provider returned zero team records for stable id",
    };
  } catch (error) {
    teamLookup = {
      endpoint: "/teams",
      httpStatus: 0,
      topLevelKeys: [],
      resultsCount: null,
      errorsSummary: error instanceof Error ? error.message : String(error),
      responseLength: 0,
      envelopeValid: false,
      schemaValidationReason: "ApiFootballClient.getTeamById failed",
      queryParameters: { id: API_FOOTBALL_HEALTH_PROBE_TEAM_ID },
      outcome: "FAIL",
      gateReason: error instanceof Error ? error.message : String(error),
    };
  }

  let fixtureLookup: ApiFootballProbeDiagnostics = {
    endpoint: "/fixtures",
    httpStatus: 0,
    topLevelKeys: [],
    resultsCount: null,
    errorsSummary: null,
    responseLength: 0,
    envelopeValid: false,
    schemaValidationReason: "not executed",
    queryParameters: { team: API_FOOTBALL_HEALTH_PROBE_TEAM_ID },
    outcome: "NOT TESTABLE",
    gateReason: "fixture probe not executed",
  };
  let fixtureCount = 0;

  for (const season of API_FOOTBALL_HEALTH_PROBE_SEASONS) {
    try {
      const fixtures = await client.getFixturesByTeamSeason(
        API_FOOTBALL_HEALTH_PROBE_TEAM_ID,
        season
      );
      fixtureCount = fixtures.length;
      const hasValidItems = fixtures.some((fixture) =>
        Boolean(fixture.fixtureId && fixture.homeTeam && fixture.awayTeam)
      );
      const outcome: ApiFootballProbeOutcome = hasValidItems
        ? "PASS"
        : fixtureCount === 0
          ? "NO_DATA"
          : "FAIL";
      fixtureLookup = {
        endpoint: "/fixtures",
        httpStatus: 200,
        topLevelKeys: rawEndpoint.topLevelKeys,
        resultsCount: fixtureCount,
        errorsSummary: null,
        responseLength: fixtureCount,
        envelopeValid: true,
        schemaValidationReason: hasValidItems
          ? "fixture id, teams and goals mapped via ApiFootballClient.getFixturesByTeamSeason"
          : fixtureCount === 0
            ? "valid query returned zero fixtures"
            : "fixtures returned but failed structural validation",
        queryParameters: { team: API_FOOTBALL_HEALTH_PROBE_TEAM_ID, season },
        outcome,
        gateReason:
          outcome === "PASS"
            ? `season=${season} count=${fixtureCount}`
            : outcome === "NO_DATA"
              ? `season=${season} returned zero fixtures`
              : `season=${season} returned malformed fixture records`,
      };
      if (outcome !== "NO_DATA") {
        break;
      }
    } catch (error) {
      fixtureLookup = {
        endpoint: "/fixtures",
        httpStatus: 0,
        topLevelKeys: [],
        resultsCount: null,
        errorsSummary: error instanceof Error ? error.message : String(error),
        responseLength: 0,
        envelopeValid: false,
        schemaValidationReason: "ApiFootballClient.getFixturesByTeamSeason failed",
        queryParameters: { team: API_FOOTBALL_HEALTH_PROBE_TEAM_ID, season },
        outcome: "FAIL",
        gateReason: error instanceof Error ? error.message : String(error),
      };
      break;
    }
  }

  return {
    baseUrl,
    rawEndpoint,
    teamLookup,
    fixtureLookup,
    quotaHeaders: timezone.quotaHeaders,
    fixtureCount,
    teamId,
    teamName,
    latencyMs: Date.now() - started,
  };
}

export function deriveIntegrationProbePassed(input: {
  keyConfigured: boolean;
  rawEndpoint: ApiFootballProbeDiagnostics;
  teamLookup: ApiFootballProbeDiagnostics;
  fixtureLookup: ApiFootballProbeDiagnostics;
}): boolean {
  if (!input.keyConfigured) {
    return false;
  }
  if (input.rawEndpoint.outcome !== "PASS") {
    return false;
  }
  if (input.teamLookup.outcome === "FAIL") {
    return false;
  }
  if (input.fixtureLookup.outcome === "FAIL") {
    return false;
  }
  return (
    input.teamLookup.outcome === "PASS" &&
    (input.fixtureLookup.outcome === "PASS" || input.fixtureLookup.outcome === "NO_DATA")
  );
}

export async function probeApiFootballRawEndpoint(input?: {
  apiKey?: string;
  baseUrl?: string;
}): Promise<{
  httpStatus: number;
  schemaValid: boolean;
  quotaHeaders: ApiFootballQuotaHeaderSnapshot;
  resultCount: number;
  latencyMs: number;
  errorMessage?: string;
  diagnostics: ApiFootballProbeDiagnostics;
}> {
  const started = Date.now();
  const apiKey = input?.apiKey ?? process.env.API_FOOTBALL_KEY ?? "";
  const baseUrl = (input?.baseUrl ?? resolveBaseUrl()).replace(/\/$/, "");

  const fetched = await fetchProviderEnvelope({
    baseUrl,
    apiKey,
    path: "/timezone",
    endpoint: "/timezone",
  });
  const outcome = classifyConnectivityOutcome(fetched.httpStatus, fetched.parsed);
  const diagnostics = buildProbeDiagnostics({
    endpoint: "/timezone",
    httpStatus: fetched.httpStatus,
    parsed: fetched.parsed,
    outcome,
    gateReason: fetched.parsed.schemaValidationReason,
  });

  return {
    httpStatus: fetched.httpStatus,
    schemaValid: outcome === "PASS",
    quotaHeaders: fetched.quotaHeaders,
    resultCount: fetched.parsed.response.length,
    latencyMs: Date.now() - started,
    errorMessage: outcome === "FAIL" ? fetched.parsed.schemaValidationReason : undefined,
    diagnostics,
  };
}

export async function probeInvalidApiFootballKey(): Promise<{
  handledSafely: boolean;
  message: string;
}> {
  try {
    const result = await probeApiFootballRawEndpoint({
      apiKey: "invalid-health-check-key-00000000",
    });
    if (result.httpStatus === 401 || result.httpStatus === 403) {
      return {
        handledSafely: true,
        message: `invalid key rejected with HTTP ${result.httpStatus}`,
      };
    }
    if (!result.schemaValid) {
      return {
        handledSafely: true,
        message: result.diagnostics.errorsSummary ?? result.diagnostics.schemaValidationReason,
      };
    }
    return {
      handledSafely: false,
      message: `unexpected success for invalid key (HTTP ${result.httpStatus})`,
    };
  } catch (error) {
    return {
      handledSafely: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export { isValidFixtureRecord, isValidTeamRecord, classifyDataOutcome };
