import { readFileSync } from "fs";
import { resolve } from "path";
import {
  ApiFootballClient,
  getApiFootballCurrentSeason,
} from "@/lib/providers/apiFootball/apiFootballClient";
import {
  buildApiFootballCacheKey,
  getApiFootballCacheStore,
  resetApiFootballCacheStoreForTests,
} from "@/lib/providers/apiFootball/apiFootballCache";
import type { ApiFootballProbeOutcome } from "@/lib/providers/apiFootball/apiFootballEnvelopeValidation";
import { API_FOOTBALL_HEALTH_PROBE_TEAM_ID } from "@/lib/providers/apiFootball/apiFootballEnvelopeValidation";
import {
  runApiFootballIntegrationProbes,
  type ApiFootballQuotaHeaderSnapshot,
} from "@/lib/providers/apiFootball/apiFootballHealthProbes";
import {
  canMakeApiFootballRequest,
  getApiFootballQuotaSnapshot,
  resetApiFootballQuotaForTests,
  setApiFootballQuotaForTests,
} from "@/lib/providers/apiFootball/apiFootballQuota";
import { buildApiFootballMatchBundle } from "@/lib/providers/apiFootball/apiFootballService";

export type ApiFootballHealthStatus =
  | "PASS"
  | "FAIL"
  | "NOT TESTABLE"
  | "WARNING"
  | "NO_DATA";

export interface ApiFootballHealthSection {
  name: string;
  status: ApiFootballHealthStatus;
  evidence?: string;
  message?: string;
}

export type { ApiFootballQuotaHeaderSnapshot } from "@/lib/providers/apiFootball/apiFootballHealthProbes";

export interface ApiFootballHealthReport {
  version: "v1";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  overallStatus:
    | "PASS"
    | "PARTIAL PASS"
    | "FAIL"
    | "MANUAL ACTION REQUIRED"
    | "NOT TESTABLE";
  environmentVariableName: "API_FOOTBALL_KEY";
  optionalEnvironmentVariableName: "API_FOOTBALL_BASE_URL";
  baseUrl: string;
  keyConfigured: boolean;
  quotaHeaders: ApiFootballQuotaHeaderSnapshot;
  localQuotaSnapshot: ReturnType<typeof getApiFootballQuotaSnapshot>;
  sections: ApiFootballHealthSection[];
  manualActionRequired: boolean;
  manualSteps: string[];
  rootCauses: string[];
}

const DEFAULT_BASE_URL = "https://v3.football.api-sports.io";

function section(
  name: string,
  check: string,
  status: ApiFootballHealthStatus,
  evidence?: string
): ApiFootballHealthSection {
  return { name, status, evidence, message: check };
}

