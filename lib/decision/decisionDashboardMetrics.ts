import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { AdminDecisionMetrics, DecisionLevel } from "@/lib/decision/decisionTypes";
import { resolveDecisionScoreTier } from "@/lib/decision/decisionScoring";

const BET_LEVELS = new Set<DecisionLevel>([
  "SMALL BET",
  "NORMAL BET",
  "STRONG BET",
]);

function collectDecisions(records: HistoricalMatchRecord[]) {
  return records
    .map(
      (record) =>
        record.analysisSnapshot?.decision ??
        record.analysisSnapshot?.replay?.decisionReplay?.decision ??
        null
    )
    .filter((decision): decision is NonNullable<typeof decision> => decision !== null);
}

export function buildDecisionDashboardMetrics(
  records: HistoricalMatchRecord[]
): AdminDecisionMetrics {
  const decisions = collectDecisions(records);
  if (decisions.length === 0) {
    return {
      passPercent: 0,
      watchPercent: 0,
      betPercent: 0,
      strongBetPercent: 0,
      averageDecisionScore: 0,
      scoreDistribution: {
        Avoid: 0,
        Weak: 0,
        Average: 0,
        Good: 0,
        Excellent: 0,
      },
      sampleSize: 0,
    };
  }

  const total = decisions.length;
  const passCount = decisions.filter((item) => item.decision === "PASS").length;
  const watchCount = decisions.filter((item) => item.decision === "WATCH").length;
  const betCount = decisions.filter((item) => BET_LEVELS.has(item.decision)).length;
  const strongCount = decisions.filter((item) => item.decision === "STRONG BET").length;

  const scoreDistribution = {
    Avoid: 0,
    Weak: 0,
    Average: 0,
    Good: 0,
    Excellent: 0,
  };
  for (const decision of decisions) {
    scoreDistribution[resolveDecisionScoreTier(decision.decisionScore)] += 1;
  }

  return {
    passPercent: passCount / total,
    watchPercent: watchCount / total,
    betPercent: betCount / total,
    strongBetPercent: strongCount / total,
    averageDecisionScore:
      decisions.reduce((sum, item) => sum + item.decisionScore, 0) / total,
    scoreDistribution,
    sampleSize: total,
  };
}
