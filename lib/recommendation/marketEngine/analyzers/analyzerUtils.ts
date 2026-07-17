import type { MarketSelection } from "@/types/match";
import type { MarketHistoryProvider } from "../marketHistoryProvider";
import type {
  MarketAnalysis,
  MarketEngineType,
  MarketRecommendation,
} from "../marketEngineTypes";
import { evaluateMarketOddsRules } from "../marketOddsRules";
import { runMarketPatternEngine } from "../patterns/patternEngine";
import { runMarketRuleEngine } from "../rules/ruleEngine";
import {
  deriveRiskLevel,
  scoreToConfidence,
} from "../marketScore";

export function groupSelectionsByLine(
  selections: MarketSelection[]
): Map<string, MarketSelection[]> {
  const groups = new Map<string, MarketSelection[]>();

  for (const selection of selections) {
    const key = `${selection.period}|${selection.line ?? "null"}`;
    const list = groups.get(key) ?? [];
    list.push(selection);
    groups.set(key, list);
  }

  return groups;
}

export function pickPrimaryMarketGroup(
  selections: MarketSelection[]
): MarketSelection[] {
  const groups = [...groupSelectionsByLine(selections).values()];
  if (groups.length === 0) {
    return [];
  }

  return groups.sort((left, right) => right.length - left.length)[0];
}

export function buildMarketAnalysis(
  marketType: MarketEngineType,
  selections: MarketSelection[],
  historyProvider: MarketHistoryProvider,
  recommendationBuilder: (
    selections: MarketSelection[],
    rules: ReturnType<typeof evaluateMarketOddsRules>
  ) => MarketRecommendation
): MarketAnalysis | null {
  const group = pickPrimaryMarketGroup(selections);
  if (group.length === 0) {
    return null;
  }

  const oddsContext = evaluateMarketOddsRules(group);
  if (oddsContext.selections.length === 0) {
    return null;
  }

  const ruleContext = {
    marketType,
    selections: group,
    oddsContext,
  };

  const ruleEngineResult = runMarketRuleEngine(ruleContext);
  const patternEngineResult = runMarketPatternEngine(
    {
      marketType,
      selections: group,
      oddsContext,
      ruleResults: ruleEngineResult.ruleResults,
    },
    ruleEngineResult.scoreAfterRules,
    ruleEngineResult.scoreBreakdown
  );

  const finalScore = patternEngineResult.finalScore;
  const confidence = scoreToConfidence(
    finalScore,
    ruleEngineResult.totalConfidenceAdjustment +
      patternEngineResult.patternConfidenceAdjustment
  );
  const historical = historyProvider.getHistoricalPattern({
    marketType,
    line: group[0]?.line ?? null,
    period: group[0]?.period,
  });

  const reasons: string[] = [
    `Current market pattern: ${oddsContext.pattern}.`,
    `Water level: ${oddsContext.waterLevel}.`,
  ];

  if (oddsContext.oddsDiff !== null) {
    reasons.push(`Odds difference between sides: ${oddsContext.oddsDiff.toFixed(3)}.`);
  }
  if (oddsContext.impliedProbDiff !== null) {
    reasons.push(
      `Implied probability gap: ${(oddsContext.impliedProbDiff * 100).toFixed(1)}%.`
    );
  }

  for (const entry of ruleEngineResult.auditLog) {
    if (!entry.triggered) {
      continue;
    }
    const sign = entry.scoreAdjustment >= 0 ? "+" : "";
    reasons.push(`${entry.ruleName}: ${entry.reason} (${sign}${entry.scoreAdjustment})`);
  }

  for (const pattern of patternEngineResult.matchedPatterns) {
    const sign = pattern.matchScore >= 0 ? "+" : "";
    reasons.push(`${pattern.name}: ${pattern.reason} (${sign}${pattern.matchScore})`);
  }

  return {
    marketType,
    confidence,
    marketScore: finalScore,
    baseScore: ruleEngineResult.baseScore,
    finalScore,
    historicalConfidence: historical.confidence,
    historicalSample: historical.sampleSize,
    recommendation: recommendationBuilder(group, oddsContext),
    reasons,
    signals: oddsContext.signals,
    ruleResults: ruleEngineResult.ruleResults,
    scoreBreakdown: patternEngineResult.scoreBreakdown,
    auditLog: ruleEngineResult.auditLog,
    matchedPatterns: patternEngineResult.matchedPatterns,
    patternAudit: patternEngineResult.patternAudit,
    patternScore: patternEngineResult.patternScore,
    patternAdjustment: patternEngineResult.patternAdjustment,
    riskLevel: deriveRiskLevel(finalScore),
    line: group[0]?.line ?? null,
    period: group[0]?.period ?? "full",
  };
}
