import { DEFAULT_PROVIDER_WEIGHTS } from "@/lib/recommendation/providerWeights";
import type { WeightOptimizerReport } from "@/lib/recommendation/weightOptimizerTypes";
import { createWeightConfigUiActionHandlers } from "@/lib/admin/weightConfigUiActions";
import {
  buildDraftDefaultsFromFallback,
  buildDraftDefaultsFromOptimizerReport,
  canActivateVersion,
  canRollbackToVersion,
  canShowRollbackSection,
  getRollbackCandidates,
  mapActiveWeightConfigPanelData,
  mapWeightConfigErrorToActionResult,
  parseCreateDraftActionInput,
  validateProviderWeightsForm,
  WEIGHT_CONFIG_UI_CREATED_BY,
  WeightConfigUiValidationError,
} from "@/lib/admin/weightConfigUiHelpers";
import { buildFallbackWeightConfig } from "@/lib/recommendation/weightConfigRuntime";
import {
  WeightConfigAlreadyActiveError,
  WeightConfigConflictError,
  WeightConfigNoActiveVersionError,
  WeightConfigNotFoundError,
  WeightConfigRollbackTargetNotFoundError,
} from "@/lib/supabase/services/weightConfigErrors";
import type { WeightConfigVersion } from "@/lib/recommendation/weightConfigTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const VERSION_ID = "11111111-2222-4333-8444-555555555555";

function mockVersion(status: WeightConfigVersion["status"] = "draft"): WeightConfigVersion {
  return {
    id: VERSION_ID,
    version: 1,
    status,
    providerWeights: { ...DEFAULT_PROVIDER_WEIGHTS },
    marketBlendWeight: 0.6,
    sourceReportSnapshot: {},
    createdBy: WEIGHT_CONFIG_UI_CREATED_BY,
    createdAt: "2026-07-18T00:00:00.000Z",
    appliedAt: status === "active" ? "2026-07-18T01:00:00.000Z" : null,
    archivedAt: status === "archived" ? "2026-07-18T02:00:00.000Z" : null,
  };
}

function mockReport(): WeightOptimizerReport {
  return {
    diagnostics: {
      recordsRead: 10,
      recordsUsed: 10,
      recordsSkipped: 0,
      skipReasons: {},
      dateRange: { from: "2026-07-01", to: "2026-07-18" },
      generatedAt: "2026-07-18T03:00:00.000Z",
      optimizerMode: "analysis",
      weightsApplied: false,
    },
    overall: {
      market: {
        currentWeight: 0.6,
        suggestedWeight: 0.62,
        sampleSize: 100,
        hitRate: 0.5,
        roi: 0.05,
        averageConfidence: 0.7,
        sampleReliability: 0.8,
        confidenceInterval: { lower: 0.4, upper: 0.6 },
        adjustmentReason: "test",
        status: "analysis",
      },
      team: {
        currentWeight: 0.4,
        suggestedWeight: 0.38,
        sampleSize: 100,
        hitRate: 0.5,
        roi: 0.05,
        averageConfidence: 0.7,
        sampleReliability: 0.8,
        confidenceInterval: { lower: 0.4, upper: 0.6 },
        adjustmentReason: "test",
        status: "analysis",
      },
    },
    providers: Object.entries(DEFAULT_PROVIDER_WEIGHTS).map(([providerKey, currentWeight]) => ({
      providerKey: providerKey as keyof typeof DEFAULT_PROVIDER_WEIGHTS,
      usageCount: 10,
      hitCount: 5,
      hitRate: 0.5,
      roi: 0.05,
      averageConfidence: 0.7,
      currentWeight,
      suggestedWeight: currentWeight,
      sampleReliability: 0.8,
      adjustmentReason: "test",
    })),
    byMarketType: [],
    evidencePerformance: {
      sampleSize: 0,
      generatedAt: "2026-07-18T03:00:00.000Z",
      providers: [],
    },
    evidenceWeightSuggestions: {
      optimizerMode: "analysis",
      weightsApplied: false,
      suggestions: [],
      recommendedDisable: [],
    },
  };
}

function testDraftDefaultsFromOptimizerReport(): void {
  const defaults = buildDraftDefaultsFromOptimizerReport(mockReport());
  assert(defaults.marketBlendWeight === 0.62, "market blend from optimizer report");
  assert(defaults.fromOptimizerReport === true, "optimizer flag");
  assert(
    Math.abs(
      Object.values(defaults.providerWeights).reduce((sum, value) => sum + value, 0) - 1
    ) < 1e-6,
    "provider defaults sum to 1"
  );
}

