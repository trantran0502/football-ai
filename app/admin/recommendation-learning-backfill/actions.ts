"use server";

import {
  runRecommendationLearningBackfill,
  scanRecommendationLearningBackfillCandidates,
  type RecommendationLearningBackfillResult,
  type RecommendationLearningBackfillScanResult,
} from "@/lib/recommendation/recommendationLearningBackfill";
import { revalidatePath } from "next/cache";

export async function scanBackfillAction(): Promise<RecommendationLearningBackfillScanResult> {
  return scanRecommendationLearningBackfillCandidates();
}

export async function runBackfillAction(): Promise<RecommendationLearningBackfillResult> {
  const result = await runRecommendationLearningBackfill();
  revalidatePath("/admin/recommendation-learning-debug");
  revalidatePath("/admin/weight-optimizer");
  revalidatePath("/admin/recommendation-learning");
  return result;
}
