import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  CONNECTION_PROBE_MAX_ATTEMPTS,
  CONNECTION_PROBE_RETRY_DELAYS_MS,
  runConnectionProbeWithRetry,
  runSupabaseHealthChecks,
  type ConnectionProbeQueryResult,
} from "@/lib/healthCheck/supabaseHealthCheck";
import { SUPABASE_TABLE_REGISTRY } from "@/lib/supabase/schemaRegistry";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const mockEnv = {
  url: "https://example.supabase.co",
  serviceRoleKey: "sb_secret_test",
  keyFormat: "sb_secret" as const,
};

function createProbeSequence(results: Array<ConnectionProbeQueryResult | Error>): {
  probe: () => Promise<ConnectionProbeQueryResult>;
  getCalls: () => number;
} {
  let calls = 0;
  return {
    getCalls: () => calls,
    probe: async () => {
      calls += 1;
      const next = results[calls - 1];
      if (next instanceof Error) {
        throw next;
      }
      if (!next) {
        throw new Error(`Unexpected probe call #${calls}`);
      }
      return next;
    },
  };
}

async function testFirstFetchFailSecondSuccess(): Promise<void> {
  const sequence = createProbeSequence([
    new TypeError("fetch failed"),
    { error: null, data: [{ id: "1" }] },
  ]);

  const result = await runConnectionProbeWithRetry({
    env: mockEnv,
    probe: sequence.probe,
    sleep: async () => undefined,
    retryDelaysBeforeAttemptMs: [1, 2, 4],
  });

  assert(result.connected, "second attempt should pass");
  assert(result.attemptCount === 2, "should succeed on attempt 2");
  assert(sequence.getCalls() === 2, "probe should run twice");
}

async function testProbeErrorThenSuccess(): Promise<void> {
  const sequence = createProbeSequence([
    { error: { message: "temporary upstream error" }, data: null },
    { error: null, data: [] },
  ]);

  const result = await runConnectionProbeWithRetry({
    env: mockEnv,
    probe: sequence.probe,
    sleep: async () => undefined,
    retryDelaysBeforeAttemptMs: [1, 2, 4],
  });

  assert(result.connected, "probe.error should retry and eventually pass");
  assert(result.attemptCount === 2, "should succeed on attempt 2");
}

async function testLateSuccessOnFourthAttempt(): Promise<void> {
  const sequence = createProbeSequence([
    new TypeError("fetch failed"),
    { error: { message: "503 unavailable" }, data: null },
    new TypeError("fetch failed"),
    { error: null, data: [{ id: "1" }] },
  ]);

  const result = await runConnectionProbeWithRetry({
    env: mockEnv,
    probe: sequence.probe,
    sleep: async () => undefined,
    retryDelaysBeforeAttemptMs: [1, 2, 4],
  });

  assert(result.connected, "fourth attempt should pass");
  assert(result.attemptCount === 4, "should succeed on attempt 4");
  assert(sequence.getCalls() === 4, "probe should run four times");
}

async function testAllFourAttemptsFail(): Promise<void> {
  const sequence = createProbeSequence([
    new TypeError("fetch failed"),
    { error: { message: "503 unavailable" }, data: null },
    new TypeError("fetch failed"),
    { error: { message: "permanent failure" }, data: null },
  ]);

  const result = await runConnectionProbeWithRetry({
    env: mockEnv,
    probe: sequence.probe,
    sleep: async () => undefined,
    retryDelaysBeforeAttemptMs: [1, 2, 4],
  });

  assert(!result.connected, "all attempts should fail");
  assert(result.attemptCount === 4, "should exhaust four attempts");
  assert(result.lastError === "permanent failure", "last error should be preserved");
}

async function testRetryUsesConfiguredDelays(): Promise<void> {
  const slept: number[] = [];
  let calls = 0;

  const result = await runConnectionProbeWithRetry({
    env: mockEnv,
    probe: async () => {
      calls += 1;
      if (calls < 4) {
        throw new TypeError("fetch failed");
      }
      return { error: null, data: [] };
    },
    sleep: async (ms) => {
      slept.push(ms);
    },
    retryDelaysBeforeAttemptMs: CONNECTION_PROBE_RETRY_DELAYS_MS,
  });

  assert(result.connected, "final attempt should pass");
  assert(
    slept.length === 3 && slept[0] === 1000 && slept[1] === 2000 && slept[2] === 4000,
    `expected [1000,2000,4000] sleeps, got ${JSON.stringify(slept)}`
  );
}

