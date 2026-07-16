import type {
  RecommendationLearningDashboardData,
  RecommendationLearningMarketKey,
  RecommendationLearningRecord,
  RecommendationLearningWindowStats,
  RecommendationMarketLearningStats,
  RecommendationProviderLearningStats,
} from "@/lib/recommendation/recommendationLearningTypes";

const MARKET_KEYS: RecommendationLearningMarketKey[] = ["1X2", "AH", "O/U", "BTTS"];

const CONFIDENCE_SCORE: Record<string, number> = {
  pass: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function createEmptyProviderStats(providerKey: string): RecommendationProviderLearningStats {
  return {
    providerKey,
    usageCount: 0,
    hitCount: 0,
    hitRate: 0,
    roi: 0,
    averageConfidence: 0,
    totalProfit: 0,
    totalStake: 0,
  };
}

function createEmptyMarketStats(
  marketKey: RecommendationLearningMarketKey
): RecommendationMarketLearningStats {
  return {
    marketKey,
    usageCount: 0,
    hitCount: 0,
    hitRate: 0,
    roi: 0,
    averageConfidence: 0,
    totalProfit: 0,
    totalStake: 0,
  };
}

function finalizeProviderStats(
  stats: RecommendationProviderLearningStats
): RecommendationProviderLearningStats {
  if (stats.usageCount === 0) {
    return stats;
  }
  stats.hitRate = stats.hitCount / stats.usageCount;
  stats.averageConfidence = stats.averageConfidence / stats.usageCount;
  stats.roi = stats.totalStake > 0 ? stats.totalProfit / stats.totalStake : 0;
  return stats;
}

function finalizeMarketStats(
  stats: RecommendationMarketLearningStats
): RecommendationMarketLearningStats {
  if (stats.usageCount === 0) {
    return stats;
  }
  const decisive = stats.usageCount;
  stats.hitRate = stats.hitCount / decisive;
  stats.averageConfidence = stats.averageConfidence / stats.usageCount;
  stats.roi = stats.totalStake > 0 ? stats.totalProfit / stats.totalStake : 0;
  return stats;
}

function accumulateProviderStats(
  records: RecommendationLearningRecord[]
): RecommendationProviderLearningStats[] {
  const byProvider = new Map<string, RecommendationProviderLearningStats>();

  for (const record of records) {
    const usableProviders = record.providerDiagnostics.filter(
      (entry) => entry.providerSource !== "unavailable"
    );
    if (usableProviders.length === 0) {
      continue;
    }

    const totalContribution = usableProviders.reduce(
      (sum, entry) => sum + Math.max(entry.providerContribution, 0),
      0
    );

    for (const provider of usableProviders) {
      const existing =
        byProvider.get(provider.providerKey) ??
        createEmptyProviderStats(provider.providerKey);

      existing.usageCount += 1;
      existing.averageConfidence += provider.providerConfidence;
      if (record.hit) {
        existing.hitCount += 1;
      }

      const share =
        totalContribution > 0
          ? Math.max(provider.providerContribution, 0) / totalContribution
          : 1 / usableProviders.length;
      existing.totalProfit += record.totalProfit * share;
      existing.totalStake += record.totalStake * share;

      byProvider.set(provider.providerKey, existing);
    }
  }

  return [...byProvider.values()]
    .map(finalizeProviderStats)
    .sort((left, right) => {
      if (right.roi !== left.roi) {
        return right.roi - left.roi;
      }
      return right.hitRate - left.hitRate;
    });
}

function accumulateMarketStats(
  records: RecommendationLearningRecord[]
): RecommendationMarketLearningStats[] {
  const byMarket = new Map<RecommendationLearningMarketKey, RecommendationMarketLearningStats>();

  for (const marketKey of MARKET_KEYS) {
    byMarket.set(marketKey, createEmptyMarketStats(marketKey));
  }

  for (const record of records) {
    for (const outcome of record.marketOutcomes) {
      if (outcome.result === "PUSH") {
        continue;
      }

      const existing = byMarket.get(outcome.marketKey)!;
      existing.usageCount += 1;
      existing.totalProfit += outcome.profit;
      existing.totalStake += outcome.stake;
      existing.averageConfidence += CONFIDENCE_SCORE[outcome.confidence] ?? 0;
      if (outcome.hit) {
        existing.hitCount += 1;
      }
      byMarket.set(outcome.marketKey, existing);
    }
  }

  return MARKET_KEYS.map((marketKey) => finalizeMarketStats(byMarket.get(marketKey)!));
}

function buildWindowStats(
  records: RecommendationLearningRecord[],
  windowSize: number | "all"
): RecommendationLearningWindowStats {
  const sampleSize = records.length;
  const decisiveRecords = records.filter((record) => record.totalStake > 0 || record.marketOutcomes.length > 0);
  const hits = decisiveRecords.filter((record) => record.hit).length;
  const totalProfit = records.reduce((sum, record) => sum + record.totalProfit, 0);
  const totalStake = records.reduce((sum, record) => sum + record.totalStake, 0);

  return {
    windowSize,
    sampleSize,
    hitRate: decisiveRecords.length > 0 ? hits / decisiveRecords.length : 0,
    roi: totalStake > 0 ? totalProfit / totalStake : 0,
    providerRanking: accumulateProviderStats(records),
    marketStats: accumulateMarketStats(records),
  };
}

export function sortRecommendationLearningRecords(
  records: RecommendationLearningRecord[]
): RecommendationLearningRecord[] {
  return [...records].sort(
    (left, right) => new Date(right.verifiedAt).getTime() - new Date(left.verifiedAt).getTime()
  );
}

export function buildRecommendationLearningDashboardData(
  records: RecommendationLearningRecord[]
): RecommendationLearningDashboardData {
  const sorted = sortRecommendationLearningRecords(records);

  return {
    generatedAt: new Date().toISOString(),
    totalRecords: sorted.length,
    overall: buildWindowStats(sorted, "all"),
    last100: buildWindowStats(sorted.slice(0, 100), 100),
    last500: buildWindowStats(sorted.slice(0, 500), 500),
    recentRecords: sorted.slice(0, 20),
  };
}
