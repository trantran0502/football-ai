export type ApiFootballProbeOutcome = "PASS" | "NO_DATA" | "FAIL" | "NOT TESTABLE";

export interface ApiFootballEnvelopeParseResult {
  envelopeValid: boolean;
  hasBlockingErrors: boolean;
  errorsSummary: string | null;
  resultsCount: number | null;
  response: unknown[];
  topLevelKeys: string[];
  endpointName: string;
  pagingPresent: boolean;
  schemaValidationReason: string;
}

export interface ApiFootballProbeDiagnostics {
  endpoint: string;
  httpStatus: number;
  topLevelKeys: string[];
  resultsCount: number | null;
  errorsSummary: string | null;
  responseLength: number;
  envelopeValid: boolean;
  schemaValidationReason: string;
  queryParameters?: Record<string, string | number>;
  outcome: ApiFootballProbeOutcome;
  gateReason: string;
}

const REQUIRED_ENVELOPE_KEYS = [
  "get",
  "parameters",
  "errors",
  "results",
  "paging",
  "response",
] as const;

export function summarizeProviderErrors(errors: unknown): string | null {
  if (errors === null || errors === undefined) {
    return null;
  }

  if (Array.isArray(errors)) {
    return errors.length === 0 ? null : errors.map(String).join("; ");
  }

  if (typeof errors === "object") {
    const entries = Object.entries(errors as Record<string, unknown>);
    if (entries.length === 0) {
      return null;
    }
    return entries.map(([key, value]) => `${key}: ${String(value)}`).join("; ");
  }

  const serialized = String(errors).trim();
  return serialized.length > 0 ? serialized : null;
}

export function parseApiFootballEnvelope(payload: unknown): ApiFootballEnvelopeParseResult {
  if (!payload || typeof payload !== "object") {
    return {
      envelopeValid: false,
      hasBlockingErrors: true,
      errorsSummary: "payload is not an object",
      resultsCount: null,
      response: [],
      topLevelKeys: [],
      endpointName: "",
      pagingPresent: false,
      schemaValidationReason: "payload is not an object",
    };
  }

  const record = payload as Record<string, unknown>;
  const topLevelKeys = Object.keys(record);
  const missingKeys = REQUIRED_ENVELOPE_KEYS.filter((key) => !(key in record));
  if (missingKeys.length > 0) {
    return {
      envelopeValid: false,
      hasBlockingErrors: true,
      errorsSummary: null,
      resultsCount: null,
      response: [],
      topLevelKeys,
      endpointName: typeof record.get === "string" ? record.get : "",
      pagingPresent: false,
      schemaValidationReason: `missing envelope keys: ${missingKeys.join(", ")}`,
    };
  }

  if (!Array.isArray(record.response)) {
    return {
      envelopeValid: false,
      hasBlockingErrors: true,
      errorsSummary: null,
      resultsCount: null,
      response: [],
      topLevelKeys,
      endpointName: String(record.get ?? ""),
      pagingPresent: record.paging !== null && typeof record.paging === "object",
      schemaValidationReason: "response is not an array",
    };
  }

  const errorsSummary = summarizeProviderErrors(record.errors);
  const hasBlockingErrors = errorsSummary !== null;
  const resultsCount = typeof record.results === "number" ? record.results : null;

  return {
    envelopeValid: true,
    hasBlockingErrors,
    errorsSummary,
    resultsCount,
    response: record.response,
    topLevelKeys,
    endpointName: String(record.get ?? ""),
    pagingPresent: record.paging !== null && typeof record.paging === "object",
    schemaValidationReason: hasBlockingErrors
      ? `provider errors present: ${errorsSummary}`
      : "valid API-Football v3 envelope",
  };
}

export function classifyConnectivityOutcome(
  httpStatus: number,
  parsed: ApiFootballEnvelopeParseResult
): ApiFootballProbeOutcome {
  if (httpStatus !== 200) {
    return "FAIL";
  }
  if (!parsed.envelopeValid) {
    return "FAIL";
  }
  if (parsed.hasBlockingErrors) {
    return "FAIL";
  }
  return "PASS";
}

export function classifyDataOutcome(
  httpStatus: number,
  parsed: ApiFootballEnvelopeParseResult,
  hasValidItems: boolean
): ApiFootballProbeOutcome {
  const connectivity = classifyConnectivityOutcome(httpStatus, parsed);
  if (connectivity === "FAIL") {
    return "FAIL";
  }
  return hasValidItems ? "PASS" : "NO_DATA";
}

export function isValidTeamRecord(item: unknown): boolean {
  if (!item || typeof item !== "object") {
    return false;
  }
  const team = (item as Record<string, unknown>).team;
  if (!team || typeof team !== "object") {
    return false;
  }
  const teamRecord = team as Record<string, unknown>;
  return typeof teamRecord.id === "number" && typeof teamRecord.name === "string";
}

export function isValidFixtureRecord(item: unknown): boolean {
  if (!item || typeof item !== "object") {
    return false;
  }
  const record = item as Record<string, unknown>;
  const fixture = record.fixture;
  const teams = record.teams;
  if (!fixture || typeof fixture !== "object" || !teams || typeof teams !== "object") {
    return false;
  }
  const fixtureRecord = fixture as Record<string, unknown>;
  const teamRecord = teams as Record<string, Record<string, unknown>>;
  return (
    typeof fixtureRecord.id === "number" &&
    typeof teamRecord.home?.id === "number" &&
    typeof teamRecord.away?.id === "number" &&
    typeof teamRecord.home?.name === "string" &&
    typeof teamRecord.away?.name === "string"
  );
}

export function buildProbeDiagnostics(input: {
  endpoint: string;
  httpStatus: number;
  parsed: ApiFootballEnvelopeParseResult;
  outcome: ApiFootballProbeOutcome;
  gateReason: string;
  queryParameters?: Record<string, string | number>;
}): ApiFootballProbeDiagnostics {
  return {
    endpoint: input.endpoint,
    httpStatus: input.httpStatus,
    topLevelKeys: input.parsed.topLevelKeys,
    resultsCount: input.parsed.resultsCount,
    errorsSummary: input.parsed.errorsSummary,
    responseLength: input.parsed.response.length,
    envelopeValid: input.parsed.envelopeValid,
    schemaValidationReason: input.parsed.schemaValidationReason,
    queryParameters: input.queryParameters,
    outcome: input.outcome,
    gateReason: input.gateReason,
  };
}

export const API_FOOTBALL_HEALTH_PROBE_TEAM_ID = 42;
export const API_FOOTBALL_HEALTH_PROBE_SEASONS = [2023, 2022, 2021] as const;
