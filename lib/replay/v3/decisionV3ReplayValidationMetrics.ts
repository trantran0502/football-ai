import type { BetResult } from "@/lib/backtest/types";
import type {
  DecisionV3ReplayAgreementMetrics,
  DecisionV3ReplayGroupedMetrics,
  DecisionV3ReplayHeadToHeadMetrics,
  DecisionV3ReplayMatchResult,
  DecisionV3ReplayPerformanceMetrics,
  DecisionV3ReplayValidationVerdict,
} from "@/lib/replay/v3/decisionV3ReplayValidationTypes";
import {
  computeMaxDrawdown,
  isBetSettlement,
  isWinningBetResult,
} from "@/lib/replay/v3/decisionV3ReplayValidationSettlement";

const MIN_GROUP_SAMPLE = 30;

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function emptyPerformanceMetrics(): DecisionV3ReplayPerformanceMetrics {
  return {
    bets: 0,
    passes: 0,
    wins: 0,
    halfWins: 0,
    pushes: 0,
    halfLosses: 0,
    losses: 0,
    hitRate: 0,
    roi: 0,
    netUnits: 0,
    averageOdds: 0,
    maxDrawdown: 0,
  };
}

function accumulateBetResult(
  metrics: DecisionV3ReplayPerformanceMetrics,
  result: BetResult | "PASS",
  profit: number,
  odds: number | null,
  stake: number
): void {
  if (result === "PASS") {
    metrics.passes += 1;
    return;
  }

  metrics.bets += 1;
  switch (result) {
    case "WIN":
      metrics.wins += 1;
      break;
    case "HALF_WIN":
      metrics.halfWins += 1;
      break;
    case "PUSH":
      metrics.pushes += 1;
      break;
    case "HALF_LOSE":
      metrics.halfLosses += 1;
      break;
    case "LOSE":
      metrics.losses += 1;
      break;
  }

  metrics.netUnits += profit;
  if (odds !== null && Number.isFinite(odds)) {
    metrics.averageOdds =
      metrics.bets === 1
        ? odds
        : (metrics.averageOdds * (metrics.bets - 1) + odds) / metrics.bets;
  }
}

function finalizePerformanceMetrics(
  metrics: DecisionV3ReplayPerformanceMetrics,
  profits: number[],
  totalStakeUnits: number
): DecisionV3ReplayPerformanceMetrics {
  const hitAttempts =
    metrics.wins + metrics.halfWins + metrics.losses + metrics.halfLosses;
  metrics.hitRate = hitAttempts > 0 ? round((metrics.wins + metrics.halfWins) / hitAttempts) : 0;
  metrics.roi = totalStakeUnits > 0 ? round(metrics.netUnits / totalStakeUnits) : 0;
  metrics.maxDrawdown = computeMaxDrawdown(profits);
  metrics.netUnits = round(metrics.netUnits);
  metrics.averageOdds = round(metrics.averageOdds);
  return metrics;
}

function buildSidePerformance(
  matchResults: DecisionV3ReplayMatchResult[],
  side: "legacy" | "decision"
): DecisionV3ReplayPerformanceMetrics {
  const metrics = emptyPerformanceMetrics();
  const profits: number[] = [];
  let totalStakeUnits = 0;

  for (const match of matchResults) {
    const settlement =
      side === "legacy" ? match.legacySettlement : match.decisionSettlement;
    accumulateBetResult(
      metrics,
      settlement.betResult,
      settlement.profit,
      settlement.odds,
      settlement.stake
    );

    if (settlement.betResult !== "PASS") {
      profits.push(settlement.profit);
      totalStakeUnits += settlement.stake;
    }
  }

  return finalizePerformanceMetrics(metrics, profits, totalStakeUnits);
}

function isLegacyBet(match: DecisionV3ReplayMatchResult): boolean {
  return match.legacySettlement.betResult !== "PASS";
}

function isDecisionBet(match: DecisionV3ReplayMatchResult): boolean {
  return match.decisionSettlement.betResult !== "PASS";
}

