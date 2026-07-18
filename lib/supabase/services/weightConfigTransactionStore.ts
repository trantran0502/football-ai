import type {
  WeightConfigActivationResult,
  WeightConfigRollbackResult,
  WeightConfigVersion,
} from "@/lib/recommendation/weightConfigTypes";
import type { WeightConfigVersionRow } from "@/lib/supabase/database.types";
import {
  WeightConfigAlreadyActiveError,
  WeightConfigError,
  WeightConfigInvalidStatusError,
  WeightConfigNoActiveVersionError,
  WeightConfigConflictError,
  WeightConfigNotFoundError,
  WeightConfigRollbackTargetNotFoundError,
  WeightConfigTransactionError,
} from "@/lib/supabase/services/weightConfigErrors";
import { weightConfigRowToDomain } from "@/lib/supabase/mappers/weightConfigMapper";

export interface WeightConfigTransactionStore {
  activateWeightConfig(versionId: string): Promise<WeightConfigActivationResult>;
  rollbackWeightConfig(targetVersionId?: string): Promise<WeightConfigRollbackResult>;
}

function cloneRow(row: WeightConfigVersionRow): WeightConfigVersionRow {
  return {
    ...row,
    provider_weights: { ...row.provider_weights },
    source_report_snapshot: { ...row.source_report_snapshot },
  };
}

function sortArchivedRows(rows: WeightConfigVersionRow[]): WeightConfigVersionRow[] {
  return [...rows].sort((left, right) => {
    const leftArchivedAt = left.archived_at ?? left.created_at;
    const rightArchivedAt = right.archived_at ?? right.created_at;
    if (leftArchivedAt !== rightArchivedAt) {
      return rightArchivedAt.localeCompare(leftArchivedAt);
    }
    return right.version - left.version;
  });
}

export function executeActivateWeightConfigMutation(input: {
  rows: Map<string, WeightConfigVersionRow>;
  versionId: string;
  now: string;
  onMutation?: () => void;
}): WeightConfigActivationResult {
  const target = input.rows.get(input.versionId);
  if (!target) {
    throw new WeightConfigNotFoundError(input.versionId);
  }
  if (target.status === "active") {
    throw new WeightConfigAlreadyActiveError(input.versionId);
  }
  if (target.status !== "draft") {
    throw new WeightConfigInvalidStatusError(input.versionId, "draft", target.status);
  }

  let previousActive: WeightConfigVersion | null = null;
  const currentActive = [...input.rows.values()].find((row) => row.status === "active");
  if (currentActive) {
    input.onMutation?.();
    input.rows.set(currentActive.id, {
      ...currentActive,
      status: "archived",
      archived_at: input.now,
    });
    previousActive = weightConfigRowToDomain(input.rows.get(currentActive.id)!);
  }

  input.onMutation?.();
  input.rows.set(input.versionId, {
    ...target,
    status: "active",
    applied_at: input.now,
    archived_at: null,
  });

  return {
    activated: weightConfigRowToDomain(input.rows.get(input.versionId)!),
    previousActive,
  };
}

export function executeRollbackWeightConfigMutation(input: {
  rows: Map<string, WeightConfigVersionRow>;
  targetVersionId?: string;
  now: string;
  onMutation?: () => void;
}): WeightConfigRollbackResult {
  const currentActive = [...input.rows.values()].find((row) => row.status === "active");
  if (!currentActive) {
    throw new WeightConfigNoActiveVersionError();
  }

  const archivedRows = [...input.rows.values()].filter((row) => row.status === "archived");
  const target = input.targetVersionId
    ? archivedRows.find((row) => row.id === input.targetVersionId)
    : sortArchivedRows(archivedRows)[0];

  if (!target) {
    throw new WeightConfigRollbackTargetNotFoundError(input.targetVersionId);
  }

  input.onMutation?.();
  input.rows.set(currentActive.id, {
    ...currentActive,
    status: "archived",
    archived_at: input.now,
  });

  input.onMutation?.();
  input.rows.set(target.id, {
    ...target,
    status: "active",
    applied_at: input.now,
    archived_at: null,
  });

  return {
    previousActive: weightConfigRowToDomain(input.rows.get(currentActive.id)!),
    activated: weightConfigRowToDomain(input.rows.get(target.id)!),
  };
}

export class InMemoryWeightConfigTransactionStore implements WeightConfigTransactionStore {
  private readonly rows = new Map<string, WeightConfigVersionRow>();
  private failOnMutationAttempt: number | null = null;
  private mutationAttempt = 0;

