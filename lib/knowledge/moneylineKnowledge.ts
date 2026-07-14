import type {
  MoneylineKnowledgeResult,
  MoneylineOddsInput,
} from "@/lib/knowledge/types";

const PLACEHOLDER: MoneylineKnowledgeResult = {
  favoriteSide: "home",
  favoriteStrength: "medium",
  impliedHomeProbability: 0,
  impliedDrawProbability: 0,
  impliedAwayProbability: 0,
};

/**
 * Moneyline 盤口知識解讀。
 * 輸入：主勝、和局、客勝賠率。
 * 目前回傳固定結構，待 Analysis Engine 下一版接入。
 */
export function interpretMoneyline(
  _input: MoneylineOddsInput
): MoneylineKnowledgeResult {
  return PLACEHOLDER;
}
