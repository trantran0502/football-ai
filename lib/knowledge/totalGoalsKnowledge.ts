import type {
  TotalGoalsKnowledgeInput,
  TotalGoalsKnowledgeResult,
} from "@/lib/knowledge/types";

const PLACEHOLDER: TotalGoalsKnowledgeResult = {
  expectedGoalRange: { min: 0, max: 0 },
  expectedTempo: "moderate",
  overBias: "neutral",
  confidence: "medium",
};

/**
 * 大小球盤口知識解讀。
 * 目前回傳固定結構，待 Analysis Engine 下一版接入。
 */
export function interpretTotalGoals(
  _input: TotalGoalsKnowledgeInput
): TotalGoalsKnowledgeResult {
  return PLACEHOLDER;
}
