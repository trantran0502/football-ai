import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { MarketType } from "@/types/match";

/** Registry 內 Rule 的唯一識別名稱。 */
export type RuleName = "MoneylineHandicapRule" | "HandicapTotalGoalsRule";

/** Cross-market Rule 的統一輸出形狀（對應現有 analysis rules）。 */
export interface CrossMarketRuleOutput {
  consistent: boolean;
  strength: string;
  reason: string;
}

/**
 * 可註冊、可驗證的 Rule 定義。
 * Analysis Engine 未來應透過 Registry + Enablement 使用，而非直接引用 rule 函式。
 */
export interface Rule {
  readonly name: RuleName;
  readonly displayName: string;
  readonly description: string;
  readonly requiredMarkets: readonly MarketType[];
  canApply(match: HistoricalMatchRecord): boolean;
  evaluate(match: HistoricalMatchRecord): CrossMarketRuleOutput | null;
}

export type RegisteredRule = Rule;
