import type { ApiFootballProbeDiagnostics } from "@/lib/providers/apiFootball/apiFootballEnvelopeValidation";
import {
  deriveIntegrationProbePassed,
  runApiFootballIntegrationProbes,
  type ApiFootballQuotaHeaderSnapshot,
} from "@/lib/providers/apiFootball/apiFootballHealthProbes";

export interface ProductionApiFootballProbeResult {
  healthCheckId: string;
  passed: boolean;
  keyConfigured: boolean;
  baseUrl: string;
  httpStatus: number | null;
  schemaValid: boolean;
  quotaHeaders: ApiFootballQuotaHeaderSnapshot;
  teamLookupStatus: ApiFootballProbeDiagnostics["outcome"];
  fixtureLookupStatus: ApiFootballProbeDiagnostics["outcome"];
  rawEndpointStatus: ApiFootballProbeDiagnostics["outcome"];
  fixtureCount: number;
  teamId: number | null;
  teamName: string | null;
  latencyMs: number;
  errorMessage?: string;
  diagnostics: {
    rawEndpoint: ApiFootballProbeDiagnostics;
    teamLookup: ApiFootballProbeDiagnostics;
    fixtureLookup: ApiFootballProbeDiagnostics;
  };
}

export async function runProductionApiFootballProbe(
  healthCheckId: string
): Promise<ProductionApiFootballProbeResult> {
  const keyConfigured = Boolean(process.env.API_FOOTBALL_KEY?.trim());

  if (!keyConfigured) {
    const emptyDiagnostics: ApiFootballProbeDiagnostics = {
      endpoint: "n/a",
      httpStatus: 0,
      topLevelKeys: [],
      resultsCount: null,
      errorsSummary: "API_FOOTBALL_KEY is not configured on the server.",
      responseLength: 0,
      envelopeValid: false,
      schemaValidationReason: "missing API_FOOTBALL_KEY",
      outcome: "NOT TESTABLE",
      gateReason: "API_FOOTBALL_KEY is not configured on the server.",
    };

    return {
      healthCheckId,
      passed: false,
      keyConfigured: false,
      baseUrl: process.env.API_FOOTBALL_BASE_URL?.trim() || "https://v3.football.api-sports.io",
      httpStatus: null,
      schemaValid: false,
      quotaHeaders: { requestsLimit: null, requestsRemaining: null },
      teamLookupStatus: "NOT TESTABLE",
      fixtureLookupStatus: "NOT TESTABLE",
      rawEndpointStatus: "NOT TESTABLE",
      fixtureCount: 0,
      teamId: null,
      teamName: null,
      latencyMs: 0,
      errorMessage: "API_FOOTBALL_KEY is not configured on the server.",
      diagnostics: {
        rawEndpoint: emptyDiagnostics,
        teamLookup: emptyDiagnostics,
        fixtureLookup: emptyDiagnostics,
      },
    };
  }

  const integration = await runApiFootballIntegrationProbes();
  const passed = deriveIntegrationProbePassed({
    keyConfigured,
    rawEndpoint: integration.rawEndpoint,
    teamLookup: integration.teamLookup,
    fixtureLookup: integration.fixtureLookup,
  });

  const errorMessage =
    integration.rawEndpoint.outcome === "FAIL"
      ? integration.rawEndpoint.schemaValidationReason
      : integration.teamLookup.outcome === "FAIL"
        ? integration.teamLookup.gateReason
        : integration.fixtureLookup.outcome === "FAIL"
          ? integration.fixtureLookup.gateReason
          : undefined;

  return {
    healthCheckId,
    passed,
    keyConfigured,
    baseUrl: integration.baseUrl,
    httpStatus: integration.rawEndpoint.httpStatus,
    schemaValid: integration.rawEndpoint.outcome === "PASS",
    quotaHeaders: integration.quotaHeaders,
    teamLookupStatus: integration.teamLookup.outcome,
    fixtureLookupStatus: integration.fixtureLookup.outcome,
    rawEndpointStatus: integration.rawEndpoint.outcome,
    fixtureCount: integration.fixtureCount,
    teamId: integration.teamId,
    teamName: integration.teamName,
    latencyMs: integration.latencyMs,
    errorMessage,
    diagnostics: {
      rawEndpoint: integration.rawEndpoint,
      teamLookup: integration.teamLookup,
      fixtureLookup: integration.fixtureLookup,
    },
  };
}
