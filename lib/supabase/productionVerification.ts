import { execSync } from "child_process";
import { writeFileSync, readFileSync } from "fs";
import { resolve } from "path";
import { loadEnvLocal } from "@/lib/healthCheck/productionHealthCheckRunner";
import { getSupabaseConfigSummary } from "@/lib/supabase/env";
import type { ProductionCrudProbeResult } from "@/lib/supabase/productionCrudProbe";

const PRODUCTION_URL =
  process.env.HEALTH_CHECK_PRODUCTION_URL?.trim() ||
  "https://football-ai-ten.vercel.app";

const TARGET_COMMIT = "8193e3b556bdc462021f801e565271da923a9e13";

export type VerificationStatus = "PASS" | "FAIL" | "NOT TESTABLE" | "MANUAL ACTION REQUIRED";

export interface ProductionVerificationReport {
  version: "v1";
  completedAt: string;
  overallStatus: VerificationStatus;
  productionDeployment: VerificationStatus;
  environmentVariables: VerificationStatus;
  authenticatedHealthRoute: VerificationStatus;
  productionInsert: VerificationStatus;
  productionSelect: VerificationStatus;
  productionUpdate: VerificationStatus;
  productionDelete: VerificationStatus;
  cleanup: VerificationStatus;
  manualActionRequired: boolean;
  manualSteps: string[];
  localSupabaseHost: string | null;
  productionSupabaseHost: string | null;
  sameSupabaseProject: boolean | null;
  deploymentCommit: VerificationStatus;
  healthCheckId: string | null;
  probeResult: ProductionCrudProbeResult | null;
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

export function checkAdminApiKeyConfigured(): {
  present: boolean;
  manualSteps: string[];
} {
  const present = Boolean(process.env.ADMIN_API_KEY?.trim());
  const manualSteps: string[] = [];

  if (!present) {
    manualSteps.push(
      "Generate a secure random key locally (do not commit): `node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"`"
    );
    manualSteps.push("Add to `.env.local`: ADMIN_API_KEY=<generated-value>");
    manualSteps.push("Add the same value to Vercel → Project → Settings → Environment Variables → Production → ADMIN_API_KEY");
    manualSteps.push("Ensure Production also has SUPABASE_URL (or equivalent server URL) and SUPABASE_SERVICE_ROLE_KEY configured.");
    manualSteps.push("Redeploy Production after env changes, then re-run: npm run health:supabase:production");
  }

  return { present, manualSteps };
}

export function checkEnvGitignore(): boolean {
  try {
    const gitignore = readFileSync(resolve(process.cwd(), ".gitignore"), "utf8");
    return /\.env\*|\.env\.local/.test(gitignore);
  } catch {
    return false;
  }
}

export async function runProductionSupabaseVerification(options?: {
  skipBuild?: boolean;
}): Promise<ProductionVerificationReport> {
  loadEnvLocal();

  const manualSteps: string[] = [];
  const adminCheck = checkAdminApiKeyConfigured();
  manualSteps.push(...adminCheck.manualSteps);

  let localSupabaseHost: string | null = null;
  const configSummary = getSupabaseConfigSummary();
  if (configSummary.configured) {
    localSupabaseHost = configSummary.urlHost;
  }

  const baseUrl = PRODUCTION_URL.replace(/\/$/, "");

  if (!adminCheck.present) {
    let productionDeployment: VerificationStatus = "NOT TESTABLE";
    try {
      const publicHealth = await fetchWithRetry(`${baseUrl}/api/data/health`, { method: "GET" });
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
      productionInsert: "NOT TESTABLE",
      productionSelect: "NOT TESTABLE",
      productionUpdate: "NOT TESTABLE",
      productionDelete: "NOT TESTABLE",
      cleanup: "NOT TESTABLE",
      manualActionRequired: true,
      manualSteps: [
        ...manualSteps,
        "`.env*` is gitignored — secrets must not be committed.",
        "ADMIN_API_KEY is server-only (lib/security/adminAuth.ts); not exposed via NEXT_PUBLIC_*.",
        "Unauthorized POST /api/data/health returns 401 once deployed.",
        "Unauthorized GET /api/data/match-records returns 401 (verified on production).",
      ],
      localSupabaseHost,
      productionSupabaseHost: null,
      sameSupabaseProject: null,
      deploymentCommit: "NOT TESTABLE",
      healthCheckId: null,
      probeResult: null,
    };
  }

  if (!options?.skipBuild) {
    execSync("npm test", { stdio: "inherit", cwd: process.cwd(), maxBuffer: 32 * 1024 * 1024 });
    execSync("npm run build", { stdio: "inherit", cwd: process.cwd(), maxBuffer: 32 * 1024 * 1024 });
  }

  const adminKey = process.env.ADMIN_API_KEY!.trim();
  const healthCheckId = `production-health-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  let productionDeployment: VerificationStatus = "FAIL";
  let deploymentCommit: VerificationStatus = "NOT TESTABLE";
  let authenticatedHealthRoute: VerificationStatus = "NOT TESTABLE";
  let productionInsert: VerificationStatus = "NOT TESTABLE";
  let productionSelect: VerificationStatus = "NOT TESTABLE";
  let productionUpdate: VerificationStatus = "NOT TESTABLE";
  let productionDelete: VerificationStatus = "NOT TESTABLE";
  let cleanup: VerificationStatus = "NOT TESTABLE";
  let productionSupabaseHost: string | null = null;
  let sameSupabaseProject: boolean | null = null;
  let probeResult: ProductionCrudProbeResult | null = null;

  manualSteps.push(
    "Vercel Production env vars cannot be read from this environment — verify manually in Vercel Dashboard."
  );
  manualSteps.push(
    "Required on Production: SUPABASE_URL (server), SUPABASE_SERVICE_ROLE_KEY, ADMIN_API_KEY (matching local)."
  );
  manualSteps.push(
    "Note: this project uses SUPABASE_URL server-side, not NEXT_PUBLIC_SUPABASE_* browser clients."
  );

  const environmentVariables: VerificationStatus = "NOT TESTABLE";

  try {
    const publicHealth = await fetchWithRetry(`${baseUrl}/api/data/health`, { method: "GET" });
    productionDeployment = publicHealth.ok ? "PASS" : "FAIL";
    deploymentCommit = "NOT TESTABLE";

    const unauthorizedPost = await fetchWithRetry(`${baseUrl}/api/data/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "production-crud-probe", healthCheckId }),
    });
    if (unauthorizedPost.status !== 401 && unauthorizedPost.status !== 403) {
      manualSteps.push(`Expected POST /api/data/health without auth to return 401/403; got ${unauthorizedPost.status}.`);
    }

    const authGet = await fetchWithRetry(`${baseUrl}/api/data/health`, {
      method: "GET",
      headers: { "x-admin-key": adminKey },
    });
    const authGetBody = (await authGet.json()) as {
      ok?: boolean;
      supabase?: { config?: { urlHost?: string }; connected?: boolean };
    };
    productionSupabaseHost = authGetBody.supabase?.config?.urlHost ?? null;
    sameSupabaseProject =
      localSupabaseHost && productionSupabaseHost
        ? localSupabaseHost === productionSupabaseHost
        : null;

    authenticatedHealthRoute =
      authGet.ok && authGetBody.supabase?.connected ? "PASS" : "FAIL";

    const authPost = await fetchWithRetry(`${baseUrl}/api/data/health`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": adminKey,
      },
      body: JSON.stringify({ action: "production-crud-probe", healthCheckId }),
    });

    if (authPost.status === 404) {
      manualSteps.push(
        "POST /api/data/health not found — deploy latest commit containing production CRUD probe before re-running."
      );
      authenticatedHealthRoute = "FAIL";
    } else if (authPost.status === 401 || authPost.status === 403) {
      manualSteps.push("ADMIN_API_KEY mismatch between local .env.local and Vercel Production.");
      authenticatedHealthRoute = "FAIL";
    } else {
      const postBody = (await authPost.json()) as {
        ok?: boolean;
        probe?: ProductionCrudProbeResult;
      };
      probeResult = postBody.probe ?? null;

      const stepStatus = (step: ProductionCrudProbeResult["steps"][number]["step"]) =>
        probeResult?.steps.find((entry) => entry.step === step)?.status === "PASS"
          ? "PASS"
          : probeResult?.steps.some((entry) => entry.step === step)
            ? "FAIL"
            : "NOT TESTABLE";

      productionInsert = stepStatus("insert");
      productionSelect = stepStatus("select");
      productionUpdate = stepStatus("update");
      productionDelete = stepStatus("delete");
      cleanup = stepStatus("cleanup");
    }
  } catch (error) {
    manualSteps.push(error instanceof Error ? error.message : String(error));
    productionDeployment = "FAIL";
  }

  const allPass =
    productionDeployment === "PASS" &&
    authenticatedHealthRoute === "PASS" &&
    productionInsert === "PASS" &&
    productionSelect === "PASS" &&
    productionUpdate === "PASS" &&
    productionDelete === "PASS" &&
    cleanup === "PASS" &&
    sameSupabaseProject !== false;

  let overallStatus: VerificationStatus;
  if (!adminCheck.present) {
    overallStatus = "MANUAL ACTION REQUIRED";
  } else if (allPass) {
    overallStatus = "PASS";
  } else if (
    authenticatedHealthRoute === "NOT TESTABLE" ||
    productionInsert === "NOT TESTABLE"
  ) {
    overallStatus = "MANUAL ACTION REQUIRED";
  } else {
    overallStatus = "FAIL";
  }

  return {
    version: "v1",
    completedAt: new Date().toISOString(),
    overallStatus,
    productionDeployment,
    environmentVariables,
    authenticatedHealthRoute,
    productionInsert,
    productionSelect,
    productionUpdate,
    productionDelete,
    cleanup,
    manualActionRequired: overallStatus === "MANUAL ACTION REQUIRED",
    manualSteps,
    localSupabaseHost,
    productionSupabaseHost,
    sameSupabaseProject,
    deploymentCommit,
    healthCheckId,
    probeResult,
  };
}

export function renderProductionVerificationMarkdown(
  report: ProductionVerificationReport
): string {
  return [
    "# Production Supabase Verification v1",
    "",
    `Generated: ${report.completedAt}`,
    "",
    `## Overall: ${report.overallStatus}`,
    "",
    "| Check | Status |",
    "|-------|--------|",
    `| Production Deployment | ${report.productionDeployment} |`,
    `| Environment Variables | ${report.environmentVariables} |`,
    `| Authenticated Health Route | ${report.authenticatedHealthRoute} |`,
    `| Production Insert | ${report.productionInsert} |`,
    `| Production Select | ${report.productionSelect} |`,
    `| Production Update | ${report.productionUpdate} |`,
    `| Production Delete | ${report.productionDelete} |`,
    `| Cleanup | ${report.cleanup} |`,
    "",
    `Local Supabase host: ${report.localSupabaseHost ?? "unknown"}`,
    `Production Supabase host: ${report.productionSupabaseHost ?? "unknown"}`,
    `Same project: ${report.sameSupabaseProject === null ? "unknown" : report.sameSupabaseProject ? "yes" : "NO"}`,
    `healthCheckId: ${report.healthCheckId ?? "n/a"}`,
    "",
    report.manualActionRequired ? "## Manual Steps" : "",
    ...report.manualSteps.map((step) => `- ${step}`),
  ]
    .filter(Boolean)
    .join("\n");
}

export function writeProductionVerificationArtifacts(report: ProductionVerificationReport): void {
  writeFileSync(
    resolve(process.cwd(), "PRODUCTION_SUPABASE_VERIFICATION.md"),
    renderProductionVerificationMarkdown(report),
    "utf8"
  );
}

export { TARGET_COMMIT };
