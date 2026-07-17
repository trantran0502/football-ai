import {
  probeApiFootballRawEndpoint,
  type ApiFootballQuotaHeaderSnapshot,
} from "@/lib/providers/apiFootball/apiFootballHealthRunner";
import { ApiFootballClient } from "@/lib/providers/apiFootball/apiFootballClient";

export interface ProductionApiFootballProbeResult {
  healthCheckId: string;
  passed: boolean;
  keyConfigured: boolean;
  baseUrl: string;
  httpStatus: number | null;
  schemaValid: boolean;
  quotaHeaders: ApiFootballQuotaHeaderSnapshot;
  teamLookupStatus: "PASS" | "FAIL" | "WARNING" | "NOT TESTABLE";
  fixtureLookupStatus: "PASS" | "FAIL" | "NOT TESTABLE";
  fixtureCount: number;
  latencyMs: number;
  errorMessage?: string;
}

export async function runProductionApiFootballProbe(
  healthCheckId: string
): Promise<ProductionApiFootballProbeResult> {
  const baseUrl =
    process.env.API_FOOTBALL_BASE_URL?.trim() || "https://v3.football.api-sports.io";
  const keyConfigured = Boolean(process.env.API_FOOTBALL_KEY?.trim());

  if (!keyConfigured) {
    return {
      healthCheckId,
      passed: false,
      keyConfigured: false,
      baseUrl,
      httpStatus: null,
      schemaValid: false,
      quotaHeaders: { requestsLimit: null, requestsRemaining: null },
      teamLookupStatus: "NOT TESTABLE",
      fixtureLookupStatus: "NOT TESTABLE",
      fixtureCount: 0,
      latencyMs: 0,
      errorMessage: "API_FOOTBALL_KEY is not configured on the server.",
    };
  }

  const started = Date.now();
  let httpStatus: number | null = null;
  let schemaValid = false;
  let quotaHeaders: ApiFootballQuotaHeaderSnapshot = {
    requestsLimit: null,
    requestsRemaining: null,
  };
  let teamLookupStatus: ProductionApiFootballProbeResult["teamLookupStatus"] = "NOT TESTABLE";
  let fixtureLookupStatus: ProductionApiFootballProbeResult["fixtureLookupStatus"] = "NOT TESTABLE";
  let fixtureCount = 0;
  let errorMessage: string | undefined;

  try {
    const raw = await probeApiFootballRawEndpoint();
    httpStatus = raw.httpStatus;
    schemaValid = raw.schemaValid;
    quotaHeaders = raw.quotaHeaders;

    const client = new ApiFootballClient();
    const team = await client.searchTeam("Arsenal");
    teamLookupStatus = team ? "PASS" : "WARNING";

    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const fixtures = await client.getFixturesByDate(yesterday);
    fixtureCount = fixtures.length;
    fixtureLookupStatus = "PASS";
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
    fixtureLookupStatus = "FAIL";
  }

  const latencyMs = Date.now() - started;
  const passed =
    keyConfigured &&
    httpStatus === 200 &&
    schemaValid &&
    fixtureLookupStatus === "PASS" &&
    (teamLookupStatus === "PASS" || teamLookupStatus === "WARNING");

  return {
    healthCheckId,
    passed,
    keyConfigured,
    baseUrl,
    httpStatus,
    schemaValid,
    quotaHeaders,
    teamLookupStatus,
    fixtureLookupStatus,
    fixtureCount,
    latencyMs,
    errorMessage,
  };
}
