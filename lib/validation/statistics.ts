import type { BetResult } from "@/lib/backtest/types";
import type {
  RecommendationValidationEntry,
  RecommendationValidationEvaluation,
  ValidationMarketKey,
  ValidationMetricBucket,
  ValidationReport,
} from "@/lib/validation/validationTypes";
import type { RecommendationLevel } from "@/lib/recommendation/recommendationTypes";

const CONFIDENCE_SCORE: Record<RecommendationLevel, number> = {
  pass: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const MARKET_KEYS: ValidationMarketKey[] = [
  "Moneyline",
  "Handicap",
  "OverUnder",
  "BTTS",
];

const MIN_SAMPLE_SIZE = 5;
const DISABLE_HIT_RATE = 0.4;
const DISABLE_ROI = -0.1;
const INCREASE_HIT_RATE = 0.55;
const INCREASE_ROI = 0.05;

export function createEmptyBucket(): ValidationMetricBucket {
  return {
    sampleSize: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    halfWins: 0,
    halfLoses: 0,
    hitRate: 0,
    roi: 0,
    averageOdds: 0,
    averageConfidence: 0,
    totalProfit: 0,
  };
}

export function accumulateBucket(
  bucket: ValidationMetricBucket,
  evaluation: RecommendationValidationEvaluation
): void {
  bucket.sampleSize += 1;
  bucket.totalProfit += evaluation.profit;

  switch (evaluation.result) {
    case "WIN":
      bucket.wins += 1;
      break;
    case "LOSE":
      bucket.losses += 1;
      break;
    case "PUSH":
      bucket.pushes += 1;
      break;
    case "HALF_WIN":
      bucket.halfWins += 1;
      break;
    case "HALF_LOSE":
      bucket.halfLoses += 1;
      break;
  }
}

export function finalizeBucket(bucket: ValidationMetricBucket): ValidationMetricBucket {
  if (bucket.sampleSize === 0) {
    return bucket;
  }

  const decisive = bucket.sampleSize - bucket.pushes;
  const hits = bucket.wins + bucket.halfWins;
  bucket.hitRate = decisive > 0 ? hits / decisive : 0;
  bucket.roi = bucket.totalProfit / bucket.sampleSize;
  return bucket;
}

function averageField(
  entries: RecommendationValidationEntry[],
  selector: (entry: RecommendationValidationEntry) => number
): number {
  if (entries.length === 0) {
    return 0;
  }
  return entries.reduce((sum, entry) => sum + selector(entry), 0) / entries.length;
}

function buildBucketFromEntries(
  entries: RecommendationValidationEntry[]
): ValidationMetricBucket {
  const bucket = createEmptyBucket();
  for (const entry of entries) {
    accumulateBucket(bucket, entry.evaluation);
  }
  finalizeBucket(bucket);
  bucket.averageOdds = averageField(entries, (entry) => entry.evaluation.odds);
  bucket.averageConfidence = averageField(
    entries,
    (entry) => CONFIDENCE_SCORE[entry.evaluation.confidence]
  );
  return bucket;
}

function countByResult(
  entries: RecommendationValidationEntry[],
  result: BetResult
): number {
  return entries.filter((entry) => entry.evaluation.result === result).length;
}

export function buildValidationReport(
  entries: RecommendationValidationEntry[],
  matchIds: Set<string> = new Set(entries.map((entry) => entry.matchId))
): ValidationReport {
  const byMarket = Object.fromEntries(
    MARKET_KEYS.map((marketKey) => [
      marketKey,
      buildBucketFromEntries(entries.filter((entry) => entry.marketKey === marketKey)),
    ])
  ) as Record<ValidationMarketKey, ValidationMetricBucket>;

  const ruleGroups = groupEntries(entries, (entry) => entry.ruleKeys);
  const featureGroups = groupEntries(entries, (entry) => entry.candidate.supportingFeatures);

  const byRule = Object.fromEntries(
    [...ruleGroups.entries()].map(([rule, ruleEntries]) => [
      rule,
      buildBucketFromEntries(ruleEntries),
    ])
  );

  const byFeature = Object.fromEntries(
    [...featureGroups.entries()].map(([feature, featureEntries]) => [
      feature,
      buildBucketFromEntries(featureEntries),
    ])
  );

  const confidenceDistribution: Record<RecommendationLevel, number> = {
    pass: 0,
    low: 0,
    medium: 0,
    high: 0,
  };
  for (const entry of entries) {
    confidenceDistribution[entry.evaluation.confidence] += 1;
  }

  const overallBucket = buildBucketFromEntries(entries);
  const recommendationsToDisable = buildAdvisoryList(byRule, byMarket, "disable");
  const recommendationsToIncreaseWeight = buildAdvisoryList(
    byRule,
    byMarket,
    "increase"
  );

  return {
    totalMatches: matchIds.size,
    totalRecommendations: entries.length,
    hitRate: overallBucket.hitRate,
    roi: overallBucket.roi,
    byMarket,
    byRule,
    byFeature,
    confidenceDistribution,
    recommendationsToDisable,
    recommendationsToIncreaseWeight,
  };
}

function groupEntries(
  entries: RecommendationValidationEntry[],
  keySelector: (entry: RecommendationValidationEntry) => string[]
): Map<string, RecommendationValidationEntry[]> {
  const groups = new Map<string, RecommendationValidationEntry[]>();
  for (const entry of entries) {
    for (const key of keySelector(entry)) {
      const bucket = groups.get(key) ?? [];
      bucket.push(entry);
      groups.set(key, bucket);
    }
  }
  return groups;
}

function buildAdvisoryList(
  byRule: Record<string, ValidationMetricBucket>,
  byMarket: Record<ValidationMarketKey, ValidationMetricBucket>,
  mode: "disable" | "increase"
): string[] {
  const advisories: string[] = [];

  for (const [rule, bucket] of Object.entries(byRule)) {
    if (bucket.sampleSize < MIN_SAMPLE_SIZE) {
      continue;
    }
    if (
      mode === "disable" &&
      (bucket.hitRate < DISABLE_HIT_RATE || bucket.roi < DISABLE_ROI)
    ) {
      advisories.push(rule);
    }
    if (
      mode === "increase" &&
      bucket.hitRate >= INCREASE_HIT_RATE &&
      bucket.roi > INCREASE_ROI
    ) {
      advisories.push(rule);
    }
  }

  for (const [market, bucket] of Object.entries(byMarket)) {
    if (bucket.sampleSize < MIN_SAMPLE_SIZE) {
      continue;
    }
    const label = `market:${market}`;
    if (
      mode === "disable" &&
      (bucket.hitRate < DISABLE_HIT_RATE || bucket.roi < DISABLE_ROI)
    ) {
      advisories.push(label);
    }
    if (
      mode === "increase" &&
      bucket.hitRate >= INCREASE_HIT_RATE &&
      bucket.roi > INCREASE_ROI
    ) {
      advisories.push(label);
    }
  }

  return [...new Set(advisories)];
}

export function summarizeSettlementCounts(entries: RecommendationValidationEntry[]): {
  wins: number;
  losses: number;
  pushes: number;
  halfWins: number;
  halfLoses: number;
} {
  return {
    wins: countByResult(entries, "WIN"),
    losses: countByResult(entries, "LOSE"),
    pushes: countByResult(entries, "PUSH"),
    halfWins: countByResult(entries, "HALF_WIN"),
    halfLoses: countByResult(entries, "HALF_LOSE"),
  };
}
