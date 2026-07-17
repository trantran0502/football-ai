import { clampMarketScore } from "../marketScore";
import type { ScoreBreakdownEntry } from "../rules/ruleTypes";
import { evaluatePatternMatch, MARKET_PATTERN_DEFINITIONS } from "./patternDefinitions";
import type {
  MarketPatternMatch,
  PatternAuditEntry,
  PatternEngineResult,
  PatternMatchContext,
} from "./patternTypes";

export function runMarketPatternEngine(
  context: PatternMatchContext,
  scoreAfterRules: number,
  ruleScoreBreakdown: ScoreBreakdownEntry[]
): PatternEngineResult {
  const matchedPatterns: MarketPatternMatch[] = [];
  const patternAudit: PatternAuditEntry[] = [];

  for (const definition of MARKET_PATTERN_DEFINITIONS) {
    if (definition.marketType !== "ALL" && definition.marketType !== context.marketType) {
      continue;
    }

    const evaluation = evaluatePatternMatch(definition, context);
    const patternResult: MarketPatternMatch = {
      id: definition.id,
      name: definition.name,
      matchedRules: evaluation.matchedRules,
      matchScore: evaluation.matched ? definition.matchScore : 0,
      confidenceAdjustment: evaluation.matched ? definition.confidenceAdjustment : 0,
      recommendationAdjustment: evaluation.matched
        ? definition.recommendationAdjustment
        : 0,
      reason: evaluation.reason,
      matched: evaluation.matched,
    };

    patternAudit.push({
      patternId: definition.id,
      patternName: definition.name,
      matched: evaluation.matched,
      reason: evaluation.reason,
      matchedRules: evaluation.matchedRules,
      matchScore: patternResult.matchScore,
      confidenceAdjustment: patternResult.confidenceAdjustment,
    });

    if (evaluation.matched) {
      matchedPatterns.push(patternResult);
    }
  }

  const patternAdjustment = matchedPatterns.reduce(
    (sum, pattern) => sum + pattern.matchScore,
    0
  );
  const patternScore = patternAdjustment;
  const patternConfidenceAdjustment = matchedPatterns.reduce(
    (sum, pattern) => sum + pattern.confidenceAdjustment,
    0
  );

  const scoreBreakdown: ScoreBreakdownEntry[] = [...ruleScoreBreakdown];
  let runningScore = scoreAfterRules;

  for (const pattern of matchedPatterns) {
    runningScore += pattern.matchScore;
    scoreBreakdown.push({
      step: pattern.name,
      scoreAdjustment: pattern.matchScore,
      runningScore,
      reason: pattern.reason,
    });
  }

  const finalScore = clampMarketScore(runningScore);
  scoreBreakdown.push({
    step: "Final",
    scoreAdjustment: finalScore - runningScore,
    runningScore: finalScore,
    reason: "Final market score after rules and patterns.",
  });

  return {
    matchedPatterns,
    patternAudit,
    patternScore,
    patternAdjustment,
    patternConfidenceAdjustment,
    scoreBreakdown,
    finalScore,
  };
}