  seed(row: WeightConfigVersionRow): void {
    this.rows.set(row.id, cloneRow(row));
  }

  listRows(): WeightConfigVersionRow[] {
    return [...this.rows.values()].map(cloneRow);
  }

  setFailOnMutationAttempt(attempt: number | null): void {
    this.failOnMutationAttempt = attempt;
  }

  async activateWeightConfig(versionId: string): Promise<WeightConfigActivationResult> {
    return this.runTransaction((onMutation) =>
      executeActivateWeightConfigMutation({
        rows: this.rows,
        versionId,
        now: new Date().toISOString(),
        onMutation,
      })
    );
  }

  async rollbackWeightConfig(
    targetVersionId?: string
  ): Promise<WeightConfigRollbackResult> {
    return this.runTransaction((onMutation) =>
      executeRollbackWeightConfigMutation({
        rows: this.rows,
        targetVersionId,
        now: new Date().toISOString(),
        onMutation,
      })
    );
  }

  private runTransaction<T>(operation: (onMutation: () => void) => T): T {
    const snapshot = new Map(
      [...this.rows.entries()].map(([id, row]) => [id, cloneRow(row)])
    );
    this.mutationAttempt = 0;

    const onMutation = () => {
      this.mutationAttempt += 1;
      if (
        this.failOnMutationAttempt !== null &&
        this.mutationAttempt === this.failOnMutationAttempt
      ) {
        throw new WeightConfigTransactionError("Injected transaction failure");
      }
    };

    try {
      const result = operation(onMutation);
      this.assertSingleActiveVersion();
      return result;
    } catch (error) {
      this.rows.clear();
      for (const [id, row] of snapshot.entries()) {
        this.rows.set(id, cloneRow(row));
      }
      if (error instanceof WeightConfigError) {
        throw error;
      }
      throw new WeightConfigTransactionError(
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      this.failOnMutationAttempt = null;
      this.mutationAttempt = 0;
    }
  }

  private assertSingleActiveVersion(): void {
    const activeRows = [...this.rows.values()].filter((row) => row.status === "active");
    if (activeRows.length > 1) {
      throw new WeightConfigTransactionError(
        `Expected at most one active weight config version, found ${activeRows.length}`
      );
    }
  }
}

function resolveDatabaseUrl(): string | null {
  return (
    process.env.SUPABASE_DB_URL?.trim() ??
    process.env.DATABASE_URL?.trim() ??
    null
  );
}

function readPostgresErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function mapPgTransactionError(error: unknown): WeightConfigError {
  if (error instanceof WeightConfigError) {
    return error;
  }

  const postgresCode = readPostgresErrorCode(error);
  if (
    postgresCode === "23505" ||
    postgresCode === "40001" ||
    postgresCode === "40P01"
  ) {
    return new WeightConfigConflictError(
      postgresCode,
      error instanceof Error ? error.message : String(error)
    );
  }

  return new WeightConfigTransactionError(
    error instanceof Error ? error.message : String(error)
  );
}

async function loadPgClient(): Promise<typeof import("pg").Client> {
  try {
    const pg = await import("pg");
    return pg.Client;
  } catch {
    throw new WeightConfigTransactionError(
      "PostgreSQL client unavailable. Install pg to use weight config transactions."
    );
  }
}

async function withPgTransaction<T>(
  operation: (query: (sql: string, params?: unknown[]) => Promise<import("pg").QueryResult>) => Promise<T>
): Promise<T> {
  const dbUrl = resolveDatabaseUrl();
  if (!dbUrl) {
    throw new WeightConfigTransactionError(
      "Missing SUPABASE_DB_URL or DATABASE_URL for weight config transactions."
    );
  }

  const Client = await loadPgClient();
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query("BEGIN");
    const result = await operation((sql, params = []) => client.query(sql, params));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // best-effort rollback
    }
    throw mapPgTransactionError(error);
  } finally {
    await client.end();
  }
}

async function fetchRowById(
  query: (sql: string, params?: unknown[]) => Promise<import("pg").QueryResult>,
  versionId: string
): Promise<WeightConfigVersionRow> {
  const result = await query(
    `select *
     from public.weight_config_versions
     where id = $1
     for update`,
    [versionId]
  );
  const row = result.rows[0] as WeightConfigVersionRow | undefined;
  if (!row) {
    throw new WeightConfigNotFoundError(versionId);
  }
  return row;
}

