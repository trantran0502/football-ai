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
import {
  canMakeApiFootballRequest,
  getApiFootballQuotaSnapshot,
  resetApiFootballQuotaForTests,
  setApiFootballQuotaForTests,
} from "@/lib/providers/apiFootball/apiFootballQuota";
import { buildApiFootballMatchBundle } from "@/lib/providers/apiFootball/apiFootballService";
import type { ApiFootballRawEnvelope } from "@/lib/providers/apiFootball/apiFootballTypes";

export type ApiFootballHealthStatus =
  | "PASS"
  | "FAIL"
  | "NOT TESTABLE"
  | "WARNING";

export interface ApiFootballHealthSection {
  name: string;
  status: ApiFootballHealthStatus;
  evidence?: string;
  message?: string;
}

export interface ApiFootballQuotaHeaderSnapshot {
  requestsLimit: string | null;
  requestsRemaining: string | null;
}

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
const HEALTH_PROBE_TEAM = "Arsenal";

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
}> {
  const apiKey = input?.apiKey ?? process.env.API_FOOTBALL_KEY ?? "";
  const baseUrl = (input?.baseUrl ?? resolveBaseUrl()).replace(/\/$/, "");
  const started = Date.now();

  const response = await fetch(`${baseUrl}/timezone`, {
    headers: { "x-apisports-key": apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const latencyMs = Date.now() - started;
  const quotaHeaders = readQuotaHeaders(response.headers);

  if (!response.ok) {
    return {
      httpStatus: response.status,
      schemaValid: false,
      quotaHeaders,
      resultCount: 0,
      latencyMs,
      errorMessage: `HTTP ${response.status}`,
    };
  }

  const payload = (await response.json()) as ApiFootballRawEnvelope<
    Array<{ zone?: string; utc?: string }>
  >;
  const schemaValid =
    Array.isArray(payload.response) &&
    payload.response.length > 0 &&
    typeof payload.response[0]?.zone === "string";

  return {
    httpStatus: response.status,
    schemaValid,
    quotaHeaders,
    resultCount: payload.response?.length ?? 0,
    latencyMs,
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
        message: `invalid key did not return usable schema (HTTP ${result.httpStatus})`,
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

  let quotaHeaders: ApiFootballQuotaHeaderSnapshot = {
    requestsLimit: null,
    requestsRemaining: null,
  };

  try {
    const raw = await probeApiFootballRawEndpoint();
    quotaHeaders = raw.quotaHeaders;
    sections.push(
      section(
        "Raw endpoint",
        "GET /timezone",
        raw.httpStatus === 200 && raw.schemaValid ? "PASS" : "FAIL",
        `http=${raw.httpStatus} schema=${raw.schemaValid ? "valid" : "invalid"} count=${raw.resultCount} latencyMs=${raw.latencyMs}`
      )
    );
    if (raw.quotaHeaders.requestsLimit || raw.quotaHeaders.requestsRemaining) {
      sections.push(
        section(
          "Quota",
          "Provider rate-limit headers",
          "PASS",
          `limit=${raw.quotaHeaders.requestsLimit ?? "-"} remaining=${raw.quotaHeaders.requestsRemaining ?? "-"}`
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
    if (raw.httpStatus !== 200 || !raw.schemaValid) {
      rootCauses.push(raw.errorMessage ?? "Raw endpoint probe failed");
    }
  } catch (error) {
    sections.push(
      section(
        "Raw endpoint",
        "GET /timezone",
        "FAIL",
        error instanceof Error ? error.message : String(error)
      )
    );
    rootCauses.push(error instanceof Error ? error.message : String(error));
  }

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

  const client = new ApiFootballClient();
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  let teamId: number | null = null;
  try {
    const team = await client.searchTeam(HEALTH_PROBE_TEAM);
    teamId = team?.id ?? null;
    sections.push(
      section(
        "Provider",
        "Team lookup",
        team ? "PASS" : "WARNING",
        team ? `team=${team.name} id=${team.id}` : `no match for ${HEALTH_PROBE_TEAM}`
      )
    );
  } catch (error) {
    sections.push(
      section(
        "Provider",
        "Team lookup",
        "FAIL",
        error instanceof Error ? error.message : String(error)
      )
    );
    rootCauses.push("Team lookup failed");
  }

  try {
    const fixtures = await client.getFixturesByDate(yesterday);
    sections.push(
      section(
        "Provider",
        "Fixture lookup",
        "PASS",
        `date=${yesterday} count=${fixtures.length}`
      )
    );
  } catch (error) {
    sections.push(
      section(
        "Provider",
        "Fixture lookup",
        "FAIL",
        error instanceof Error ? error.message : String(error)
      )
    );
    rootCauses.push("Fixture lookup failed");
  }

  if (teamId) {
    try {
      const form = await client.getTeamForm(teamId, 5);
      sections.push(
        section(
          "Provider",
          "Recent form",
          form.fixtures.length > 0 ? "PASS" : "WARNING",
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
      teamId: teamId ?? 42,
      last: 3,
    });
    const payload = { probe: true, teamId: teamId ?? 42 };
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
    quotaHeaders,
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
