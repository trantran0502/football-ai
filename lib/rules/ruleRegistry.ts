import { moneylineHandicapRule } from "@/lib/analysis/rules/moneylineHandicapRule";
import { totalGoalsHandicapRule } from "@/lib/analysis/rules/totalGoalsHandicapRule";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  pickPrimaryHandicap,
  pickPrimaryMoneyline,
  pickPrimaryTotalGoals,
} from "@/lib/rules/marketPickers";
import type { RegisteredRule, RuleName } from "@/lib/rules/types";

const MONEYLINE_HANDICAP_RULE: RegisteredRule = {
  name: "MoneylineHandicapRule",
  displayName: "Moneyline × Handicap",
  description: "檢查獨贏與亞洲讓分敘事是否一致。",
  requiredMarkets: ["moneyline", "handicap"],
  canApply(match: HistoricalMatchRecord): boolean {
    const moneyline = pickPrimaryMoneyline(match.marketSelections);
    const handicap = pickPrimaryHandicap(match.marketSelections);
    return moneyline.length > 0 && handicap.length > 0;
  },
  evaluate(match: HistoricalMatchRecord) {
    const moneyline = pickPrimaryMoneyline(match.marketSelections);
    const handicap = pickPrimaryHandicap(match.marketSelections);
    if (moneyline.length === 0 || handicap.length === 0) {
      return null;
    }
    return moneylineHandicapRule({ moneyline, handicap });
  },
};

const HANDICAP_TOTAL_GOALS_RULE: RegisteredRule = {
  name: "HandicapTotalGoalsRule",
  displayName: "Handicap × Total Goals",
  description: "檢查亞洲讓分與大小球敘事是否一致。",
  requiredMarkets: ["handicap", "totalGoals"],
  canApply(match: HistoricalMatchRecord): boolean {
    const handicap = pickPrimaryHandicap(match.marketSelections);
    const totalGoals = pickPrimaryTotalGoals(match.marketSelections);
    return handicap.length > 0 && totalGoals.length > 0;
  },
  evaluate(match: HistoricalMatchRecord) {
    const handicap = pickPrimaryHandicap(match.marketSelections);
    const totalGoals = pickPrimaryTotalGoals(match.marketSelections);
    if (handicap.length === 0 || totalGoals.length === 0) {
      return null;
    }
    return totalGoalsHandicapRule({ handicap, totalGoals });
  },
};

const RULES: readonly RegisteredRule[] = [
  MONEYLINE_HANDICAP_RULE,
  HANDICAP_TOTAL_GOALS_RULE,
];

const RULE_MAP = new Map<RuleName, RegisteredRule>(
  RULES.map((rule) => [rule.name, rule])
);

/** 所有已註冊 Rule（集中管理）。 */
export function getAllRegisteredRules(): RegisteredRule[] {
  return [...RULES];
}

export function getRegisteredRule(name: RuleName): RegisteredRule | undefined {
  return RULE_MAP.get(name);
}

export function hasRegisteredRule(name: RuleName): boolean {
  return RULE_MAP.has(name);
}