function testFallbackActiveState(): void {
  const mapped = mapActiveWeightConfigPanelData(buildFallbackWeightConfig());
  assert(mapped.source === "fallback", "fallback source");
  assert(mapped.hasActiveVersion === false, "no active version");
}

function testProviderWeightsSumValidation(): void {
  const invalid = validateProviderWeightsForm(
    { ...DEFAULT_PROVIDER_WEIGHTS, recentForm: 0.99 },
    0.6
  );
  assert(invalid.valid === false, "invalid sum rejected");

  const valid = validateProviderWeightsForm({ ...DEFAULT_PROVIDER_WEIGHTS }, 0.6);
  assert(valid.valid === true, "valid sum accepted");
}

function testDraftOnlyActivateArchivedOnlyRollback(): void {
  assert(canActivateVersion(mockVersion("draft")) === true, "draft can activate");
  assert(canActivateVersion(mockVersion("active")) === false, "active cannot activate");
  assert(canRollbackToVersion(mockVersion("archived")) === true, "archived can rollback");
  assert(canRollbackToVersion(mockVersion("draft")) === false, "draft cannot rollback");
}

function testRollbackCandidatesAndVisibility(): void {
  const versions = [mockVersion("active"), mockVersion("archived"), mockVersion("draft")];
  assert(getRollbackCandidates(versions).length === 1, "one archived candidate");
  assert(
    canShowRollbackSection({ hasActiveVersion: true, versions }) === true,
    "rollback visible with active and archived"
  );
  assert(
    canShowRollbackSection({ hasActiveVersion: false, versions }) === false,
    "rollback hidden without active"
  );
}

function testParseCreateDraftActionInput(): void {
  const parsed = parseCreateDraftActionInput({
    providerWeights: { ...DEFAULT_PROVIDER_WEIGHTS },
    marketBlendWeight: 0.6,
    sourceReportSnapshot: { note: "snapshot" },
  });
  assert(parsed.createdBy === WEIGHT_CONFIG_UI_CREATED_BY, "createdBy fixed server-side");
}

async function testActionDraftValidationFail(): Promise<void> {
  const handlers = createWeightConfigUiActionHandlers({
    createWeightConfigDraft: async () => mockVersion(),
    activateWeightConfig: async () => ({ activated: mockVersion("active"), previousActive: null }),
    rollbackWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: mockVersion("archived"),
    }),
    revalidatePath: () => undefined,
  });

  const result = await handlers.createDraft({
    providerWeights: { ...DEFAULT_PROVIDER_WEIGHTS, recentForm: 0.99 },
    marketBlendWeight: 0.6,
    sourceReportSnapshot: {},
  });
  assert(result.success === false, "draft validation fail");
  assert(result.code === "VALIDATION_ERROR", "validation code");
}

async function testActionDraftSuccess(): Promise<void> {
  let createdBy = "";
  const handlers = createWeightConfigUiActionHandlers({
    createWeightConfigDraft: async (input) => {
      createdBy = input.createdBy;
      return mockVersion();
    },
    activateWeightConfig: async () => ({ activated: mockVersion("active"), previousActive: null }),
    rollbackWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: mockVersion("archived"),
    }),
    revalidatePath: () => undefined,
  });

  const result = await handlers.createDraft({
    providerWeights: { ...DEFAULT_PROVIDER_WEIGHTS },
    marketBlendWeight: 0.6,
    sourceReportSnapshot: { note: "snapshot" },
  });
  assert(result.success === true, "draft success");
  assert(createdBy === WEIGHT_CONFIG_UI_CREATED_BY, "createdBy injected");
}

async function testActionActivateSuccessAndErrorMapping(): Promise<void> {
  const successHandlers = createWeightConfigUiActionHandlers({
    createWeightConfigDraft: async () => mockVersion(),
    activateWeightConfig: async () => ({ activated: mockVersion("active"), previousActive: null }),
    rollbackWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: mockVersion("archived"),
    }),
    revalidatePath: () => undefined,
  });
  const success = await successHandlers.activate(VERSION_ID);
  assert(success.success === true, "activate success");

  const errorHandlers = createWeightConfigUiActionHandlers({
    createWeightConfigDraft: async () => mockVersion(),
    activateWeightConfig: async () => {
      throw new WeightConfigAlreadyActiveError(VERSION_ID);
    },
    rollbackWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: mockVersion("archived"),
    }),
    revalidatePath: () => undefined,
  });
  const conflict = await errorHandlers.activate(VERSION_ID);
  assert(conflict.success === false, "activate conflict");
  assert(conflict.code === "WEIGHT_CONFIG_ALREADY_ACTIVE", "activate conflict code");
}

