"use server";

import { createWeightConfigUiActionHandlers } from "@/lib/admin/weightConfigUiActions";
import type {
  CreateDraftActionInput,
  RollbackActionInput,
  WeightConfigActionResult,
} from "@/lib/admin/weightConfigUiHelpers";
import {
  activateWeightConfig,
  createWeightConfigDraft,
  rollbackWeightConfig,
} from "@/lib/supabase/services/weightConfigService";
import { revalidatePath } from "next/cache";

const handlers = createWeightConfigUiActionHandlers({
  createWeightConfigDraft,
  activateWeightConfig,
  rollbackWeightConfig,
  revalidatePath,
});

export async function createWeightConfigDraftAction(
  input: CreateDraftActionInput
): Promise<WeightConfigActionResult> {
  return handlers.createDraft(input);
}

export async function activateWeightConfigAction(
  versionId: string
): Promise<WeightConfigActionResult> {
  return handlers.activate(versionId);
}

export async function rollbackWeightConfigAction(
  input: RollbackActionInput = {}
): Promise<WeightConfigActionResult> {
  return handlers.rollback(input);
}
