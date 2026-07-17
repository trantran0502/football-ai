import {
  collectMatchedRules,
  findFavoriteSide,
  findUnderdogSide,
  hasHighWaterOnSide,
  hasLowWaterOnSide,
  isRuleTriggered,
  requiredRulesTriggered,
  sumRequiredRuleScores,
} from "./patternHelpers";
import type { MarketPatternDefinition } from "./patternTypes";

function buildDefinition(
  partial: Omit<MarketPatternDefinition, "matches" | "buildReason"> & {
    matches: (context: import("./patternTypes").PatternMatchContext) => boolean;
    buildReason: (
      context: import("./patternTypes").PatternMatchContext,
      matchedRules: string[]
    ) => string;
  }
): MarketPatternDefinition {
  return partial;
}

export const HomeLowWaterBalanced: MarketPatternDefinition = buildDefinition({
  id: "HomeLowWaterBalanced",
  name: "Home Low Water Balanced",
  marketType: "ALL",
  requiredRules: ["LowWaterRule", "BalancedMarketRule"],
  optionalRules: [],
  minimumScore: 4,
  description: "Home side sits on low water within a balanced market.",
  matchScore: 5,
  confidenceAdjustment: 0.05,
  recommendationAdjustment: 1,
  matches(context) {
    if (!requiredRulesTriggered(context, this.requiredRules)) {
      return false;
    }
    if (sumRequiredRuleScores(context.ruleResults, this.requiredRules) < this.minimumScore) {
      return false;
    }
    return hasLowWaterOnSide(context, "home");
  },
  buildReason(_context, matchedRules) {
    return `Home low water with balanced market (${matchedRules.join(" + ")}).`;
  },
});

export const HomeLowWaterFavorite: MarketPatternDefinition = buildDefinition({
  id: "HomeLowWaterFavorite",
  name: "Home Low Water Favorite",
  marketType: "ALL",
  requiredRules: ["LowWaterRule", "FavoriteBiasRule"],
  optionalRules: [],
  minimumScore: 0,
  description: "Home favorite priced with low water.",
  matchScore: 3,
  confidenceAdjustment: -0.02,
  recommendationAdjustment: -1,
  matches(context) {
    if (!requiredRulesTriggered(context, this.requiredRules)) {
      return false;
    }
    return findFavoriteSide(context) === "home" && hasLowWaterOnSide(context, "home");
  },
  buildReason(_context, matchedRules) {
    return `Home favorite on low water (${matchedRules.join(" + ")}).`;
  },
});

export const AwayHighWaterValue: MarketPatternDefinition = buildDefinition({
  id: "AwayHighWaterValue",
  name: "Away High Water Value",
  marketType: "ALL",
  requiredRules: ["HighWaterRule", "UnderdogValueRule"],
  optionalRules: [],
  minimumScore: 2,
  description: "Away underdog carries high-water value pricing.",
  matchScore: 4,
  confidenceAdjustment: 0.04,
  recommendationAdjustment: 1,
  matches(context) {
    if (!requiredRulesTriggered(context, this.requiredRules)) {
      return false;
    }
    return (
      hasHighWaterOnSide(context, "away") ||
      findUnderdogSide(context) === "away"
    );
  },
  buildReason(_context, matchedRules) {
    return `Away high-water value setup (${matchedRules.join(" + ")}).`;
  },
});

export const BalancedFavorite: MarketPatternDefinition = buildDefinition({
  id: "BalancedFavorite",
  name: "Balanced Favorite",
  marketType: "ALL",
  requiredRules: ["BalancedMarketRule"],
  optionalRules: ["FavoriteBiasRule"],
  minimumScore: 3,
  description: "Balanced market with a clear favorite side.",
  matchScore: 3,
  confidenceAdjustment: 0.03,
  recommendationAdjustment: 0,
  matches(context) {
    if (!requiredRulesTriggered(context, this.requiredRules)) {
      return false;
    }
    return findFavoriteSide(context) !== null;
  },
  buildReason(context, matchedRules) {
    return `Balanced market leaning ${findFavoriteSide(context)} (${matchedRules.join(" + ")}).`;
  },
});

export const BalancedUnderdog: MarketPatternDefinition = buildDefinition({
  id: "BalancedUnderdog",
  name: "Balanced Underdog",
  marketType: "ALL",
  requiredRules: ["BalancedMarketRule", "UnderdogValueRule"],
  optionalRules: [],
  minimumScore: 3,
  description: "Balanced market with underdog value.",
  matchScore: 4,
  confidenceAdjustment: 0.04,
  recommendationAdjustment: 1,
  matches(context) {
    return requiredRulesTriggered(context, this.requiredRules);
  },
  buildReason(_context, matchedRules) {
    return `Balanced market with underdog value (${matchedRules.join(" + ")}).`;
  },
});

