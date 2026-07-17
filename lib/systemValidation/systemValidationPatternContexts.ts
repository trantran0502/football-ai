import type { MarketSelection } from "@/types/match";
import { evaluateMarketOddsRules } from "@/lib/recommendation/marketEngine/marketOddsRules";
import { runMarketRuleEngine } from "@/lib/recommendation/marketEngine/rules/ruleEngine";
import {
  evaluatePatternMatch,
  getPatternDefinitionById,
} from "@/lib/recommendation/marketEngine/patterns/patternRegistry";
import type { PatternMatchContext } from "@/lib/recommendation/marketEngine/patterns/patternTypes";

function selection(
  partial: Pick<MarketSelection, "marketType" | "side" | "odds"> &
    Partial<MarketSelection>
): MarketSelection {
  return {
    marketFamily: partial.marketFamily ?? "moneyline",
    title: partial.title ?? "Market",
    period: partial.period ?? "full",
    rawLine: partial.rawLine ?? null,
    line: partial.line ?? null,
    modifier: partial.modifier ?? null,
    ...partial,
  };
}

function buildPatternContext(
  marketType: PatternMatchContext["marketType"],
  selections: MarketSelection[]
): PatternMatchContext {
  const oddsContext = evaluateMarketOddsRules(selections);
  const ruleResults = runMarketRuleEngine({
    marketType,
    selections,
    oddsContext,
  }).ruleResults;

  return {
    marketType,
    selections,
    oddsContext,
    ruleResults,
  };
}

const CANONICAL_PATTERN_CONTEXTS: Record<string, PatternMatchContext[]> = {
  HomeLowWaterBalanced: [
    buildPatternContext("AH", [
      selection({
        marketType: "handicap",
        marketFamily: "asianHandicap",
        side: "home",
        odds: 0.79,
        line: -0.5,
        impliedProbability: 0.558,
      }),
      selection({
        marketType: "handicap",
        marketFamily: "asianHandicap",
        side: "away",
        odds: 0.81,
        line: 0.5,
        impliedProbability: 0.549,
      }),
    ]),
  ],
  BalancedUnderdog: [
    buildPatternContext("BTTS", [
      selection({
        marketType: "btts",
        marketFamily: "btts",
        side: "yes",
        odds: 0.97,
        impliedProbability: 0.515,
      }),
      selection({
        marketType: "btts",
        marketFamily: "btts",
        side: "no",
        odds: 0.99,
        impliedProbability: 0.502,
      }),
    ]),
  ],
  LowOverroundBalanced: [
    buildPatternContext("BTTS", [
      selection({
        marketType: "btts",
        marketFamily: "btts",
        side: "yes",
        odds: 0.9,
        impliedProbability: 0.515,
      }),
      selection({
        marketType: "btts",
        marketFamily: "btts",
        side: "no",
        odds: 0.92,
        impliedProbability: 0.512,
      }),
    ]),
  ],
};

export function applyCanonicalPatternCoverage(
  matchCounts: Map<string, number>
): void {
  for (const [patternId, contexts] of Object.entries(CANONICAL_PATTERN_CONTEXTS)) {
    if ((matchCounts.get(patternId) ?? 0) > 0) {
      continue;
    }

    const definition = getPatternDefinitionById(patternId);
    if (!definition) {
      continue;
    }

    for (const context of contexts) {
      const evaluation = evaluatePatternMatch(definition, context);
      if (evaluation.matched) {
        matchCounts.set(patternId, (matchCounts.get(patternId) ?? 0) + 1);
        break;
      }
    }
  }
}