export function buildAgreementMetrics(
  matchResults: DecisionV3ReplayMatchResult[]
): DecisionV3ReplayAgreementMetrics {
  if (matchResults.length === 0) {
    return {
      directionAgreementRate: 0,
      marketAgreementRate: 0,
      confidenceAgreementRate: 0,
      candidateChangedRate: 0,
      overallAgreementRate: 0,
      legacyOnlyBetCount: 0,
      decisionOnlyBetCount: 0,
      bothBetCount: 0,
      bothPassCount: 0,
    };
  }

  let directionAgreement = 0;
  let marketAgreement = 0;
  let confidenceAgreement = 0;
  let candidateChanged = 0;
  let overallAgreement = 0;
  let legacyOnlyBetCount = 0;
  let decisionOnlyBetCount = 0;
  let bothBetCount = 0;
  let bothPassCount = 0;

  for (const match of matchResults) {
    const agreement = match.comparison.agreement;
    if (agreement.directionAgreement) directionAgreement += 1;
    if (agreement.marketAgreement) marketAgreement += 1;
    if (agreement.confidenceAgreement) confidenceAgreement += 1;
    if (agreement.candidateChanged) candidateChanged += 1;
    if (agreement.agreement) overallAgreement += 1;

    const legacyBet = isLegacyBet(match);
    const decisionBet = isDecisionBet(match);
    if (legacyBet && decisionBet) bothBetCount += 1;
    if (legacyBet && !decisionBet) legacyOnlyBetCount += 1;
    if (!legacyBet && decisionBet) decisionOnlyBetCount += 1;
    if (!legacyBet && !decisionBet) bothPassCount += 1;
  }

  const total = matchResults.length;
  return {
    directionAgreementRate: round(directionAgreement / total),
    marketAgreementRate: round(marketAgreement / total),
    confidenceAgreementRate: round(confidenceAgreement / total),
    candidateChangedRate: round(candidateChanged / total),
    overallAgreementRate: round(overallAgreement / total),
    legacyOnlyBetCount,
    decisionOnlyBetCount,
    bothBetCount,
    bothPassCount,
  };
}

export function buildHeadToHeadMetrics(
  matchResults: DecisionV3ReplayMatchResult[]
): DecisionV3ReplayHeadToHeadMetrics {
  const metrics: DecisionV3ReplayHeadToHeadMetrics = {
    bothBetLegacyWonDecisionLost: 0,
    bothBetDecisionWonLegacyLost: 0,
    bothWon: 0,
    bothLost: 0,
    scoreDiffDistribution: {},
  };

  for (const match of matchResults) {
    if (!isLegacyBet(match) || !isDecisionBet(match)) {
      continue;
    }

    const legacySettlement = match.legacySettlement;
    const decisionSettlement = match.decisionSettlement;
    if (!isBetSettlement(legacySettlement) || !isBetSettlement(decisionSettlement)) {
      continue;
    }

    const legacyWon = isWinningBetResult(legacySettlement.betResult);
    const decisionWon = isWinningBetResult(decisionSettlement.betResult);

    if (legacyWon && decisionWon) metrics.bothWon += 1;
    if (!legacyWon && !decisionWon) metrics.bothLost += 1;
    if (legacyWon && !decisionWon) metrics.bothBetLegacyWonDecisionLost += 1;
    if (!legacyWon && decisionWon) metrics.bothBetDecisionWonLegacyLost += 1;

    const diffBucket = String(
      round(decisionSettlement.profit - legacySettlement.profit, 2)
    );
    metrics.scoreDiffDistribution[diffBucket] =
      (metrics.scoreDiffDistribution[diffBucket] ?? 0) + 1;
  }

  return metrics;
}

function buildGroupedBucket(
  matchResults: DecisionV3ReplayMatchResult[],
  selector: (match: DecisionV3ReplayMatchResult) => string,
  side: "legacy" | "decision"
): Record<string, DecisionV3ReplayGroupedMetrics> {
  const buckets = new Map<string, DecisionV3ReplayMatchResult[]>();

  for (const match of matchResults) {
    const key = selector(match);
    const current = buckets.get(key) ?? [];
    current.push(match);
    buckets.set(key, current);
  }

  const grouped: Record<string, DecisionV3ReplayGroupedMetrics> = {};
  for (const [key, entries] of buckets.entries()) {
    grouped[key] = buildGroupedMetrics(entries, side);
  }

  return grouped;
}

function buildGroupedMetrics(
  matchResults: DecisionV3ReplayMatchResult[],
  side: "legacy" | "decision"
): DecisionV3ReplayGroupedMetrics {
  const performance = buildSidePerformance(matchResults, side);
  const sampleSize = matchResults.length;
  const insufficient = sampleSize < MIN_GROUP_SAMPLE;

  return {
    sampleSize,
    hitRate: insufficient ? 0 : performance.hitRate,
    roi: insufficient ? 0 : performance.roi,
    netUnits: insufficient ? 0 : performance.netUnits,
    status: insufficient ? "insufficient_sample" : "ok",
  };
}

