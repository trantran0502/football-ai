import { clampMarketScore, MARKET_ENGINE_BASE_SCORE } from "../marketScore";
import { MARKET_RULE_REGISTRY } from "./ruleRegistry";
import type {
  MarketRuleAuditEntry,
  MarketRuleContext,
  MarketRuleEngineResult,
  MarketRuleSignal,
  ScoreBreakdownEntry,
} from "./ruleTypes";

function toAuditEntry(signal: MarketRuleSignal): MarketRuleAuditEntry {
  return {
    ruleId: signal.id,
    ruleName: signal.name,
    triggered: signal.triggered,
    scoreAdjustment: signal.scoreAdjustment,
    confidenceAdjustment: signal.confidenceAdjustment,
    reason: signal.reason,
    metadata: signal.metadata,
  };
}

export function runMarketRuleEngine(context: MarketRuleContext): MarketRuleEngineResult {
  const ruleResults = MARKET_RULE_REGISTRY.map((rule) => rule.evaluate(context));
  const auditLog = ruleResults.map(toAuditEntry);

  const baseScore = MARKET_ENGINE_BASE_SCORE;
  const scoreBreakdown: ScoreBreakdownEntry[] = [
    {
      step: "Base Score",
      scoreAdjustment: 0,
      runningScore: baseScore,
      reason: "Market engine starting score.",
    },
  ];

  let runningScore = baseScore;
  for (const signal of ruleResults) {
    if (!signal.triggered || signal.scoreAdjustment === 0) {
      continue;
    }

    runningScore += signal.scoreAdjustment;
    scoreBreakdown.push({
      step: signal.name,
      scoreAdjustment: signal.scoreAdjustment,
      runningScore,
      reason: signal.reason,
    });
  }

  const finalScore = clampMarketScore(runningScore);
  scoreBreakdown.push({
    step: "Final",
    scoreAdjustment: finalScore - runningScore,
    runningScore: finalScore,
    reason: "Clamped to 0-100 range.",
  });

  const totalConfidenceAdjustment = ruleResults.reduce(
    (sum, signal) => sum + (signal.triggered ? signal.confidenceAdjustment : 0),
    0
  );

  return {
    ruleResults,
    auditLog,
    scoreBreakdown,
    baseScore,
    finalScore,
    totalConfidenceAdjustment,
  };
}
