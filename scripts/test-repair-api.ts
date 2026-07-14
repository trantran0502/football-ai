/**
 * PR2.3: Test admin repair API (401, dryRun, apply).
 *
 * Run: npm run test:repair-api
 * Requires ADMIN_REPAIR_KEY in .env.local and a running server (or deployed URL).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_LOCAL_PATH = resolve(process.cwd(), ".env.local");
const DEFAULT_API_BASE = "http://localhost:3000";

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
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

function parseArgs(argv: string[]): { apiBase: string; skipApply: boolean } {
  const apiArg = argv.find((arg) => arg.startsWith("--api="));
  const skipApply = argv.includes("--skip-apply");
  return {
    apiBase: apiArg?.slice("--api=".length) || DEFAULT_API_BASE,
    skipApply,
  };
}

async function callRepairApi(
  apiBase: string,
  adminKey: string | undefined,
  body: { dryRun: boolean }
): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (adminKey !== undefined) {
    headers["x-admin-key"] = adminKey;
  }

  const response = await fetch(
    `${apiBase.replace(/\/$/, "")}/api/admin/repair-implied-probability`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }
  );

  const json = (await response.json()) as Record<string, unknown>;
  return { status: response.status, json };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function testUnauthorized(apiBase: string): Promise<TestResult> {
  const { status, json } = await callRepairApi(apiBase, "invalid-admin-key", {
    dryRun: true,
  });

  assert(status === 401, `Expected 401, got ${status}`);
  assert(json.ok === false, "Expected ok=false for unauthorized");

  return {
    name: "401 unauthorized",
    passed: true,
    detail: `status=${status}`,
  };
}

async function testDryRun(
  apiBase: string,
  adminKey: string
): Promise<TestResult> {
  const { status, json } = await callRepairApi(apiBase, adminKey, {
    dryRun: true,
  });

  assert(status === 200, `Expected 200, got ${status}`);
  assert(json.ok === true, "Expected ok=true");
  assert(json.dryRun === true, "Expected dryRun=true");
  assert(Array.isArray(json.recordsToRepair), "Expected recordsToRepair array");

  const records = json.recordsToRepair as Array<Record<string, unknown>>;
  for (const record of records) {
    assert(typeof record.recordId === "string", "recordId must be string");
    assert(typeof record.changeCount === "number", "changeCount must be number");
    assert(Array.isArray(record.changes), "changes must be array");
    for (const change of record.changes as Array<Record<string, unknown>>) {
      assert(typeof change.fieldPath === "string", "fieldPath required");
      assert(typeof change.oldValue === "number", "oldValue required");
      assert(typeof change.newValue === "number", "newValue required");
      assert(
        (change.oldValue as number) > 1,
        "oldValue should be polluted (> 1)"
      );
      assert(
        (change.newValue as number) <= 1,
        "newValue should be valid probability (<= 1)"
      );
    }
  }

  return {
    name: "dryRun",
    passed: true,
    detail: `recordsToRepair=${records.length}, pollutedRecordCount=${String(json.pollutedRecordCount)}`,
  };
}

async function testApply(
  apiBase: string,
  adminKey: string
): Promise<TestResult> {
  const { status, json } = await callRepairApi(apiBase, adminKey, {
    dryRun: false,
  });

  assert(status === 200, `Expected 200, got ${status}`);
  assert(json.ok === true, "Expected ok=true");
  assert(json.dryRun === false, "Expected dryRun=false");
  assert(typeof json.success === "number", "success must be number");
  assert(typeof json.failed === "number", "failed must be number");
  assert(Array.isArray(json.updatedRecordIds), "updatedRecordIds must be array");
  assert(
    typeof json.pollutedRecordCountBefore === "number",
    "pollutedRecordCountBefore required"
  );
  assert(
    typeof json.pollutedRecordCountAfter === "number",
    "pollutedRecordCountAfter required"
  );

  return {
    name: "apply",
    passed: true,
    detail: `success=${String(json.success)}, failed=${String(json.failed)}, before=${String(json.pollutedRecordCountBefore)}, after=${String(json.pollutedRecordCountAfter)}`,
  };
}

async function main(): Promise<void> {
  loadEnvLocal();
  const { apiBase, skipApply } = parseArgs(process.argv.slice(2));
  const adminKey = process.env.ADMIN_REPAIR_KEY?.trim();

  console.log(
    JSON.stringify(
      {
        apiBase,
        endpoint: `${apiBase}/api/admin/repair-implied-probability`,
        skipApply,
        hasAdminKey: Boolean(adminKey),
      },
      null,
      2
    )
  );

  if (!adminKey) {
    console.error("Missing ADMIN_REPAIR_KEY in .env.local");
    process.exit(1);
  }

  const results: TestResult[] = [];

  try {
    results.push(await testUnauthorized(apiBase));
  } catch (error) {
    results.push({
      name: "401 unauthorized",
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    results.push(await testDryRun(apiBase, adminKey));
  } catch (error) {
    results.push({
      name: "dryRun",
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  if (!skipApply) {
    try {
      results.push(await testApply(apiBase, adminKey));
    } catch (error) {
      results.push({
        name: "apply",
        passed: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify({ results }, null, 2));

  const failed = results.filter((result) => !result.passed);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

export {};
