import { execSync } from "child_process";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { loadEnvLocal } from "@/lib/healthCheck/productionHealthCheckRunner";
import { checkAdminApiKeyConfigured } from "@/lib/supabase/productionVerification";
import type { ProductionApiFootballProbeResult } from "@/lib/providers/apiFootball/productionApiFootballProbe";
import type { ApiFootballProbeOutcome } from "@/lib/providers/apiFootball/apiFootballEnvelopeValidation";

const PRODUCTION_URL =
  process.env.HEALTH_CHECK_PRODUCTION_URL?.trim() ||
  "https://football-ai-ten.vercel.app";

export type VerificationStatus =
  | "PASS"
  | "FAIL"
  | "NOT TESTABLE"
  | "MANUAL ACTION REQUIRED";

export interface ProductionApiFootballVerificationReport {
  version: "v1";
  completedAt: string;
  overallStatus: VerificationStatus;
  productionDeployment: VerificationStatus;
  environmentVariables: VerificationStatus;
  authenticatedHealthRoute: VerificationStatus;
  providerRawEndpoint: VerificationStatus;
  providerTeamLookup: VerificationStatus;
  providerFixtureLookup: VerificationStatus;
  manualActionRequired: boolean;
  manualSteps: string[];
  productionUrl: string;
  healthCheckId: string | null;
  probeResult: ProductionApiFootballProbeResult | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 3
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(1500 * attempt);
      }
    }
  }
  throw lastError;
}

function mapProbeStatus(status: ApiFootballProbeOutcome): VerificationStatus {
  if (status === "PASS" || status === "NO_DATA") {
    return "PASS";
  }
  if (status === "FAIL") {
    return "FAIL";
  }
  return "NOT TESTABLE";
}

