import { BalancedMarketRule } from "./balancedMarketRule";
import { ExtremeMarketRule } from "./extremeMarketRule";
import { FavoriteBiasRule } from "./favoriteBiasRule";
import { HighWaterRule } from "./highWaterRule";
import { LowWaterRule } from "./lowWaterRule";
import { OddsGapRule } from "./oddsGapRule";
import { OverroundRule } from "./overroundRule";
import { SharpMoneyRule } from "./sharpMoneyRule";
import { SteamMoveRule } from "./steamMoveRule";
import { TrapLineRule } from "./trapLineRule";
import type { MarketRule } from "./ruleTypes";
import { UnderdogValueRule } from "./underdogValueRule";

export const MARKET_RULE_REGISTRY: MarketRule[] = [
  LowWaterRule,
  HighWaterRule,
  BalancedMarketRule,
  ExtremeMarketRule,
  OverroundRule,
  FavoriteBiasRule,
  UnderdogValueRule,
  OddsGapRule,
  SteamMoveRule,
  SharpMoneyRule,
  TrapLineRule,
];

export function getMarketRuleById(ruleId: string): MarketRule | undefined {
  return MARKET_RULE_REGISTRY.find((rule) => rule.id === ruleId);
}

export function listMarketRuleIds(): string[] {
  return MARKET_RULE_REGISTRY.map((rule) => rule.id);
}
