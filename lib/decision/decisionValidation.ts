import { calculateProfit } from "@/lib/backtest/betEvaluator";
import { canSettleMarketSelection, settleBet } from "@/lib/backtest/settlement";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type {
  DecisionLevel,
  DecisionResult,
  DecisionValidationEntry,
  DecisionValidationMetrics,
} from "@/lib/decision/decisionTypes";
import { resolveDecisionScoreTier } from "@/lib/decision/decisionScoring";
import type { MatchResult } from "@/lib/database/matchSchema";

const BET_LEVELS = new Set<DecisionLevel>([
  "SMALL BET",
  "NORMAL BET",
  "STRONG BET",
]);

function evaluateDecisionProfit(
  decision: DecisionResult,
  result: MatchResult,
  stake = 1
): { profit: number; hit: boolean } {
  if (
    !decision.selection ||
    !BET_LEVELS.has(decision.decision) ||
    !canSettleMarketSelection(decision.selection, result)
  ) {
    return { profit: 0, hit: false };
  }

  const settlement = settleBet(decision.selection, result);
  const profit = calculateProfit(settlement, decision.selection.odds, stake);
  const hit = settlement === "WIN" || settlement === "HALF_WIN";
  return { profit, hit };
}

export function validateDecisionOnRecord(
  record: HistoricalMatchRecord
): DecisionValidationEntry | null {
  const decision =
    record.analysisSnapshot?.decision ??
    record.analysisSnapshot?.replay?.decisionReplay?.decision ??
    null;
  if (!decision || !record.result) {
    return null;
  }

  const { profit, hit } = evaluateDecisionProfit(decision, record.result);
  return {
    matchId: record.id,
    decision: decision.decision,
    decisionScore: decision.decisionScore,
    profit,
    hit,
    expectedValue: decision.expectedValue,
  };
}

function roiFromEntries(entries: DecisionValidationEntry[]): number {
  if (entries.length === 0) {
    return 0;
  }
  const profit = entries.reduce((sum, entry) => sum + entry.profit, 0);
  return profit / entries.length;
}

function hitRateFromEntries(entries: DecisionValidationEntry[]): number {
  const actionable = entries.filter((entry) => BET_LEVELS.has(entry.decision));
  if (actionable.length === 0) {
    return 0;
  }
  const hits = actionable.filter((entry) => entry.hit).length;
  return hits / actionable.length;
}

export function buildDecisionValidationMetrics(
  records: HistoricalMatchRecord[]
): DecisionValidationMetrics {
  const entries = records
    .map((record) => validateDecisionOnRecord(record))
    .filter((entry): entry is DecisionValidationEntry => entry !== null);

  const distribution: Record<DecisionLevel, number> = {
    PASS: 0,
    WATCH: 0,
    "SMALL BET": 0,
    "NORMAL BET": 0,
    "STRONG BET": 0,
  };

  for (const entry of entries) {
    distribution[entry.decision] += 1;
  }

  const passEntries = entries.filter((entry) => entry.decision === "PASS");
  const watchEntries = entries.filter((entry) => entry.decision === "WATCH");
  const betEntries = entries.filter((entry) => BET_LEVELS.has(entry.decision));
  const strongEntries = entries.filter((entry) => entry.decision === "STRONG BET");

  const tiers = ["Avoid", "Weak", "Average", "Good", "Excellent"] as const;
  const decisionScoreBands = {} as DecisionValidationMetrics["decisionScoreBands"];
  for (const tier of tiers) {
    const tierEntries = entries.filter(
      (entry) => resolveDecisionScoreTier(entry.decisionScore) === tier
    );
    decisionScoreBands[tier] = {
      count: tierEntries.length,
      roi: roiFromEntries(tierEntries),
      hitRate: hitRateFromEntries(tierEntries),
    };
  }

  return {
    passRoi: roiFromEntries(passEntries),
    watchRoi: roiFromEntries(watchEntries),
    betRoi: roiFromEntries(betEntries),
    strongBetRoi: roiFromEntries(strongEntries),
    decisionDistribution: distribution,
    decisionScoreBands,
    sampleSize: entries.length,
  };
}