async function testRetryReusesSameSupabaseClient(): Promise<void> {
  let clientInstances = 0;
  const sharedClient = {
    id: "singleton-client",
    from: () => ({
      select: () => ({
        limit: async () => ({ error: null, data: [] }),
        eq: () => ({
          maybeSingle: async () => ({
            error: null,
            data: { id: "hc-1", league: "HEALTH_CHECK", home_team: "A" },
          }),
        }),
      }),
      delete: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;
  const getSupabaseAdmin = () => {
    clientInstances += 1;
    return sharedClient;
  };

  let probeUses = 0;
  let calls = 0;

  await runSupabaseHealthChecks({
    hasSupabaseEnv: () => true,
    getSupabaseEnv: () => mockEnv,
    getSupabaseAdmin,
    sleep: async () => undefined,
    runConnectionProbe: async ({ supabase, env, sleep }) =>
      runConnectionProbeWithRetry({
        env,
        sleep,
        retryDelaysBeforeAttemptMs: [1, 2, 4],
        probe: async () => {
          calls += 1;
          assert(supabase === sharedClient, "probe must reuse singleton client");
          probeUses += 1;
          if (calls < 2) {
            throw new TypeError("fetch failed");
          }
          return { error: null, data: [{ id: "1" }] };
        },
      }),
    insertMatchRecord: async (record) => record,
    updateMatchRecord: async (record) => record,
  });

  assert(clientInstances === 1, "getSupabaseAdmin should be called once");
  assert(probeUses === 2, "connection probe should retry on same client");
}

async function testSchemaAndCrudRunAfterSuccessfulConnectionProbe(): Promise<void> {
  const schemaProbeTables: string[] = [];
  let crudInsertCalled = false;

  const mockSupabase = {
    from(table: string) {
      schemaProbeTables.push(table);
      return {
        select: (_columns?: string) => ({
          limit: async () => ({ error: null, data: [{ id: "1" }] }),
          eq: (_column: string, _value: string) => ({
            maybeSingle: async () => ({
              error: null,
              data: { id: "hc-1", league: "HEALTH_CHECK", home_team: "A" },
            }),
          }),
        }),
        delete: () => ({
          eq: async () => ({ error: null }),
        }),
      };
    },
  } as unknown as SupabaseClient<Database>;

  const result = await runSupabaseHealthChecks({
    hasSupabaseEnv: () => true,
    getSupabaseEnv: () => mockEnv,
    getSupabaseAdmin: () => mockSupabase,
    sleep: async () => undefined,
    runConnectionProbe: async ({ supabase, env, sleep }) =>
      runConnectionProbeWithRetry({
        env,
        sleep,
        probe: async () => {
          assert(supabase === mockSupabase, "schema/crud should use same client");
          return { error: null, data: [{ id: "1" }] };
        },
      }),
    insertMatchRecord: async (record) => {
      crudInsertCalled = true;
      return record;
    },
    updateMatchRecord: async (record) => ({
      ...record,
      league: "HEALTH_CHECK_UPDATED",
    }),
  });

  assert(result.connected, "connection should pass");
  for (const spec of SUPABASE_TABLE_REGISTRY) {
    assert(schemaProbeTables.includes(spec.name), `schema probe missing table ${spec.name}`);
  }
  assert(crudInsertCalled, "CRUD insert should run after connection success");

  const connectionItem = result.items.find(
    (entry) => entry.section === "Supabase" && entry.name === "Connection probe"
  );
  assert(connectionItem?.status === "PASS", "connection probe item should be PASS");

  const crudInsertItem = result.items.find(
    (entry) => entry.section === "Supabase CRUD" && entry.name === "insert match_records"
  );
  assert(crudInsertItem?.status === "PASS", "CRUD insert item should be PASS");
  assert(result.crudPassed, "CRUD cycle should pass after connection success");
}

async function testConnectionFailureSkipsSchemaAndCrud(): Promise<void> {
  let crudCalls = 0;

  const result = await runSupabaseHealthChecks({
    hasSupabaseEnv: () => true,
    getSupabaseEnv: () => mockEnv,
    getSupabaseAdmin: () => ({}) as SupabaseClient<Database>,
    sleep: async () => undefined,
    runConnectionProbe: async ({ env, sleep }) =>
      runConnectionProbeWithRetry({
        env,
        sleep,
        maxAttempts: CONNECTION_PROBE_MAX_ATTEMPTS,
        retryDelaysBeforeAttemptMs: [1, 2, 4],
        probe: async () => {
          throw new TypeError("fetch failed");
        },
      }),
    insertMatchRecord: async (record) => {
      crudCalls += 1;
      return record;
    },
    updateMatchRecord: async (record) => record,
  });

  assert(!result.connected, "connection should fail");
  assert(crudCalls === 0, "CRUD should not run");

  const schemaItem = result.items.find(
    (entry) => entry.section === "Supabase" && entry.name === "Schema tables"
  );
  assert(schemaItem?.status === "NOT TESTABLE", "schema should be NOT TESTABLE");
}

export async function runSupabaseHealthCheckTests(): Promise<void> {
  await testFirstFetchFailSecondSuccess();
  await testProbeErrorThenSuccess();
  await testLateSuccessOnFourthAttempt();
  await testAllFourAttemptsFail();
  await testRetryUsesConfiguredDelays();
  await testRetryReusesSameSupabaseClient();
  await testSchemaAndCrudRunAfterSuccessfulConnectionProbe();
  await testConnectionFailureSkipsSchemaAndCrud();
}

runSupabaseHealthCheckTests()
  .then(() => {
    console.log("Supabase health check tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
