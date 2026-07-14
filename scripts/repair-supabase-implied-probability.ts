/**
 * PR2.2: Repair polluted impliedProbability (> 1) in existing match_records.
 *
 * Dry-run (default): npm run repair:supabase-odds
 * Apply:             npm run repair:supabase-odds -- --apply
 *
 * Reads records from deployed Vercel API; writes via Supabase REST PATCH on --apply only.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  convertRawOdds,
  convertRawOddsToImpliedProbability,
} from "@/lib/analysis/featureScore/oddsConversion";
import {
  normalizeHistoricalMatchRecord,
  type HistoricalMatchRecord,
} from "@/lib/database/matchSchema";
import {
  detectSupabaseKeyFormat,
  getSupabaseEnv,
  hasSupabaseEnv,
} from "@/lib/supabase/env";

const DEFAULT_API_URL =
  "https://football-ai-ten.vercel.app/api/data/match-records";

const ENV_LOCAL_PATH = resolve(process.cwd(), ".env.local");
const BACKUP_DIR = resolve(
  process.cwd(),
  "scripts/backups/implied-probability-pr22"
);

type ApplyStep =
  | "backup.start"
  | "backup.success"
  | "backup.failed"
  | "update.start"
  | "update.success"
  | "update.failed"
  | "apply.summary";

interface FieldChange {
  fieldPath: string;
  oldValue: number;
  newValue: number;
  rawOdds: number;
  decimalOdds: number | null;
}

interface RecordRepairPlan {
  recordId: string;
  homeTeam: string;
  awayTeam: string;
  changes: FieldChange[];
  repairedRecord: HistoricalMatchRecord;
}

interface ApiListResponse {
  ok: boolean;
  data: HistoricalMatchRecord[] | null;
  message?: string | null;
}

interface PollutionHit {
  recordId: string;
  fieldPath: string;
  value: number;
}

interface FetchFailureDetails {
  name?: string;
  message?: string;
  code?: string | number;
  errno?: number;
  syscall?: string;
  hostname?: string;
}

interface PatchResult {
  recordId: string;
  ok: boolean;
  httpStatus: number | null;
  responseBody: unknown;
  fetchCause?: FetchFailureDetails;
}

function parseEnvValue(raw: string): string {
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value.replace(/\r$/, "");
}

function loadEnvLocal(): void {
  if (!existsSync(ENV_LOCAL_PATH)) {
    return;
  }
  const contents = readFileSync(ENV_LOCAL_PATH, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1);
    process.env[key] = parseEnvValue(value);
  }
}

function safeUrlHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function extractFetchFailureDetails(
  error: unknown,
  fallbackHostname?: string
): FetchFailureDetails {
  const details: FetchFailureDetails = {};

  if (error instanceof Error) {
    details.name = error.name;
    details.message = error.message;

    let current: unknown = error.cause ?? error;
    while (current instanceof Error) {
      const systemError = current as NodeJS.ErrnoException & { hostname?: string };
      if (systemError.code !== undefined) {
        details.code = systemError.code;
      }
      if (systemError.errno !== undefined) {
        details.errno = systemError.errno;
      }
      if (systemError.syscall !== undefined) {
        details.syscall = systemError.syscall;
      }
      if (systemError.hostname !== undefined) {
        details.hostname = systemError.hostname;
      }
      current = systemError.cause;
    }
  } else {
    details.message = String(error);
  }

  if (!details.hostname && fallbackHostname) {
    details.hostname = fallbackHostname;
  }

  return details;
}

function logStep(step: ApplyStep, payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ step, ...payload }, null, 2));
}

function buildSupabaseHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
    Prefer: "return=representation",
  };

  const keyFormat = detectSupabaseKeyFormat(apiKey);
  if (keyFormat === "legacy_jwt" || keyFormat === "unknown") {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function parseArgs(argv: string[]): { apply: boolean; apiUrl: string } {
  const apply = argv.includes("--apply");
  const urlArg = argv.find((arg) => arg.startsWith("--api="));
  const positionalUrl = argv.find(
    (arg) => arg.startsWith("http://") || arg.startsWith("https://")
  );
  return {
    apply,
    apiUrl: urlArg?.slice("--api=".length) || positionalUrl || DEFAULT_API_URL,
  };
}

async function fetchMatchRecords(apiUrl: string): Promise<HistoricalMatchRecord[]> {
  const response = await fetch(apiUrl, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const bodyText = await response.text();
  let payload: ApiListResponse;
  try {
    payload = JSON.parse(bodyText) as ApiListResponse;
  } catch {
    console.error(
      JSON.stringify(
        {
          step: "read.failed",
          apiUrl,
          httpStatus: response.status,
          responseBody: bodyText.slice(0, 2000),
          parseError: "Response is not valid JSON.",
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  if (!response.ok || !payload.ok || !Array.isArray(payload.data)) {
    console.error(
      JSON.stringify(
        {
          step: "read.failed",
          apiUrl,
          httpStatus: response.status,
          responseBody: payload,
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  return payload.data.map((record) => normalizeHistoricalMatchRecord(record));
}

function resolveRawOdds(source: { odds?: number; decimalOdds?: number }): number | null {
  const raw = source.odds ?? source.decimalOdds;
  if (raw === undefined || !Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  return raw;
}

function maybeFixImpliedProbability(
  rawOdds: number,
  current: number | undefined,
  fieldPath: string,
  changes: FieldChange[]
): number | undefined {
  if (current === undefined || !(current > 1)) {
    return current;
  }

  const converted = convertRawOdds(rawOdds);
  const newValue = convertRawOddsToImpliedProbability(rawOdds);
  if (newValue === null) {
    return current;
  }

  changes.push({
    fieldPath,
    oldValue: current,
    newValue,
    rawOdds,
    decimalOdds: converted?.decimalOdds ?? null,
  });

  return newValue;
}

function buildRepairPlan(record: HistoricalMatchRecord): RecordRepairPlan | null {
  const changes: FieldChange[] = [];
  const repairedRecord = structuredClone(record);

  repairedRecord.marketSelections = repairedRecord.marketSelections.map(
    (selection, index) => {
      const rawOdds = resolveRawOdds(selection);
      if (rawOdds === null) {
        return selection;
      }
      const impliedProbability = maybeFixImpliedProbability(
        rawOdds,
        selection.impliedProbability,
        `marketSelections[${index}].impliedProbability`,
        changes
      );
      return {
        ...selection,
        impliedProbability,
      };
    }
  );

  if (repairedRecord.analysisSnapshot?.features) {
    repairedRecord.analysisSnapshot.features =
      repairedRecord.analysisSnapshot.features.map((feature, index) => {
        const rawOdds = resolveRawOdds(feature);
        if (rawOdds === null) {
          return feature;
        }
        const impliedProbability = maybeFixImpliedProbability(
          rawOdds,
          feature.impliedProbability,
          `analysisSnapshot.features[${index}].impliedProbability`,
          changes
        );
        return {
          ...feature,
          impliedProbability: impliedProbability ?? feature.impliedProbability,
        };
      });
  }

  if (changes.length === 0) {
    return null;
  }

  return {
    recordId: record.id,
    homeTeam: record.homeTeam,
    awayTeam: record.awayTeam,
    changes,
    repairedRecord: normalizeHistoricalMatchRecord({
      ...repairedRecord,
      id: record.id,
      createdAt: record.createdAt,
      status: record.status,
      result: record.result,
      verificationResult: record.verificationResult,
    }),
  };
}

function walkPollution(
  value: unknown,
  path: string,
  hits: PollutionHit[],
  recordId: string
): void {
  if (value === null || value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walkPollution(item, `${path}[${index}]`, hits, recordId);
    });
    return;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (
        key === "impliedProbability" &&
        typeof nested === "number" &&
        nested > 1
      ) {
        hits.push({ recordId, fieldPath: nextPath, value: nested });
      } else {
        walkPollution(nested, nextPath, hits, recordId);
      }
    }
  }
}

function scanPollution(records: HistoricalMatchRecord[]): {
  pollutedRecordCount: number;
  pollutedFieldCount: number;
  hits: PollutionHit[];
} {
  const hits: PollutionHit[] = [];
  for (const record of records) {
    walkPollution(record.marketSelections, "marketSelections", hits, record.id);
    walkPollution(
      record.analysisSnapshot?.features,
      "analysisSnapshot.features",
      hits,
      record.id
    );
  }
  const uniqueHits = hits.filter(
    (hit, index, array) =>
      array.findIndex(
        (item) =>
          item.recordId === hit.recordId && item.fieldPath === hit.fieldPath
      ) === index
  );
  const affected = new Set(uniqueHits.map((hit) => hit.recordId));
  return {
    pollutedRecordCount: affected.size,
    pollutedFieldCount: uniqueHits.length,
    hits: uniqueHits,
  };
}

function backupRecords(
  records: HistoricalMatchRecord[],
  runId: string
): string {
  const dir = join(BACKUP_DIR, runId);
  mkdirSync(dir, { recursive: true });
  for (const record of records) {
    writeFileSync(
      join(dir, `${record.id}.json`),
      JSON.stringify(record, null, 2),
      "utf8"
    );
  }
  writeFileSync(
    join(dir, "_manifest.json"),
    JSON.stringify(
      {
        backedUpAt: new Date().toISOString(),
        recordIds: records.map((record) => record.id),
      },
      null,
      2
    ),
    "utf8"
  );
  return dir;
}

function toIsoTimestamp(value: string): string {
  return value.includes("T") ? value : `${value}T00:00:00.000Z`;
}

async function patchMatchRecord(
  supabaseUrl: string,
  apiKey: string,
  record: HistoricalMatchRecord
): Promise<PatchResult> {
  const hostname = safeUrlHost(supabaseUrl) ?? undefined;
  const recordId = record.id;
  const patchUrl = `${supabaseUrl}/rest/v1/match_records?id=eq.${encodeURIComponent(recordId)}`;
  const patchBody = {
    market_selections: record.marketSelections,
    analysis_snapshot: record.analysisSnapshot,
    updated_at: toIsoTimestamp(record.updatedAt),
  };

  try {
    const response = await fetch(patchUrl, {
      method: "PATCH",
      headers: buildSupabaseHeaders(apiKey),
      body: JSON.stringify(patchBody),
    });

    const bodyText = await response.text();
    let responseBody: unknown = bodyText;
    try {
      responseBody = JSON.parse(bodyText);
    } catch {
      // keep raw text
    }

    if (!response.ok) {
      return {
        recordId,
        ok: false,
        httpStatus: response.status,
        responseBody,
      };
    }

    return {
      recordId,
      ok: true,
      httpStatus: response.status,
      responseBody,
    };
  } catch (error) {
    return {
      recordId,
      ok: false,
      httpStatus: null,
      responseBody: null,
      fetchCause: extractFetchFailureDetails(error, hostname),
    };
  }
}

async function applyRepairs(
  plans: RecordRepairPlan[],
  records: HistoricalMatchRecord[]
): Promise<{ success: number; failed: number }> {
  loadEnvLocal();

  if (!hasSupabaseEnv()) {
    logStep("backup.failed", {
      reason: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
    });
    process.exit(1);
  }

  const { url, serviceRoleKey } = getSupabaseEnv();
  logStep("backup.start", {
    recordCount: plans.length,
    supabaseUrlHost: safeUrlHost(url),
  });

  let backupPath: string;
  try {
    const runId = new Date().toISOString().replace(/[:.]/g, "-");
    backupPath = backupRecords(
      plans.map((plan) => records.find((record) => record.id === plan.recordId)!),
      runId
    );
    logStep("backup.success", { backupPath, recordCount: plans.length });
  } catch (error) {
    logStep("backup.failed", {
      reason: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }

  let success = 0;
  let failed = 0;

  for (const plan of plans) {
    const original = records.find((record) => record.id === plan.recordId)!;
    const toWrite = normalizeHistoricalMatchRecord({
      ...plan.repairedRecord,
      id: original.id,
      createdAt: original.createdAt,
      status: original.status,
      result: original.result,
      verificationResult: original.verificationResult,
      candidates: original.candidates,
      updatedAt: new Date().toISOString(),
    });

    logStep("update.start", {
      recordId: plan.recordId,
      changeCount: plan.changes.length,
      method: "PATCH",
    });

    const result = await patchMatchRecord(url, serviceRoleKey, toWrite);

    if (result.ok) {
      success += 1;
      logStep("update.success", {
        recordId: result.recordId,
        httpStatus: result.httpStatus,
        responseBody: result.responseBody,
      });
    } else {
      failed += 1;
      logStep("update.failed", {
        recordId: result.recordId,
        httpStatus: result.httpStatus,
        responseBody: result.responseBody,
        fetchCause: result.fetchCause ?? null,
      });
    }
  }

  logStep("apply.summary", { success, failed, backupPath });
  return { success, failed };
}

async function main(): Promise<void> {
  const { apply, apiUrl } = parseArgs(process.argv.slice(2));

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        apiUrl,
      },
      null,
      2
    )
  );

  const records = await fetchMatchRecords(apiUrl);
  const before = scanPollution(records);

  const plans = records
    .map((record) => buildRepairPlan(record))
    .filter((plan): plan is RecordRepairPlan => plan !== null);

  console.log(
    JSON.stringify(
      {
        totalMatchRecords: records.length,
        beforePollution: {
          pollutedRecordCount: before.pollutedRecordCount,
          pollutedFieldCount: before.pollutedFieldCount,
          affectedRecordIds: [...new Set(before.hits.map((hit) => hit.recordId))],
        },
        recordsToRepair: plans.map((plan) => ({
          recordId: plan.recordId,
          homeTeam: plan.homeTeam,
          awayTeam: plan.awayTeam,
          changeCount: plan.changes.length,
          changes: plan.changes,
        })),
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("Dry-run complete. Re-run with --apply to write changes.");
    return;
  }

  const { success, failed } = await applyRepairs(plans, records);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        step: "apply.failed",
        message: error instanceof Error ? error.message : String(error),
        fetchCause: extractFetchFailureDetails(error),
      },
      null,
      2
    )
  );
  process.exit(1);
});

export {};