export const ExtremeFavorite: MarketPatternDefinition = buildDefinition({
  id: "ExtremeFavorite",
  name: "Extreme Favorite",
  marketType: "ALL",
  requiredRules: ["ExtremeMarketRule", "FavoriteBiasRule"],
  optionalRules: [],
  minimumScore: -9,
  description: "Extreme favorite pricing with favorite bias.",
  matchScore: -4,
  confidenceAdjustment: -0.06,
  recommendationAdjustment: -2,
  matches(context) {
    return requiredRulesTriggered(context, this.requiredRules);
  },
  buildReason(_context, matchedRules) {
    return `Extreme favorite pricing detected (${matchedRules.join(" + ")}).`;
  },
});

export const ExtremeUnderdog: MarketPatternDefinition = buildDefinition({
  id: "ExtremeUnderdog",
  name: "Extreme Underdog",
  marketType: "ALL",
  requiredRules: ["ExtremeMarketRule", "UnderdogValueRule"],
  optionalRules: [],
  minimumScore: -5,
  description: "Extreme market with underdog value opportunity.",
  matchScore: 2,
  confidenceAdjustment: 0.02,
  recommendationAdjustment: 1,
  matches(context) {
    return requiredRulesTriggered(context, this.requiredRules);
  },
  buildReason(_context, matchedRules) {
    return `Extreme market underdog value (${matchedRules.join(" + ")}).`;
  },
});

export const LowOverroundBalanced: MarketPatternDefinition = buildDefinition({
  id: "LowOverroundBalanced",
  name: "Low Overround Balanced",
  marketType: "ALL",
  requiredRules: ["OverroundRule", "BalancedMarketRule"],
  optionalRules: [],
  minimumScore: 2,
  description: "Low overround within a balanced market.",
  matchScore: 4,
  confidenceAdjustment: 0.04,
  recommendationAdjustment: 1,
  matches(context) {
    if (!requiredRulesTriggered(context, this.requiredRules)) {
      return false;
    }
    const overroundRule = context.ruleResults.find((rule) => rule.id === "OverroundRule");
    return (overroundRule?.scoreAdjustment ?? 0) > 0;
  },
  buildReason(_context, matchedRules) {
    return `Low overround balanced market (${matchedRules.join(" + ")}).`;
  },
});

export const HighOverroundRisk: MarketPatternDefinition = buildDefinition({
  id: "HighOverroundRisk",
  name: "High Overround Risk",
  marketType: "ALL",
  requiredRules: ["OverroundRule"],
  optionalRules: ["OddsGapRule"],
  minimumScore: -3,
  description: "High overround signals elevated book margin risk.",
  matchScore: -3,
  confidenceAdjustment: -0.04,
  recommendationAdjustment: -1,
  matches(context) {
    if (!isRuleTriggered(context.ruleResults, "OverroundRule")) {
      return false;
    }
    const overroundRule = context.ruleResults.find((rule) => rule.id === "OverroundRule");
    return (overroundRule?.scoreAdjustment ?? 0) < 0;
  },
  buildReason(_context, matchedRules) {
    return `High overround risk profile (${matchedRules.join(" + ")}).`;
  },
});

export const TrapCandidate: MarketPatternDefinition = buildDefinition({
  id: "TrapCandidate",
  name: "Trap Candidate",
  marketType: "ALL",
  requiredRules: ["TrapLineRule"],
  optionalRules: ["LowWaterRule"],
  minimumScore: -6,
  description: "Trap line pattern with optional low-water confirmation.",
  matchScore: -5,
  confidenceAdjustment: -0.05,
  recommendationAdjustment: -2,
  matches(context) {
    return requiredRulesTriggered(context, this.requiredRules);
  },
  buildReason(_context, matchedRules) {
    return `Trap candidate pattern (${matchedRules.join(" + ")}).`;
  },
});

export const MARKET_PATTERN_DEFINITIONS: MarketPatternDefinition[] = [
  HomeLowWaterBalanced,
  HomeLowWaterFavorite,
  AwayHighWaterValue,
  BalancedFavorite,
  BalancedUnderdog,
  ExtremeFavorite,
  ExtremeUnderdog,
  LowOverroundBalanced,
  HighOverroundRisk,
  TrapCandidate,
];

export function getPatternDefinitionById(
  patternId: string
): MarketPatternDefinition | undefined {
  return MARKET_PATTERN_DEFINITIONS.find((pattern) => pattern.id === patternId);
}

export function listPatternIds(): string[] {
  return MARKET_PATTERN_DEFINITIONS.map((pattern) => pattern.id);
}

export function evaluatePatternMatch(
  definition: MarketPatternDefinition,
  context: import("./patternTypes").PatternMatchContext
): { matched: boolean; matchedRules: string[]; reason: string } {
  const matchedRules = collectMatchedRules(
    context,
    definition.requiredRules,
    definition.optionalRules
  );

  if (!definition.matches(context)) {
    const missingRules = definition.requiredRules.filter(
      (ruleId) => !matchedRules.includes(ruleId)
    );
    return {
      matched: false,
      matchedRules,
      reason:
        missingRules.length > 0
          ? `Missing required rules: ${missingRules.join(", ")}.`
          : "Pattern conditions not met.",
    };
  }

  return {
    matched: true,
    matchedRules,
    reason: definition.buildReason(context, matchedRules),
  };
}
