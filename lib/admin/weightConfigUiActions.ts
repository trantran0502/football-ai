import {
  mapWeightConfigErrorToActionResult,
  parseActivateVersionId,
  parseCreateDraftActionInput,
  parseRollbackActionInput,
  sanitizeActionResultForClient,
  type CreateDraftActionInput,
  type RollbackActionInput,
  type WeightConfigActionResult,
} from "@/lib/admin/weightConfigUiHelpers";
import {
  activateWeightConfig,
  createWeightConfigDraft,
  rollbackWeightConfig,
} from "@/lib/supabase/services/weightConfigService";

export interface WeightConfigUiActionDeps {
  createWeightConfigDraft: typeof createWeightConfigDraft;
  activateWeightConfig: typeof activateWeightConfig;
  rollbackWeightConfig: typeof rollbackWeightConfig;
  revalidatePath: (path: string) => void;
}

const defaultDeps: WeightConfigUiActionDeps = {
  createWeightConfigDraft,
  activateWeightConfig,
  rollbackWeightConfig,
  revalidatePath: () => {
    throw new Error("revalidatePath must be injected in server actions.");
  },
};

export function createWeightConfigUiActionHandlers(
  deps: WeightConfigUiActionDeps = defaultDeps
) {
  async function createDraft(input: CreateDraftActionInput): Promise<WeightConfigActionResult> {
    try {
      const parsed = parseCreateDraftActionInput(input);
      await deps.createWeightConfigDraft(parsed);
      deps.revalidatePath("/admin/weight-optimizer");
      return sanitizeActionResultForClient({
        success: true,
        message: "Draft created.",
      });
    } catch (error) {
      return sanitizeActionResultForClient(mapWeightConfigErrorToActionResult(error));
    }
  }

  async function activate(versionId: string): Promise<WeightConfigActionResult> {
    try {
      const normalizedId = parseActivateVersionId(versionId);
      await deps.activateWeightConfig(normalizedId);
      deps.revalidatePath("/admin/weight-optimizer");
      return sanitizeActionResultForClient({
        success: true,
        message: "Version activated.",
      });
    } catch (error) {
      return sanitizeActionResultForClient(mapWeightConfigErrorToActionResult(error));
    }
  }

  async function rollback(input: RollbackActionInput = {}): Promise<WeightConfigActionResult> {
    try {
      const parsed = parseRollbackActionInput(input);
      await deps.rollbackWeightConfig(parsed.targetVersionId);
      deps.revalidatePath("/admin/weight-optimizer");
      return sanitizeActionResultForClient({
        success: true,
        message: "Rollback completed.",
      });
    } catch (error) {
      return sanitizeActionResultForClient(mapWeightConfigErrorToActionResult(error));
    }
  }

  return {
    createDraft,
    activate,
    rollback,
  };
}