function resolveBaseUrl(): string {
  return process.env.API_FOOTBALL_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

function mapProbeOutcome(outcome: ApiFootballProbeOutcome): ApiFootballHealthStatus {
  if (outcome === "NO_DATA") {
    return "NO_DATA";
  }
  return outcome;
}

export function probeLocalQuotaBlock(): {
  blocked: boolean;
  reason: string | null;
} {
  resetApiFootballQuotaForTests();
  setApiFootballQuotaForTests({ dailyCount: 100, minuteCount: 10 });
  const blocked = !canMakeApiFootballRequest();
  const reason = blocked ? "daily_limit" : null;
  resetApiFootballQuotaForTests();
  return { blocked, reason };
}

export function probeSecretExposure(): {
  clientSafe: boolean;
  evidence: string;
} {
  const issues: string[] = [];

  if (process.env.NEXT_PUBLIC_API_FOOTBALL_KEY?.trim()) {
    issues.push("NEXT_PUBLIC_API_FOOTBALL_KEY is set");
  }

  try {
    const envExample = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
    if (/NEXT_PUBLIC_API_FOOTBALL/.test(envExample)) {
      issues.push(".env.example exposes NEXT_PUBLIC_API_FOOTBALL_*");
    }
  } catch {
    issues.push(".env.example not readable");
  }

  return {
    clientSafe: issues.length === 0,
    evidence:
      issues.length === 0
        ? "API_FOOTBALL_KEY is server-only; no NEXT_PUBLIC_API_FOOTBALL_* found"
        : issues.join("; "),
  };
}

export async function runApiFootballHealthReport(): Promise<ApiFootballHealthReport> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const sections: ApiFootballHealthSection[] = [];
  const rootCauses: string[] = [];
  const manualSteps: string[] = [];
  const baseUrl = resolveBaseUrl();
  const keyConfigured = Boolean(process.env.API_FOOTBALL_KEY?.trim());

  if (!keyConfigured) {
    manualSteps.push("Add API_FOOTBALL_KEY to `.env.local` (see `.env.example`).");
    manualSteps.push(
      "Add the same value to Vercel → Project → Settings → Environment Variables → Production."
    );
    sections.push(section("Environment", "API_FOOTBALL_KEY configured", "NOT TESTABLE"));
    sections.push(section("Raw endpoint", "GET /timezone", "NOT TESTABLE"));
    sections.push(section("Provider", "Team lookup", "NOT TESTABLE"));
    sections.push(section("Provider", "Fixture lookup", "NOT TESTABLE"));
    sections.push(section("Provider", "Recent form", "NOT TESTABLE"));
    sections.push(section("Cache", "Write and read", "NOT TESTABLE"));

    return finalizeReport({
      startedAt,
      startedMs,
      sections,
      rootCauses: ["API_FOOTBALL_KEY is not configured locally"],
      manualSteps,
      keyConfigured,
      baseUrl,
      quotaHeaders: { requestsLimit: null, requestsRemaining: null },
    });
  }

  sections.push(
    section("Environment", "API_FOOTBALL_KEY configured", "PASS", "present (value redacted)")
  );

  const secretExposure = probeSecretExposure();
  sections.push(
    section(
      "Security",
      "Secret exposure",
      secretExposure.clientSafe ? "PASS" : "FAIL",
      secretExposure.evidence
    )
  );
  if (!secretExposure.clientSafe) {
    rootCauses.push(secretExposure.evidence);
  }

  const integration = await runApiFootballIntegrationProbes();
  sections.push(
    section(
      "Raw endpoint",
      "GET /timezone",
      mapProbeOutcome(integration.rawEndpoint.outcome),
      integration.rawEndpoint.gateReason
    )
  );
  sections.push(
    section(
      "Provider",
      "Team lookup",
      mapProbeOutcome(integration.teamLookup.outcome),
      integration.teamLookup.gateReason
    )
  );
  sections.push(
    section(
      "Provider",
      "Fixture lookup",
      mapProbeOutcome(integration.fixtureLookup.outcome),
      integration.fixtureLookup.gateReason
    )
  );

  if (integration.rawEndpoint.outcome === "FAIL") {
    rootCauses.push(integration.rawEndpoint.schemaValidationReason);
  }
  if (integration.teamLookup.outcome === "FAIL") {
    rootCauses.push(integration.teamLookup.gateReason);
  }
  if (integration.fixtureLookup.outcome === "FAIL") {
    rootCauses.push(integration.fixtureLookup.gateReason);
  }

  if (integration.quotaHeaders.requestsLimit || integration.quotaHeaders.requestsRemaining) {
    sections.push(
      section(
        "Quota",
        "Provider rate-limit headers",
        "PASS",
        `limit=${integration.quotaHeaders.requestsLimit ?? "-"} remaining=${integration.quotaHeaders.requestsRemaining ?? "-"}`
      )
    );
  } else {
    sections.push(
      section(
        "Quota",
        "Provider rate-limit headers",
        "WARNING",
        "headers not present on /timezone response"
      )
    );
  }

  const { probeInvalidApiFootballKey } = await import(
    "@/lib/providers/apiFootball/apiFootballHealthProbes"
  );
  const invalidKey = await probeInvalidApiFootballKey();
  sections.push(
    section(
      "Security",
      "Invalid key handling",
      invalidKey.handledSafely ? "PASS" : "FAIL",
      invalidKey.message
    )
  );

  const quotaBlock = probeLocalQuotaBlock();
  sections.push(
    section(
      "Quota",
      "Local quota block",
      quotaBlock.blocked ? "PASS" : "FAIL",
      quotaBlock.reason ?? "quota gate did not block at limit"
    )
  );

  if (integration.teamId) {
    try {
      const client = new ApiFootballClient();
      const form = await client.getTeamForm(integration.teamId, 5);
      sections.push(
        section(
          "Provider",
          "Recent form",
          form.fixtures.length > 0 ? "PASS" : "NO_DATA",
          `fixtures=${form.fixtures.length} path=${form.meta?.requestPath ?? "-"}`
        )
      );
    } catch (error) {
      sections.push(
        section(
          "Provider",
          "Recent form",
          "FAIL",
          error instanceof Error ? error.message : String(error)
        )
      );
      rootCauses.push("Recent form lookup failed");
    }
  } else {
    sections.push(section("Provider", "Recent form", "NOT TESTABLE", "team id unavailable"));
  }

  try {
    resetApiFootballCacheStoreForTests();
    const cacheStore = getApiFootballCacheStore();
    const cacheKey = buildApiFootballCacheKey("teamForm", {
      teamId: integration.teamId ?? API_FOOTBALL_HEALTH_PROBE_TEAM_ID,
      last: 3,
    });
    const payload = { probe: true, teamId: integration.teamId ?? API_FOOTBALL_HEALTH_PROBE_TEAM_ID };
    cacheStore.set(cacheKey, "teamForm", payload);
    const readBack = cacheStore.getSync<{ probe: boolean; teamId: number }>(cacheKey);
    sections.push(
      section(
        "Cache",
        "Write and read",
        readBack?.probe === true ? "PASS" : "FAIL",
        readBack ? `teamId=${readBack.teamId}` : "cache miss"
      )
    );
    resetApiFootballCacheStoreForTests();
  } catch (error) {
    sections.push(
      section(
        "Cache",
        "Write and read",
        "FAIL",
        error instanceof Error ? error.message : String(error)
      )
    );
    rootCauses.push("Cache probe failed");
  }

  try {
    const unconfigured = new ApiFootballClient({ apiKey: "" });
    const missing = await buildApiFootballMatchBundle(
      { homeTeam: "Alpha", awayTeam: "Beta", matchDate: "2099-01-01" },
      unconfigured
    );
    sections.push(
      section(
        "Provider",
        "Missing-data behavior",
        missing === null ? "PASS" : "FAIL",
        missing === null ? "unconfigured client returns null bundle" : "expected null bundle"
      )
    );
  } catch (error) {
    sections.push(
      section(
        "Provider",
        "Missing-data behavior",
        "PASS",
        error instanceof Error ? error.message : String(error)
      )
    );
  }

  return finalizeReport({
    startedAt,
    startedMs,
    sections,
    rootCauses,
    manualSteps,
    keyConfigured,
    baseUrl,
    quotaHeaders: integration.quotaHeaders,
  });
}

