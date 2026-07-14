import type {
  HandicapKnowledgeInput,
  HandicapKnowledgeResult,
} from "@/lib/knowledge/types";

const PLACEHOLDER: HandicapKnowledgeResult = {
  expectedWinningMargin: 0,
  handicapStrength: "medium",
  favoriteSide: "home",
  confidence: "medium",
};

/**
 * 讓分盤口知識解讀。
 * 輸入：所有讓分盤線（0、0-50、0+50、0.5、1、1-50、1+50、1.5 等）。
 * 目前回傳固定結構，待 Analysis Engine 下一版接入。
 */
export function interpretHandicap(
  _input: HandicapKnowledgeInput
): HandicapKnowledgeResult {
  return PLACEHOLDER;
}