export async function runProductionApiFootballVerification(options?: {
  skipBuild?: boolean;
}): Promise<ProductionApiFootballVerificationReport> {
  loadEnvLocal();

  const manualSteps: string[] = [];
  const adminCheck = checkAdminApiKeyConfigured();
  manualSteps.push(...adminCheck.manualSteps);
  manualSteps.push(
    "Verify Vercel Production has server-only API_FOOTBALL_KEY configured (not NEXT_PUBLIC_*)."
  );
  manualSteps.push(
    "Optional: API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io if using the default api-sports endpoint."
  );

  const baseUrl = PRODUCTION_URL.replace(/\/$/, "");

  if (!adminCheck.present) {
    let productionDeployment: VerificationStatus = "NOT TESTABLE";
    try {
      const publicHealth = await fetchWithRetry(`${baseUrl}/api/data/health`, {
        method: "GET",
      });
      productionDeployment = publicHealth.ok ? "PASS" : "FAIL";
    } catch {
      productionDeployment = "FAIL";
    }

    return {
      version: "v1",
      completedAt: new Date().toISOString(),
      overallStatus: "MANUAL ACTION REQUIRED",
      productionDeployment,
      environmentVariables: "MANUAL ACTION REQUIRED",
      authenticatedHealthRoute: "NOT TESTABLE",
      providerRawEndpoint: "NOT TESTABLE",
      providerTeamLookup: "NOT TESTABLE",
      providerFixtureLookup: "NOT TESTABLE",
      manualActionRequired: true,
      manualSteps,
      productionUrl: baseUrl,
      healthCheckId: null,
      probeResult: null,
    };
  }

  if (!options?.skipBuild) {
    execSync("npm test", { stdio: "inherit", cwd: process.cwd(), maxBuffer: 32 * 1024 * 1024 });
    execSync("npm run build", { stdio: "inherit", cwd: process.cwd(), maxBuffer: 32 * 1024 * 1024 });
  }

  const adminKey = process.env.ADMIN_API_KEY!.trim();
  const healthCheckId = `production-api-football-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  let productionDeployment: VerificationStatus = "FAIL";
  let authenticatedHealthRoute: VerificationStatus = "NOT TESTABLE";
  let providerRawEndpoint: VerificationStatus = "NOT TESTABLE";
  let providerTeamLookup: VerificationStatus = "NOT TESTABLE";
  let providerFixtureLookup: VerificationStatus = "NOT TESTABLE";
  let probeResult: ProductionApiFootballProbeResult | null = null;

  manualSteps.push(
    "Vercel Production env vars cannot be read from this environment — confirm API_FOOTBALL_KEY in Vercel Dashboard."
  );

  const environmentVariables: VerificationStatus = "NOT TESTABLE";

  try {
    const publicHealth = await fetchWithRetry(`${baseUrl}/api/data/health`, { method: "GET" });
    productionDeployment = publicHealth.ok ? "PASS" : "FAIL";

    const unauthorizedPost = await fetchWithRetry(`${baseUrl}/api/data/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "production-api-football-probe", healthCheckId }),
    });
    if (unauthorizedPost.status !== 401 && unauthorizedPost.status !== 403) {
      manualSteps.push(
        `Expected POST /api/data/health without auth to return 401/403; got ${unauthorizedPost.status}.`
      );
    }

    const authPost = await fetchWithRetry(`${baseUrl}/api/data/health`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": adminKey,
      },
      body: JSON.stringify({ action: "production-api-football-probe", healthCheckId }),
    });

    authenticatedHealthRoute = authPost.ok ? "PASS" : authPost.status === 503 ? "FAIL" : "FAIL";
    const body = (await authPost.json()) as {
      ok?: boolean;
      probe?: ProductionApiFootballProbeResult;
    };
    probeResult = body.probe ?? null;

    if (probeResult) {
      providerRawEndpoint = mapProbeStatus(probeResult.rawEndpointStatus);
      providerTeamLookup = mapProbeStatus(probeResult.teamLookupStatus);
      providerFixtureLookup = mapProbeStatus(probeResult.fixtureLookupStatus);

      if (!probeResult.keyConfigured) {
        manualSteps.push(
          "Production server returned keyConfigured=false — add API_FOOTBALL_KEY to Vercel Production and redeploy."
        );
      }
    } else {
      manualSteps.push("Production probe response did not include probe payload.");
    }
  } catch (error) {
    manualSteps.push(error instanceof Error ? error.message : String(error));
  }

  const overallStatus = deriveOverallStatus({
    productionDeployment,
    authenticatedHealthRoute,
    providerRawEndpoint,
    providerFixtureLookup,
    probeResult,
  });

  return {
    version: "v1",
    completedAt: new Date().toISOString(),
    overallStatus,
    productionDeployment,
    environmentVariables,
    authenticatedHealthRoute,
    providerRawEndpoint,
    providerTeamLookup,
    providerFixtureLookup,
    manualActionRequired: overallStatus === "MANUAL ACTION REQUIRED",
    manualSteps,
    productionUrl: baseUrl,
    healthCheckId,
    probeResult,
  };
}

function deriveOverallStatus(input: {
  productionDeployment: VerificationStatus;
  authenticatedHealthRoute: VerificationStatus;
  providerRawEndpoint: VerificationStatus;
  providerFixtureLookup: VerificationStatus;
  probeResult: ProductionApiFootballProbeResult | null;
}): VerificationStatus {
  if (input.probeResult && !input.probeResult.keyConfigured) {
    return "MANUAL ACTION REQUIRED";
  }
  if (
    input.productionDeployment === "PASS" &&
    input.authenticatedHealthRoute === "PASS" &&
    input.providerRawEndpoint === "PASS" &&
    input.probeResult?.passed
  ) {
    return "PASS";
  }
  if (
    input.providerRawEndpoint === "FAIL" ||
    input.probeResult?.rawEndpointStatus === "FAIL" ||
    input.probeResult?.teamLookupStatus === "FAIL" ||
    input.probeResult?.fixtureLookupStatus === "FAIL"
  ) {
    return "FAIL";
  }
  return "MANUAL ACTION REQUIRED";
}