async function fetchActiveRowForUpdate(
  query: (sql: string, params?: unknown[]) => Promise<import("pg").QueryResult>
): Promise<WeightConfigVersionRow | null> {
  const result = await query(
    `select *
     from public.weight_config_versions
     where status = 'active'
     order by version desc
     limit 1
     for update`
  );
  return (result.rows[0] as WeightConfigVersionRow | undefined) ?? null;
}

async function fetchArchivedRowForUpdate(input: {
  query: (sql: string, params?: unknown[]) => Promise<import("pg").QueryResult>;
  targetVersionId?: string;
}): Promise<WeightConfigVersionRow> {
  if (input.targetVersionId) {
    const result = await input.query(
      `select *
       from public.weight_config_versions
       where id = $1
         and status = 'archived'
       for update`,
      [input.targetVersionId]
    );
    const row = result.rows[0] as WeightConfigVersionRow | undefined;
    if (!row) {
      throw new WeightConfigRollbackTargetNotFoundError(input.targetVersionId);
    }
    return row;
  }

  const result = await input.query(
    `select *
     from public.weight_config_versions
     where status = 'archived'
     order by archived_at desc nulls last, version desc
     limit 1
     for update`
  );
  const row = result.rows[0] as WeightConfigVersionRow | undefined;
  if (!row) {
    throw new WeightConfigRollbackTargetNotFoundError();
  }
  return row;
}

export class PgWeightConfigTransactionStore implements WeightConfigTransactionStore {
  async activateWeightConfig(versionId: string): Promise<WeightConfigActivationResult> {
    return withPgTransaction(async (query) => {
      const now = new Date().toISOString();
      const target = await fetchRowById(query, versionId);
      if (target.status === "active") {
        throw new WeightConfigAlreadyActiveError(versionId);
      }
      if (target.status !== "draft") {
        throw new WeightConfigInvalidStatusError(versionId, "draft", target.status);
      }

      let previousActive: WeightConfigVersion | null = null;
      const currentActive = await fetchActiveRowForUpdate(query);
      if (currentActive) {
        const archivedResult = await query(
          `update public.weight_config_versions
           set status = 'archived',
               archived_at = $2
           where id = $1
           returning *`,
          [currentActive.id, now]
        );
        previousActive = weightConfigRowToDomain(
          archivedResult.rows[0] as WeightConfigVersionRow
        );
      }

      const activatedResult = await query(
        `update public.weight_config_versions
         set status = 'active',
             applied_at = $2,
             archived_at = null
         where id = $1
         returning *`,
        [versionId, now]
      );

      return {
        activated: weightConfigRowToDomain(activatedResult.rows[0] as WeightConfigVersionRow),
        previousActive,
      };
    });
  }

  async rollbackWeightConfig(
    targetVersionId?: string
  ): Promise<WeightConfigRollbackResult> {
    return withPgTransaction(async (query) => {
      const now = new Date().toISOString();
      const currentActive = await fetchActiveRowForUpdate(query);
      if (!currentActive) {
        throw new WeightConfigNoActiveVersionError();
      }

      const target = await fetchArchivedRowForUpdate({ query, targetVersionId });

      const previousActiveResult = await query(
        `update public.weight_config_versions
         set status = 'archived',
             archived_at = $2
         where id = $1
         returning *`,
        [currentActive.id, now]
      );

      const activatedResult = await query(
        `update public.weight_config_versions
         set status = 'active',
             applied_at = $2,
             archived_at = null
         where id = $1
         returning *`,
        [target.id, now]
      );

      return {
        previousActive: weightConfigRowToDomain(
          previousActiveResult.rows[0] as WeightConfigVersionRow
        ),
        activated: weightConfigRowToDomain(activatedResult.rows[0] as WeightConfigVersionRow),
      };
    });
  }
}

let defaultTransactionStore: WeightConfigTransactionStore | null = null;

export function createDefaultWeightConfigTransactionStore(): WeightConfigTransactionStore {
  return new PgWeightConfigTransactionStore();
}

export function getDefaultWeightConfigTransactionStore(): WeightConfigTransactionStore {
  if (!defaultTransactionStore) {
    defaultTransactionStore = createDefaultWeightConfigTransactionStore();
  }
  return defaultTransactionStore;
}

export function setDefaultWeightConfigTransactionStoreForTests(
  store: WeightConfigTransactionStore | null
): void {
  defaultTransactionStore = store;
}