async function testActionRollbackSuccessAndInvalidTarget(): Promise<void> {
  const successHandlers = createWeightConfigUiActionHandlers({
    createWeightConfigDraft: async () => mockVersion(),
    activateWeightConfig: async () => ({ activated: mockVersion("active"), previousActive: null }),
    rollbackWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: mockVersion("archived"),
    }),
    revalidatePath: () => undefined,
  });
  const success = await successHandlers.rollback({ targetVersionId: VERSION_ID });
  assert(success.success === true, "rollback success");

  const invalidHandlers = createWeightConfigUiActionHandlers({
    createWeightConfigDraft: async () => mockVersion(),
    activateWeightConfig: async () => ({ activated: mockVersion("active"), previousActive: null }),
    rollbackWeightConfig: async () => {
      throw new WeightConfigRollbackTargetNotFoundError(VERSION_ID);
    },
    revalidatePath: () => undefined,
  });
  const invalid = await invalidHandlers.rollback({ targetVersionId: VERSION_ID });
  assert(invalid.success === false, "rollback invalid target");
  assert(
    invalid.code === "WEIGHT_CONFIG_ROLLBACK_TARGET_NOT_FOUND",
    "rollback target code"
  );
}

function testInternalErrorDoesNotLeakStack(): void {
  const secret = "postgresql://postgres:secret@db.example.com:5432/postgres";
  const mapped = mapWeightConfigErrorToActionResult(new Error(`${secret} at sensitive.ts:99:13`));
  assert(mapped.success === false, "internal error mapped");
  assert(mapped.message === "Request failed.", "generic message");
  assert(!mapped.message.includes("secret"), "no password leak");
  assert(!JSON.stringify(mapped).includes("sensitive.ts"), "no stack leak");

  const conflict = mapWeightConfigErrorToActionResult(
    new WeightConfigConflictError("23505", secret)
  );
  assert(conflict.code === "WEIGHT_CONFIG_CONFLICT", "conflict code preserved");
  assert(!JSON.stringify(conflict).includes("secret"), "conflict sanitized");
}

function testFallbackDefaults(): void {
  const defaults = buildDraftDefaultsFromFallback();
  assert(defaults.fromOptimizerReport === false, "fallback defaults flag");
  assert(defaults.marketBlendWeight > 0, "fallback market blend present");
}

function testValidationErrorMapping(): void {
  const mapped = mapWeightConfigErrorToActionResult(
    new WeightConfigUiValidationError("bad input")
  );
  assert(mapped.code === "VALIDATION_ERROR", "validation error code");
}

function testNotFoundAndNoActiveMapping(): void {
  const notFound = mapWeightConfigErrorToActionResult(
    new WeightConfigNotFoundError(VERSION_ID)
  );
  assert(notFound.code === "WEIGHT_CONFIG_NOT_FOUND", "not found code");

  const noActive = mapWeightConfigErrorToActionResult(new WeightConfigNoActiveVersionError());
  assert(noActive.code === "WEIGHT_CONFIG_NO_ACTIVE", "no active code");
}

export async function runWeightConfigUiTests(): Promise<void> {
  testDraftDefaultsFromOptimizerReport();
  testFallbackActiveState();
  testProviderWeightsSumValidation();
  testDraftOnlyActivateArchivedOnlyRollback();
  testRollbackCandidatesAndVisibility();
  testParseCreateDraftActionInput();
  await testActionDraftValidationFail();
  await testActionDraftSuccess();
  await testActionActivateSuccessAndErrorMapping();
  await testActionRollbackSuccessAndInvalidTarget();
  testInternalErrorDoesNotLeakStack();
  testFallbackDefaults();
  testValidationErrorMapping();
  testNotFoundAndNoActiveMapping();
}

runWeightConfigUiTests()
  .then(() => {
    console.log("Weight config UI tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