export function writeProductionApiFootballVerificationArtifacts(
  report: ProductionApiFootballVerificationReport
): void {
  const markdown = renderProductionApiFootballVerificationMarkdown(report);
  writeFileSync(resolve(process.cwd(), "PRODUCTION_API_FOOTBALL_VERIFICATION.md"), markdown, "utf8");

  const artifactsDir = resolve(process.cwd(), "artifacts");
  if (!existsSync(artifactsDir)) {
    mkdirSync(artifactsDir, { recursive: true });
  }
  writeFileSync(
    resolve(artifactsDir, "production-api-football-verification.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );
}

function renderProductionApiFootballVerificationMarkdown(
  report: ProductionApiFootballVerificationReport
): string {
  const probe = report.probeResult;
  const diagnostics = probe?.diagnostics;

  const renderDiagnostic = (
    label: string,
    diagnostic: NonNullable<typeof diagnostics>["rawEndpoint"] | undefined
  ): string[] => {
    if (!diagnostic) {
      return [`### ${label}`, "", "_No diagnostics._", ""];
    }
    return [
      `### ${label}`,
      "",
      "| Field | Value |",
      "|-------|-------|",
      `| Endpoint | ${diagnostic.endpoint} |`,
      `| HTTP status | ${diagnostic.httpStatus} |`,
      `| Outcome | ${diagnostic.outcome} |`,
      `| Top-level keys | ${diagnostic.topLevelKeys.join(", ") || "-"} |`,
      `| Provider errors | ${diagnostic.errorsSummary ?? "-"} |`,
      `| Results count | ${diagnostic.resultsCount ?? "-"} |`,
      `| Response length | ${diagnostic.responseLength} |`,
      `| Envelope valid | ${diagnostic.envelopeValid ? "yes" : "no"} |`,
      `| Schema validation | ${diagnostic.schemaValidationReason} |`,
      `| Query parameters | ${diagnostic.queryParameters ? JSON.stringify(diagnostic.queryParameters) : "-"} |`,
      `| Gate reason | ${diagnostic.gateReason} |`,
      "",
    ];
  };

  return [
    "# Production API-Football Verification",
    "",
    `**Completed:** ${report.completedAt}`,
    `**Overall:** ${report.overallStatus}`,
    `**Production URL:** ${report.productionUrl}`,
    "",
    "## Gates",
    "",
    "| Gate | Status |",
    "|------|--------|",
    `| Production deployment | ${report.productionDeployment} |`,
    `| Environment variables | ${report.environmentVariables} |`,
    `| Authenticated health route | ${report.authenticatedHealthRoute} |`,
    `| Provider raw endpoint | ${report.providerRawEndpoint} |`,
    `| Provider team lookup | ${report.providerTeamLookup} |`,
    `| Provider fixture lookup | ${report.providerFixtureLookup} |`,
    "",
    "## Probe Summary",
    "",
    probe
      ? [
          "| Field | Value |",
          "|-------|-------|",
          `| healthCheckId | ${probe.healthCheckId} |`,
          `| keyConfigured (server) | ${probe.keyConfigured ? "yes" : "no"} |`,
          `| baseUrl | ${probe.baseUrl} |`,
          `| httpStatus | ${probe.httpStatus ?? "-"} |`,
          `| schemaValid | ${probe.schemaValid ? "yes" : "no"} |`,
          `| rawEndpointStatus | ${probe.rawEndpointStatus} |`,
          `| teamLookupStatus | ${probe.teamLookupStatus} |`,
          `| fixtureLookupStatus | ${probe.fixtureLookupStatus} |`,
          `| quota limit header | ${probe.quotaHeaders.requestsLimit ?? "-"} |`,
          `| quota remaining header | ${probe.quotaHeaders.requestsRemaining ?? "-"} |`,
          `| teamId | ${probe.teamId ?? "-"} |`,
          `| teamName | ${probe.teamName ?? "-"} |`,
          `| fixtureCount | ${probe.fixtureCount} |`,
          `| latencyMs | ${probe.latencyMs} |`,
          `| passed | ${probe.passed ? "yes" : "no"} |`,
          "",
        ].join("\n")
      : "_No probe result._",
    "",
    "## Diagnostics",
    "",
    ...renderDiagnostic("Raw Endpoint", diagnostics?.rawEndpoint),
    ...renderDiagnostic("Team Lookup", diagnostics?.teamLookup),
    ...renderDiagnostic("Fixture Lookup", diagnostics?.fixtureLookup),
    "## Manual Steps",
    "",
    ...report.manualSteps.map((step) => `- ${step}`),
    "",
  ].join("\n");
}
