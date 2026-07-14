export { interpretMoneyline } from "@/lib/knowledge/moneylineKnowledge";
export { interpretHandicap } from "@/lib/knowledge/handicapKnowledge";
export { interpretTotalGoals } from "@/lib/knowledge/totalGoalsKnowledge";
export { interpretBTTS } from "@/lib/knowledge/bttsKnowledge";

export type {
  BttsKnowledgeInput,
  BttsKnowledgeResult,
  CleanSheetExpectation,
  ExpectedGoalRange,
  ExpectedTempo,
  FavoriteSide,
  HandicapKnowledgeInput,
  HandicapKnowledgeResult,
  HandicapLineInput,
  HandicapLineToken,
  KnowledgeConfidence,
  KnowledgeStrength,
  MoneylineKnowledgeResult,
  MoneylineOddsInput,
  OverBias,
  TotalGoalsKnowledgeInput,
  TotalGoalsKnowledgeResult,
  TotalGoalsLineInput,
} from "@/lib/knowledge/types";
