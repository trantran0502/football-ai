import {
  createRuleSignal,
  findHighestImpliedSide,
  findLowestWaterSide,
} from "./ruleHelpers";
import type { MarketRule, MarketRuleContext } from "./ruleTypes";

export const FavoriteBiasRule: MarketRule = {
  id: "FavoriteBiasRule",
  name: "Favorite Bias",
  evaluate(context: MarketRuleContext) {
    const favorite = findHighestImpliedSide(context);
    const lowestWater = findLowestWaterSide(context);
    const triggered =
      favorite !== undefined &&
      lowestWater !== undefined &&
      favorite.side === lowestWater.side &&
      favorite.waterLevel === "low";

    return createRuleSignal({
      id: "FavoriteBiasRule",
      name: "Favorite Bias",
      marketType: context.marketType,
      scoreAdjustment: triggered ? -4 : 0,
      confidenceAdjustment: triggered ? -0.04 : 0,
      severity: triggered ? "warning" : "info",
      triggered,
      reason: triggered
        ? `Favorite ${favorite.side} priced at low water (${favorite.rawOdds.toFixed(2)}).`
        : "No favorite bias detected.",
      metadata: {
        favoriteSide: favorite?.side ?? null,
        favoriteWater: favorite?.rawOdds ?? null,
        favoriteImplied: favorite?.impliedProbability ?? null,
      },
    });
  },
};
