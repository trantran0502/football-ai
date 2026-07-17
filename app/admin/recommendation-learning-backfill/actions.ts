"use server";

import { runAutomatedLearningPipeline } from "@/lib/admin/recommendationPipelineService";
import { revalidatePath } from "next/cache";

export async function refreshPipelineAction() {
  await runAutomatedLearningPipeline();
  revalidatePath("/admin/recommendation-learning-backfill");
  revalidatePath("/admin/system-health");
  revalidatePath("/admin/weight-optimizer");
  revalidatePath("/admin/recommendation-learning-debug");
  revalidatePath("/admin");
}

export async function scanBackfillAction() {
  const snapshot = await runAutomatedLearningPipeline();
  return snapshot.scan;
}

export async function runBackfillAction() {
  const snapshot = await runAutomatedLearningPipeline();
  return snapshot.backfill;
}
