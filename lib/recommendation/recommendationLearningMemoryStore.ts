import type { RecommendationLearningRecord } from "@/lib/recommendation/recommendationLearningTypes";

const memoryStore = new Map<string, RecommendationLearningRecord>();

export function saveRecommendationLearningToMemory(
  record: RecommendationLearningRecord
): RecommendationLearningRecord {
  memoryStore.set(record.matchRecordId, structuredClone(record));
  return structuredClone(record);
}

export function getRecommendationLearningFromMemory(
  matchRecordId: string
): RecommendationLearningRecord | null {
  const record = memoryStore.get(matchRecordId);
  return record ? structuredClone(record) : null;
}

export function listRecommendationLearningFromMemory(): RecommendationLearningRecord[] {
  return [...memoryStore.values()].map((record) => structuredClone(record));
}

export function clearRecommendationLearningMemory(): void {
  memoryStore.clear();
}

export function getRecommendationLearningMemorySize(): number {
  return memoryStore.size;
}
