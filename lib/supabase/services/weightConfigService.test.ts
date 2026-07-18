import { DEFAULT_PROVIDER_WEIGHTS } from "@/lib/recommendation/providerWeights";
import {
  activateWeightConfig,
  rollbackWeightConfig,
} from "@/lib/supabase/services/weightConfigService";
import {
  WeightConfigAlreadyActiveError,
  WeightConfigInvalidStatusError,
  WeightConfigNoActiveVersionError,
  WeightConfigNotFoundError,
  WeightConfigRollbackTargetNotFoundError,
  WeightConfigConflictError,
  WeightConfigTransactionError,
} from "@/lib/supabase/services/weightConfigErrors";
import {
  InMemoryWeightConfigTransactionStore,
  mapPgTransactionError,
} from "@/lib/supabase/services/weightConfigTransactionStore";
import type { WeightConfigVersionRow } from "@/lib/supabase/database.types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function buildRow(input: {
  id: string;
  version: number;
  status: WeightConfigVersionRow["status"];
  appliedAt?: string | null;
  archivedAt?: string | null;
}): WeightConfigVersionRow {
  return {
    id: input.id,
    version: input.version,
    status: input.status,
    provider_weights: { ...DEFAULT_PROVIDER_WEIGHTS },
    market_blend_weight: 0.6,
    source_report_snapshot: {},
    created_by: "tester",
    created_at: `2026-07-18T00:00:0${input.version}.000Z`,
    applied_at: input.appliedAt ?? null,
    archived_at: input.archivedAt ?? null,
  };
}

function createTestStore(): InMemoryWeightConfigTransactionStore {
  return new InMemoryWeightConfigTransactionStore();
}

function countActiveRows(store: InMemoryWeightConfigTransactionStore): number {
  return store.listRows().filter((row) => row.status === "active").length;
}

async function testActivateDraftWithoutExistingActive(): Promise<void> {
  const store = createTestStore();
  store.seed(buildRow({ id: "draft-1", version: 1, status: "draft" }));

  const result = await activateWeightConfig("draft-1", { transactionStore: store });

  assert(result.previousActive === null, "no previous active version");
  assert(result.activated.id === "draft-1", "draft should become active");
  assert(result.activated.status === "active", "activated status");
  assert(result.activated.appliedAt !== null, "applied_at should be set");
  assert(countActiveRows(store) === 1, "single active row");
}

async function testActivateDraftArchivesExistingActive(): Promise<void> {
  const store = createTestStore();
  store.seed(
    buildRow({
      id: "active-1",
      version: 1,
      status: "active",
      appliedAt: "2026-07-17T00:00:00.000Z",
    })
  );
  store.seed(buildRow({ id: "draft-2", version: 2, status: "draft" }));

  const result = await activateWeightConfig("draft-2", { transactionStore: store });

  assert(result.previousActive?.id === "active-1", "previous active captured");
  assert(result.previousActive?.status === "archived", "previous active archived in result");
  assert(result.activated.id === "draft-2", "draft activated");
  assert(countActiveRows(store) === 1, "only one active row remains");

  const archived = store.listRows().find((row) => row.id === "active-1");
  assert(archived?.status === "archived", "previous active archived in store");
  assert(archived?.archived_at !== null, "archived_at set");
}

async function testActivateFailureRollsBackTransaction(): Promise<void> {
  const store = createTestStore();
  store.seed(
    buildRow({
      id: "active-1",
      version: 1,
      status: "active",
      appliedAt: "2026-07-17T00:00:00.000Z",
    })
  );
  store.seed(buildRow({ id: "draft-2", version: 2, status: "draft" }));
  store.setFailOnMutationAttempt(2);

  let threw = false;
  try {
    await activateWeightConfig("draft-2", { transactionStore: store });
  } catch (error) {
    threw = error instanceof WeightConfigTransactionError;
  }

  assert(threw, "activate should fail with transaction error");
  assert(countActiveRows(store) === 1, "active count preserved after rollback");
  const active = store.listRows().find((row) => row.id === "active-1");
  const draft = store.listRows().find((row) => row.id === "draft-2");
  assert(active?.status === "active", "original active unchanged");
  assert(draft?.status === "draft", "draft remains draft after rollback");
}

async function testRollbackToLatestArchived(): Promise<void> {
  const store = createTestStore();
  store.seed(
    buildRow({
      id: "active-2",
      version: 2,
      status: "active",
      appliedAt: "2026-07-18T01:00:00.000Z",
    })
  );
  store.seed(
    buildRow({
      id: "archived-1",
      version: 1,
      status: "archived",
      appliedAt: "2026-07-17T00:00:00.000Z",
      archivedAt: "2026-07-18T00:00:00.000Z",
    })
  );

  const result = await rollbackWeightConfig(undefined, { transactionStore: store });

  assert(result.previousActive.id === "active-2", "current active archived");
  assert(result.activated.id === "archived-1", "latest archived reactivated");
  assert(countActiveRows(store) === 1, "single active after rollback");
  assert(
    store.listRows().find((row) => row.id === "archived-1")?.status === "active",
    "target now active"
  );
}

