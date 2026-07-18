import { DEFAULT_PROVIDER_WEIGHTS } from "@/lib/recommendation/providerWeights";
import { loadEnvLocal } from "@/lib/healthCheck/productionHealthCheckRunner";
import type { WeightConfigVersionRow } from "@/lib/supabase/database.types";
import { insertDraftViaPg } from "@/lib/supabase/services/weightConfigService.integration.pg";
import {
  activateWeightConfig,
  rollbackWeightConfig,
} from "@/lib/supabase/services/weightConfigService";

const INTEGRATION_CREATED_BY = "weight-config-integration-smoke";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function resolveDatabaseUrl(): string | null {
  return (
    process.env.SUPABASE_DB_URL?.trim() ??
    process.env.DATABASE_URL?.trim() ??
    null
  );
}

async function loadPgClient(): Promise<typeof import("pg").Client> {
  const pg = await import("pg");
  return pg.Client;
}

async function fetchAllRows(
  query: (sql: string, params?: unknown[]) => Promise<import("pg").QueryResult>
): Promise<WeightConfigVersionRow[]> {
  const result = await query(
    `select *
     from public.weight_config_versions
     order by version asc`
  );
  return result.rows as WeightConfigVersionRow[];
}

async function countActiveRows(
  query: (sql: string, params?: unknown[]) => Promise<import("pg").QueryResult>
): Promise<number> {
  const result = await query(
    `select count(*)::int as count
     from public.weight_config_versions
     where status = 'active'`
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function fetchActiveRow(
  query: (sql: string, params?: unknown[]) => Promise<import("pg").QueryResult>
): Promise<WeightConfigVersionRow | null> {
  const result = await query(
    `select *
     from public.weight_config_versions
     where status = 'active'
     order by version desc
     limit 1`
  );
  return (result.rows[0] as WeightConfigVersionRow | undefined) ?? null;
}

async function restoreSnapshot(
  client: import("pg").Client,
  snapshot: WeightConfigVersionRow[]
): Promise<void> {
  await client.query("BEGIN");
  try {
    const currentRows = await fetchAllRows((sql, params = []) => client.query(sql, params));
    const snapshotIds = new Set(snapshot.map((row) => row.id));

    for (const row of snapshot) {
      await client.query(
        `update public.weight_config_versions
         set version = $2,
             status = $3,
             provider_weights = $4,
             market_blend_weight = $5,
             source_report_snapshot = $6,
             created_by = $7,
             created_at = $8,
             applied_at = $9,
             archived_at = $10
         where id = $1`,
        [
          row.id,
          row.version,
          row.status,
          row.provider_weights,
          row.market_blend_weight,
          row.source_report_snapshot,
          row.created_by,
          row.created_at,
          row.applied_at,
          row.archived_at,
        ]
      );
    }

    for (const row of currentRows) {
      if (!snapshotIds.has(row.id)) {
        await client.query(`delete from public.weight_config_versions where id = $1`, [
          row.id,
        ]);
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function createIntegrationDraft(
  client: import("pg").Client,
  label: string
) {
  return insertDraftViaPg((sql, params = []) => client.query(sql, params), {
    providerWeights: { ...DEFAULT_PROVIDER_WEIGHTS },
    marketBlendWeight: 0.6,
    createdBy: INTEGRATION_CREATED_BY,
    sourceReportSnapshot: {
      integrationSmoke: label,
      createdAt: new Date().toISOString(),
    },
  });
}

export async function runWeightConfigServiceIntegrationTests(): Promise<"pass" | "skip"> {
  loadEnvLocal();

  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) {
    console.log(
      "SKIP: weight config PG integration (missing SUPABASE_DB_URL or DATABASE_URL)"
    );
    return "skip";
  }

  const Client = await loadPgClient();
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  let snapshot: WeightConfigVersionRow[] = [];

  try {
    snapshot = await fetchAllRows((sql, params = []) => client.query(sql, params));
    const priorActive = snapshot.find((row) => row.status === "active") ?? null;
    const hasArchived = snapshot.some((row) => row.status === "archived");

    let testDraftId: string;

    if (priorActive || hasArchived) {
      const draft = await createIntegrationDraft(client, "primary");
      testDraftId = draft.id;
    } else {
      const bootstrapDraft = await createIntegrationDraft(client, "bootstrap");
      await activateWeightConfig(bootstrapDraft.id);

      const testDraft = await createIntegrationDraft(client, "primary");
      testDraftId = testDraft.id;
    }

    const activation = await activateWeightConfig(testDraftId);
    assert(activation.activated.id === testDraftId, "activated integration draft");
    assert(
      (await countActiveRows((sql, params = []) => client.query(sql, params))) === 1,
      "single active row after activate"
    );

    const rollback = await rollbackWeightConfig();
    assert(
      (await countActiveRows((sql, params = []) => client.query(sql, params))) === 1,
      "single active row after rollback"
    );

    if (priorActive) {
      const restoredActive = await fetchActiveRow((sql, params = []) =>
        client.query(sql, params)
      );
      assert(
        restoredActive?.id === priorActive.id,
        "rollback restored the pre-test active version"
      );
      assert(
        rollback.activated.id === priorActive.id,
        "rollback result points to restored active version"
      );
    }

    console.log("Weight config PG integration smoke test passed.");
    return "pass";
  } finally {
    try {
      await restoreSnapshot(client, snapshot);
      console.log("Weight config PG integration cleanup succeeded.");
    } catch (restoreError) {
      console.error("Failed to restore weight_config_versions snapshot:", restoreError);
      throw restoreError;
    } finally {
      await client.end();
    }
  }
}

runWeightConfigServiceIntegrationTests()
  .then((result) => {
    if (result === "skip") {
      process.exit(0);
    }
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
