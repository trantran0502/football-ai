import type {
  BttsKnowledgeInput,
  BttsKnowledgeResult,
} from "@/lib/knowledge/types";

const PLACEHOLDER: BttsKnowledgeResult = {
  bothTeamsLikely: false,
  cleanSheetExpectation: "possible",
  confidence: "medium",
};

/**
 * BTTS（雙方進球）盤口知識解讀。
 * 目前回傳固定結構，待 Analysis Engine 下一版接入。
 */
export function interpretBTTS(_input: BttsKnowledgeInput): BttsKnowledgeResult {
  return PLACEHOLDER;
}