async function testRollbackToSpecifiedArchivedVersion(): Promise<void> {
  const store = createTestStore();
  store.seed(
    buildRow({
      id: "active-3",
      version: 3,
      status: "active",
      appliedAt: "2026-07-18T03:00:00.000Z",
    })
  );
  store.seed(
    buildRow({
      id: "archived-old",
      version: 1,
      status: "archived",
      archivedAt: "2026-07-17T00:00:00.000Z",
    })
  );
  store.seed(
    buildRow({
      id: "archived-new",
      version: 2,
      status: "archived",
      archivedAt: "2026-07-18T02:00:00.000Z",
    })
  );

  const result = await rollbackWeightConfig("archived-old", { transactionStore: store });

  assert(result.activated.id === "archived-old", "specified archived version activated");
  assert(result.previousActive.id === "active-3", "previous active archived");
}

async function testActivateUniqueActiveConstraint(): Promise<void> {
  const store = createTestStore();
  store.seed(buildRow({ id: "draft-1", version: 1, status: "draft" }));
  store.seed(buildRow({ id: "draft-2", version: 2, status: "draft" }));

  await activateWeightConfig("draft-1", { transactionStore: store });
  await activateWeightConfig("draft-2", { transactionStore: store });

  assert(countActiveRows(store) === 1, "only one active after sequential activates");
  const active = store.listRows().find((row) => row.status === "active");
  assert(active?.id === "draft-2", "latest draft should be active");
}

async function testActivateErrors(): Promise<void> {
  const store = createTestStore();
  store.seed(buildRow({ id: "draft-1", version: 1, status: "draft" }));
  store.seed(buildRow({ id: "active-1", version: 2, status: "active", appliedAt: "2026-07-17T00:00:00.000Z" }));
  store.seed(buildRow({ id: "archived-1", version: 3, status: "archived", archivedAt: "2026-07-18T00:00:00.000Z" }));

  await expectError(
    () => activateWeightConfig("missing", { transactionStore: store }),
    WeightConfigNotFoundError
  );
  await expectError(
    () => activateWeightConfig("active-1", { transactionStore: store }),
    WeightConfigAlreadyActiveError
  );
  await expectError(
    () => activateWeightConfig("archived-1", { transactionStore: store }),
    WeightConfigInvalidStatusError
  );
}

async function testRollbackErrors(): Promise<void> {
  const store = createTestStore();
  store.seed(buildRow({ id: "draft-1", version: 1, status: "draft" }));

  await expectError(
    () => rollbackWeightConfig(undefined, { transactionStore: store }),
    WeightConfigNoActiveVersionError
  );

  store.seed(buildRow({ id: "active-1", version: 2, status: "active", appliedAt: "2026-07-18T00:00:00.000Z" }));

  await expectError(
    () => rollbackWeightConfig(undefined, { transactionStore: store }),
    WeightConfigRollbackTargetNotFoundError
  );
  await expectError(
    () => rollbackWeightConfig("missing", { transactionStore: store }),
    WeightConfigRollbackTargetNotFoundError
  );
  await expectError(
    () => rollbackWeightConfig("draft-1", { transactionStore: store }),
    WeightConfigRollbackTargetNotFoundError
  );
}

async function expectError(
  operation: () => Promise<unknown>,
  errorType: new (...args: never[]) => Error
): Promise<void> {
  let threw = false;
  try {
    await operation();
  } catch (error) {
    threw = error instanceof errorType;
  }
  assert(threw, `expected ${errorType.name}`);
}

async function testMapPgConflictErrors(): Promise<void> {
  for (const postgresCode of ["23505", "40001", "40P01"] as const) {
    const mapped = mapPgTransactionError({
      code: postgresCode,
      message: `pg conflict ${postgresCode}`,
    });
    assert(mapped instanceof WeightConfigConflictError, "maps to WeightConfigConflictError");
    assert(mapped.postgresCode === postgresCode, "preserves postgres code");
    assert(mapped.code === "WEIGHT_CONFIG_CONFLICT", "uses conflict app code");
  }

  const generic = mapPgTransactionError(new Error("other failure"));
  assert(generic instanceof WeightConfigTransactionError, "generic pg failure mapping");
}

export async function runWeightConfigServiceTests(): Promise<void> {
  await testActivateDraftWithoutExistingActive();
  await testActivateDraftArchivesExistingActive();
  await testActivateFailureRollsBackTransaction();
  await testRollbackToLatestArchived();
  await testRollbackToSpecifiedArchivedVersion();
  await testActivateUniqueActiveConstraint();
  await testActivateErrors();
  await testRollbackErrors();
  await testMapPgConflictErrors();
}

runWeightConfigServiceTests()
  .then(() => {
    console.log("Weight config service tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