export function buildGroupedReport(matchResults: DecisionV3ReplayMatchResult[]): {
  byMarketType: Record<string, DecisionV3ReplayGroupedMetrics>;
  byLeague: Record<string, DecisionV3ReplayGroupedMetrics>;
  byDecisionLevel: Record<string, DecisionV3ReplayGroupedMetrics>;
  byConfidence: Record<string, DecisionV3ReplayGroupedMetrics>;
  byEvidenceCompleteness: Record<string, DecisionV3ReplayGroupedMetrics>;
  byProviderConfidence: Record<string, DecisionV3ReplayGroupedMetrics>;
  byRuntimeWeightSource: Record<string, DecisionV3ReplayGroupedMetrics>;
  byDataSource: Record<string, DecisionV3ReplayGroupedMetrics>;
} {
  return {
    byMarketType: buildGroupedBucket(
      matchResults,
      (match) => match.decisionSettlement.marketType ?? "unknown",
      "decision"
    ),
    byLeague: buildGroupedBucket(matchResults, (match) => match.league, "decision"),
    byDecisionLevel: buildGroupedBucket(
      matchResults,
      (match) => match.decisionOutcome.decision,
      "decision"
    ),
    byConfidence: buildGroupedBucket(
      matchResults,
      (match) => match.decisionOutcome.confidence,
      "decision"
    ),
    byEvidenceCompleteness: buildGroupedBucket(matchResults, (match) => {
      const total = match.evidenceCollectedCount + match.evidenceMissingCount;
      if (total === 0) return "0/0";
      return `${match.evidenceCollectedCount}/${total}`;
    }, "decision"),
    byProviderConfidence: buildGroupedBucket(matchResults, (match) => {
      if (match.providerConfidence === null) return "unknown";
      if (match.providerConfidence < 0.34) return "low";
      if (match.providerConfidence < 0.67) return "medium";
      return "high";
    }, "decision"),
    byRuntimeWeightSource: buildGroupedBucket(
      matchResults,
      (match) => match.runtimeWeightSource,
      "decision"
    ),
    byDataSource: buildGroupedBucket(
      matchResults,
      (match) => match.dataSource,
      "decision"
    ),
  };
}

export function buildPerformanceMetrics(
  matchResults: DecisionV3ReplayMatchResult[]
): {
  legacy: DecisionV3ReplayPerformanceMetrics;
  decisionV3: DecisionV3ReplayPerformanceMetrics;
} {
  return {
    legacy: buildSidePerformance(matchResults, "legacy"),
    decisionV3: buildSidePerformance(matchResults, "decision"),
  };
}

export function resolveValidationVerdict(input: {
  eligibleRecords: number;
  legacy: DecisionV3ReplayPerformanceMetrics;
  decisionV3: DecisionV3ReplayPerformanceMetrics;
  grouped: ReturnType<typeof buildGroupedReport>;
  leakageExcluded: number;
}): { verdict: DecisionV3ReplayValidationVerdict; notes: string[] } {
  const notes: string[] = [];

  if (input.eligibleRecords < 100) {
    notes.push(`Eligible records (${input.eligibleRecords}) below minimum threshold of 100.`);
    return { verdict: "INSUFFICIENT_DATA", notes };
  }

  if (input.eligibleRecords < 500) {
    notes.push(`Eligible records (${input.eligibleRecords}) below formal threshold of 500.`);
    notes.push("Outcome is preliminary only; do not promote Decision V3.");
    return { verdict: "PRELIMINARY", notes };
  }

  if (input.leakageExcluded > 0) {
    notes.push("Leakage violations detected; Decision V3 cannot be promoted.");
    return { verdict: "LEGACY_REMAINS_PRIMARY", notes };
  }

  const roiOk = input.decisionV3.roi >= input.legacy.roi;
  const drawdownOk = input.decisionV3.maxDrawdown <= input.legacy.maxDrawdown * 1.25;
  const sampleOk = input.decisionV3.bets >= 100;

  const brokenGroups = Object.entries(input.grouped.byMarketType).filter(
    ([, bucket]) => bucket.status === "ok" && bucket.roi < -0.2
  );

  if (!roiOk) notes.push("Decision V3 ROI is below Legacy ROI.");
  if (!drawdownOk) notes.push("Decision V3 max drawdown is materially worse than Legacy.");
  if (!sampleOk) notes.push("Decision V3 bet sample size is below 100.");
  if (brokenGroups.length > 0) {
    notes.push(`Market groups with severe ROI degradation: ${brokenGroups.map(([key]) => key).join(", ")}`);
  }

  if (roiOk && drawdownOk && sampleOk && brokenGroups.length === 0) {
    notes.push("Decision V3 meets formal candidate thresholds on historical replay.");
    notes.push("This does not switch Production primary; manual promotion required.");
    return { verdict: "DECISION_CANDIDATE", notes };
  }

  notes.push("Legacy remains primary based on replay validation guardrails.");
  return { verdict: "LEGACY_REMAINS_PRIMARY", notes };
}