function finalizeReport(input: {
  startedAt: string;
  startedMs: number;
  sections: ApiFootballHealthSection[];
  rootCauses: string[];
  manualSteps: string[];
  keyConfigured: boolean;
  baseUrl: string;
  quotaHeaders: ApiFootballQuotaHeaderSnapshot;
}): ApiFootballHealthReport {
  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - input.startedMs;
  const hasFail = input.sections.some((item) => item.status === "FAIL");
  const hasWarning = input.sections.some((item) => item.status === "WARNING");
  const allNotTestable = input.sections.every((item) => item.status === "NOT TESTABLE");

  let overallStatus: ApiFootballHealthReport["overallStatus"];
  if (!input.keyConfigured || allNotTestable) {
    overallStatus = "MANUAL ACTION REQUIRED";
  } else if (hasFail) {
    overallStatus = "FAIL";
  } else if (hasWarning) {
    overallStatus = "PARTIAL PASS";
  } else {
    overallStatus = "PASS";
  }

  return {
    version: "v1",
    startedAt: input.startedAt,
    completedAt,
    durationMs,
    overallStatus,
    environmentVariableName: "API_FOOTBALL_KEY",
    optionalEnvironmentVariableName: "API_FOOTBALL_BASE_URL",
    baseUrl: input.baseUrl,
    keyConfigured: input.keyConfigured,
    quotaHeaders: input.quotaHeaders,
    localQuotaSnapshot: getApiFootballQuotaSnapshot(),
    sections: input.sections,
    manualActionRequired: overallStatus === "MANUAL ACTION REQUIRED",
    manualSteps: input.manualSteps,
    rootCauses: input.rootCauses,
  };
}

export function renderApiFootballHealthMarkdown(report: ApiFootballHealthReport): string {
  const lines = [
    "# API-Football Health Report",
    "",
    `**Completed:** ${report.completedAt}`,
    `**Duration:** ${report.durationMs}ms`,
    `**Overall:** ${report.overallStatus}`,
    "",
    "## Configuration",
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| Environment variable | \`${report.environmentVariableName}\` |`,
    `| Optional base URL variable | \`${report.optionalEnvironmentVariableName}\` |`,
    `| Base URL | ${report.baseUrl} |`,
    `| Key configured locally | ${report.keyConfigured ? "yes" : "no"} |`,
    `| Provider quota limit header | ${report.quotaHeaders.requestsLimit ?? "-"} |`,
    `| Provider quota remaining header | ${report.quotaHeaders.requestsRemaining ?? "-"} |`,
    `| Local daily quota | ${report.localQuotaSnapshot.dailyCount}/${report.localQuotaSnapshot.dailyLimit} |`,
    `| Local minute quota | ${report.localQuotaSnapshot.minuteCount}/${report.localQuotaSnapshot.minuteLimit} |`,
    "",
    "## Checks",
    "",
    "| Section | Check | Status | Evidence |",
    "|---------|-------|--------|----------|",
  ];

  for (const item of report.sections) {
    lines.push(
      `| ${item.name} | ${item.message ?? item.name} | ${item.status} | ${item.evidence ?? item.message ?? "-"} |`
    );
  }

  if (report.rootCauses.length > 0) {
    lines.push("", "## Root Causes", "");
    for (const cause of report.rootCauses) {
      lines.push(`- ${cause}`);
    }
  }

  if (report.manualSteps.length > 0) {
    lines.push("", "## Manual Steps", "");
    for (const step of report.manualSteps) {
      lines.push(`- ${step}`);
    }
  }

  lines.push(
    "",
    "## Production",
    "",
    "- Set `API_FOOTBALL_KEY` on Vercel Production (server-only, not `NEXT_PUBLIC_*`).",
    "- Run `npm run health:api-football:production` after deploy.",
    ""
  );

  return lines.join("\n");
}

export { getApiFootballCurrentSeason };
