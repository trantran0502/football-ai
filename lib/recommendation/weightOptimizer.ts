import { FEATURE_PROVIDER_KEYS, type FeatureProviderKey } from "@/lib/providers/registry/types";
import { DEFAULT_PROVIDER_WEIGHTS } from "@/lib/recommendation/providerWeights";
import type {
  RecommendationLearningMarketKey,
  RecommendationLearningRecord,
} from "@/lib/recommendation/recommendationLearningTypes";
import { filterCompleteLearningRecords, inspectLearningRecordCompleteness } from "@/lib/recommendation/recommendationLearningDiagnostics";
import {
  DEFAULT_MARKET_GROUP_WEIGHT,
  DEFAULT_TEAM_GROUP_WEIGHT,
  MAX_MARKET_GROUP_WEIGHT,
  MIN_MARKET_GROUP_WEIGHT,
  type WeightGroupAnalysis,
  type WeightOptimizerDiagnostics,
  type WeightOptimizerMarketTypeAnalysis,
  type WeightOptimizerProviderAnalysis,
  type WeightOptimizerReport,
  type WeightOptimizerStatus,
} from "@/lib/recommendation/weightOptimizerTypes";

const MARKET_KEYS: RecommendationLearningMarketKey[] = ["1X2", "AH", "O/U", "BTTS"];

const MARKET_GROUP_LABEL = "market";
const TEAM_GROUP_LABEL = "team";

interface GroupAccumulator {
  sampleSize: number;
  hitCount: number;
  totalProfit: number;
  totalStake: number;
  confidenceSum: number;
}

interface ProviderAccumulator {
  usageCount: number;
  hitCount: number;
  totalProfit: number;
  totalStake: number;
  confidenceSum: number;
}

function createGroupAccumulator(): GroupAccumulator {
  return {
    sampleSize: 0,
    hitCount: 0,
    totalProfit: 0,
    totalStake: 0,
    confidenceSum: 0,
  };
}

function createProviderAccumulator(): ProviderAccumulator {
  return {
    usageCount: 0,
    hitCount: 0,
    totalProfit: 0,
    totalStake: 0,
    confidenceSum: 0,
  };
}

function finalizeGroupStats(accumulator: GroupAccumulator): {
  sampleSize: number;
  hitRate: number;
  roi: number;
  averageConfidence: number;
} {
  if (accumulator.sampleSize === 0) {
    return { sampleSize: 0, hitRate: 0, roi: 0, averageConfidence: 0 };
  }

  return {
    sampleSize: accumulator.sampleSize,
    hitRate: accumulator.hitCount / accumulator.sampleSize,
    roi: accumulator.totalStake > 0 ? accumulator.totalProfit / accumulator.totalStake : 0,
    averageConfidence: accumulator.confidenceSum / accumulator.sampleSize,
  };
}

function getMaxAdjustment(sampleSize: number): number {
  if (sampleSize < 100) {
    return 0;
  }
  if (sampleSize < 300) {
    return 0.02;
  }
  return 0.05;
}

function computeSampleReliability(sampleSize: number): number {
  if (sampleSize <= 0) {
    return 0;
  }
  if (sampleSize < 100) {
    return sampleSize / 100;
  }
  if (sampleSize < 300) {
    return 0.5 + (sampleSize - 100) / 400;
  }
  return Math.min(1, 0.85 + (sampleSize - 300) / 700);
}

function wilsonInterval(
  hitRate: number,
  sampleSize: number,
  z = 1.96
): { lower: number; upper: number } {
  if (sampleSize <= 0) {
    return { lower: 0, upper: 0 };
  }

  const p = hitRate;
  const n = sampleSize;
  const denominator = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);

  return {
    lower: Math.max(0, (center - margin) / denominator),
    upper: Math.min(1, (center + margin) / denominator),
  };
}

function formatRate(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function suggestMarketGroupWeight(input: {
  currentWeight: number;
  marketRoi: number;
  teamRoi: number;
  marketHitRate: number;
  teamHitRate: number;
  sampleSize: number;
}): Pick<WeightGroupAnalysis, "suggestedWeight" | "adjustmentReason" | "status"> {
  const maxAdjustment = getMaxAdjustment(input.sampleSize);

  if (input.sampleSize < 100) {
    return {
      suggestedWeight: input.currentWeight,
      adjustmentReason: "樣本不足 100 場，維持初始權重，不建議正式調整",
      status: "insufficient_sample",
    };
  }

  const roiDiff = input.marketRoi - input.teamRoi;
  let delta = 0;
  let reason = "Market / Team 表現接近，維持初始 60 / 40 分配";

  if (roiDiff <= -0.02) {
    delta = Math.max(-maxAdjustment, roiDiff * 0.25);
    reason = `Market 群組 ROI (${formatRate(input.marketRoi)}) 低於 Team (${formatRate(input.teamRoi)})，建議降低 Market 權重`;
  } else if (roiDiff >= 0.02 && input.marketHitRate >= input.teamHitRate) {
    delta = Math.min(maxAdjustment, roiDiff * 0.25);
    reason = `Market 群組 ROI (${formatRate(input.marketRoi)}) 優於 Team (${formatRate(input.teamRoi)})，建議提高 Market 權重`;
  } else if (input.marketHitRate > input.teamHitRate + 0.05 && input.sampleSize < 300) {
    reason = "Market 命中率偏高但樣本仍不足 300 場，不建議大幅升權";
  }

  const reliability = computeSampleReliability(input.sampleSize);
  delta *= reliability;

  const suggestedWeight = clamp(
    input.currentWeight + delta,
    MIN_MARKET_GROUP_WEIGHT,
    MAX_MARKET_GROUP_WEIGHT
  );

  if (Math.abs(suggestedWeight - input.currentWeight) < 1e-6) {
    return {
      suggestedWeight: input.currentWeight,
      adjustmentReason: reason,
      status: "analysis",
    };
  }

  return {
    suggestedWeight,
    adjustmentReason: reason,
    status: "analysis",
  };
}

function buildGroupAnalysis(input: {
  group: typeof MARKET_GROUP_LABEL | typeof TEAM_GROUP_LABEL;
  currentWeight: number;
  stats: ReturnType<typeof finalizeGroupStats>;
  sampleSize: number;
  compareRoi: number;
  compareHitRate: number;
}): WeightGroupAnalysis {
  const suggestion =
    input.group === MARKET_GROUP_LABEL
      ? suggestMarketGroupWeight({
          currentWeight: input.currentWeight,
          marketRoi: input.stats.roi,
          teamRoi: input.compareRoi,
          marketHitRate: input.stats.hitRate,
          teamHitRate: input.compareHitRate,
          sampleSize: input.sampleSize,
        })
      : (() => {
          const marketSuggestion = suggestMarketGroupWeight({
            currentWeight: DEFAULT_MARKET_GROUP_WEIGHT,
            marketRoi: input.compareRoi,
            teamRoi: input.stats.roi,
            marketHitRate: input.compareHitRate,
            teamHitRate: input.stats.hitRate,
            sampleSize: input.sampleSize,
          });
          const suggestedTeamWeight = clamp(
            1 - marketSuggestion.suggestedWeight,
            1 - MAX_MARKET_GROUP_WEIGHT,
            1 - MIN_MARKET_GROUP_WEIGHT
          );
          return {
            suggestedWeight: suggestedTeamWeight,
            adjustmentReason:
              marketSuggestion.status === "insufficient_sample"
                ? marketSuggestion.adjustmentReason
                : `Team 群組 ROI (${formatRate(input.stats.roi)}) vs Market (${formatRate(input.compareRoi)})，建議 Team 權重 ${formatRate(suggestedTeamWeight)}`,
            status: marketSuggestion.status,
          };
        })();

  return {
    currentWeight: input.currentWeight,
    suggestedWeight: suggestion.suggestedWeight,
    sampleSize: input.stats.sampleSize,
    hitRate: input.stats.hitRate,
    roi: input.stats.roi,
    averageConfidence: input.stats.averageConfidence,
    sampleReliability: computeSampleReliability(input.sampleSize),
    confidenceInterval: wilsonInterval(input.stats.hitRate, input.stats.sampleSize),
    adjustmentReason: suggestion.adjustmentReason,
    status: suggestion.status,
  };
}

function accumulateMarketGroup(
  records: RecommendationLearningRecord[],
  marketKey?: RecommendationLearningMarketKey
): GroupAccumulator {
  const accumulator = createGroupAccumulator();

  for (const record of records) {
    for (const outcome of record.marketOutcomes) {
      if (outcome.result === "PUSH") {
        continue;
      }
      if (marketKey && outcome.marketKey !== marketKey) {
        continue;
      }

      accumulator.sampleSize += 1;
      accumulator.totalProfit += outcome.profit;
      accumulator.totalStake += outcome.stake;
      accumulator.confidenceSum +=
        record.providerOverallConfidence ??
        (outcome.confidence === "high" ? 0.75 : outcome.confidence === "medium" ? 0.5 : 0.25);
      if (outcome.hit) {
        accumulator.hitCount += 1;
      }
    }
  }

  return accumulator;
}

function accumulateTeamGroup(
  records: RecommendationLearningRecord[],
  marketKey?: RecommendationLearningMarketKey
): GroupAccumulator {
  const accumulator = createGroupAccumulator();

  for (const record of records) {
    const relevantOutcomes =
      marketKey === undefined
        ? record.marketOutcomes.filter((outcome) => outcome.result !== "PUSH")
        : record.marketOutcomes.filter(
            (outcome) => outcome.result !== "PUSH" && outcome.marketKey === marketKey
          );

    if (relevantOutcomes.length === 0) {
      continue;
    }

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
    const teamShare =
      totalContribution > 0
        ? totalContribution /
          (totalContribution + relevantOutcomes.length)
        : usableProviders.length / (usableProviders.length + relevantOutcomes.length);

    accumulator.sampleSize += 1;
    accumulator.confidenceSum += record.providerOverallConfidence ?? 0;
    if (record.hit) {
      accumulator.hitCount += 1;
    }

    const profitBase =
      marketKey === undefined
        ? record.totalProfit
        : relevantOutcomes.reduce((sum, outcome) => sum + outcome.profit, 0);
    const stakeBase =
      marketKey === undefined
        ? record.totalStake
        : relevantOutcomes.reduce((sum, outcome) => sum + outcome.stake, 0);

    accumulator.totalProfit += profitBase * teamShare;
    accumulator.totalStake += stakeBase * teamShare;
  }

  return accumulator;
}

function accumulateProviderStats(
  records: RecommendationLearningRecord[]
): Map<FeatureProviderKey, ProviderAccumulator> {
  const byProvider = new Map<FeatureProviderKey, ProviderAccumulator>();

  for (const key of FEATURE_PROVIDER_KEYS) {
    byProvider.set(key, createProviderAccumulator());
  }

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
      const existing = byProvider.get(provider.providerKey as FeatureProviderKey)!;
      existing.usageCount += 1;
      existing.confidenceSum += provider.providerConfidence;

      const share =
        totalContribution > 0
          ? Math.max(provider.providerContribution, 0) / totalContribution
          : 1 / usableProviders.length;

      if (record.hit) {
        existing.hitCount += share;
      }
      existing.totalProfit += record.totalProfit * share;
      existing.totalStake += record.totalStake * share;
      byProvider.set(provider.providerKey as FeatureProviderKey, existing);
    }
  }

  return byProvider;
}

function buildProviderAnalysis(
  records: RecommendationLearningRecord[],
  sampleSize: number
): WeightOptimizerProviderAnalysis[] {
  const accumulators = accumulateProviderStats(records);
  const maxAdjustment = getMaxAdjustment(sampleSize);
  const reliability = computeSampleReliability(sampleSize);

  const roiEntries = [...accumulators.entries()]
    .map(([providerKey, stats]) => ({
      providerKey,
      roi: stats.totalStake > 0 ? stats.totalProfit / stats.totalStake : 0,
      usageCount: stats.usageCount,
    }))
    .filter((entry) => entry.usageCount > 0);

  const averageRoi =
    roiEntries.length > 0
      ? roiEntries.reduce((sum, entry) => sum + entry.roi, 0) / roiEntries.length
      : 0;

  const rawSuggested = FEATURE_PROVIDER_KEYS.map((providerKey) => {
    const stats = accumulators.get(providerKey)!;
    const currentWeight = DEFAULT_PROVIDER_WEIGHTS[providerKey];
    const hitRate = stats.usageCount > 0 ? stats.hitCount / stats.usageCount : 0;
    const roi = stats.totalStake > 0 ? stats.totalProfit / stats.totalStake : 0;
    const averageConfidence =
      stats.usageCount > 0 ? stats.confidenceSum / stats.usageCount : 0;

    if (sampleSize < 100 || stats.usageCount < 10) {
      return {
        providerKey,
        usageCount: Math.round(stats.usageCount),
        hitCount: Math.round(stats.hitCount),
        hitRate,
        roi,
        averageConfidence,
        currentWeight,
        suggestedWeight: currentWeight,
        sampleReliability: reliability,
        adjustmentReason:
          sampleSize < 100
            ? "整體樣本不足 100 場，維持現行 Provider 權重"
            : "Provider 樣本不足，維持現行權重",
      };
    }

    let delta = 0;
    let reason = "表現接近平均，維持現行 Provider 權重";

    if (roi <= averageRoi - 0.03) {
      delta = Math.max(-maxAdjustment, (roi - averageRoi) * 0.15);
      reason = `ROI (${formatRate(roi)}) 低於 Provider 平均 (${formatRate(averageRoi)})，建議降權`;
    } else if (roi >= averageRoi + 0.03 && sampleSize >= 100) {
      if (sampleSize < 300 && hitRate > 0.6) {
        reason = "命中率偏高但樣本仍不足 300 場，不建議升權";
      } else {
        delta = Math.min(maxAdjustment, (roi - averageRoi) * 0.15);
        reason = `ROI (${formatRate(roi)}) 優於 Provider 平均 (${formatRate(averageRoi)})，建議升權`;
      }
    }

    delta *= reliability;

    return {
      providerKey,
      usageCount: Math.round(stats.usageCount),
      hitCount: Math.round(stats.hitCount),
      hitRate,
      roi,
      averageConfidence,
      currentWeight,
      suggestedWeight: Math.max(0, currentWeight + delta),
      sampleReliability: reliability,
      adjustmentReason: reason,
    };
  });

  const suggestedSum = rawSuggested.reduce((sum, entry) => sum + entry.suggestedWeight, 0);
  if (suggestedSum <= 0) {
    return rawSuggested;
  }

  return rawSuggested.map((entry) => ({
    ...entry,
    suggestedWeight: entry.suggestedWeight / suggestedSum,
  }));
}

function buildMarketTypeAnalysis(
  records: RecommendationLearningRecord[],
  overallSampleSize: number
): WeightOptimizerMarketTypeAnalysis[] {
  return MARKET_KEYS.map((marketKey) => {
    const marketStats = finalizeGroupStats(accumulateMarketGroup(records, marketKey));
    const teamStats = finalizeGroupStats(accumulateTeamGroup(records, marketKey));
    const sampleSize = Math.max(marketStats.sampleSize, teamStats.sampleSize, overallSampleSize);

    const market = buildGroupAnalysis({
      group: MARKET_GROUP_LABEL,
      currentWeight: DEFAULT_MARKET_GROUP_WEIGHT,
      stats: marketStats,
      sampleSize,
      compareRoi: teamStats.roi,
      compareHitRate: teamStats.hitRate,
    });

    const team = buildGroupAnalysis({
      group: TEAM_GROUP_LABEL,
      currentWeight: DEFAULT_TEAM_GROUP_WEIGHT,
      stats: teamStats,
      sampleSize,
      compareRoi: marketStats.roi,
      compareHitRate: marketStats.hitRate,
    });

    team.suggestedWeight = clamp(1 - market.suggestedWeight, 1 - MAX_MARKET_GROUP_WEIGHT, 1 - MIN_MARKET_GROUP_WEIGHT);

    return { marketKey, market, team };
  });
}

export { filterCompleteLearningRecords } from "@/lib/recommendation/recommendationLearningDiagnostics";

export function buildWeightOptimizerReport(
  records: RecommendationLearningRecord[]
): WeightOptimizerReport {
  const generatedAt = new Date().toISOString();
  const { used, skipped } = filterCompleteLearningRecords(records);

  const skipReasons: Record<string, number> = {};
  for (const entry of skipped) {
    for (const reason of inspectLearningRecordCompleteness(entry.record).skipReasons) {
      skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
    }
  }

  const sortedUsed = [...used].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );

  const dateRange = {
    from: sortedUsed[0]?.createdAt ?? null,
    to: sortedUsed[sortedUsed.length - 1]?.createdAt ?? null,
  };

  const diagnostics: WeightOptimizerDiagnostics = {
    recordsRead: records.length,
    recordsUsed: used.length,
    recordsSkipped: skipped.length,
    skipReasons,
    dateRange,
    generatedAt,
    optimizerMode: "analysis",
    weightsApplied: false,
  };

  const marketAccumulator = accumulateMarketGroup(used);
  const teamAccumulator = accumulateTeamGroup(used);
  const marketStats = finalizeGroupStats(marketAccumulator);
  const teamStats = finalizeGroupStats(teamAccumulator);
  const overallSampleSize = Math.max(marketStats.sampleSize, teamStats.sampleSize, used.length);

  const market = buildGroupAnalysis({
    group: MARKET_GROUP_LABEL,
    currentWeight: DEFAULT_MARKET_GROUP_WEIGHT,
    stats: marketStats,
    sampleSize: overallSampleSize,
    compareRoi: teamStats.roi,
    compareHitRate: teamStats.hitRate,
  });

  const team = buildGroupAnalysis({
    group: TEAM_GROUP_LABEL,
    currentWeight: DEFAULT_TEAM_GROUP_WEIGHT,
    stats: teamStats,
    sampleSize: overallSampleSize,
    compareRoi: marketStats.roi,
    compareHitRate: marketStats.hitRate,
  });

  team.suggestedWeight = clamp(
    1 - market.suggestedWeight,
    1 - MAX_MARKET_GROUP_WEIGHT,
    1 - MIN_MARKET_GROUP_WEIGHT
  );

  return {
    diagnostics,
    overall: { market, team },
    providers: buildProviderAnalysis(used, overallSampleSize).sort(
      (left, right) => right.roi - left.roi
    ),
    byMarketType: buildMarketTypeAnalysis(used, overallSampleSize),
  };
}

export function getMaxWeightAdjustment(sampleSize: number): number {
  return getMaxAdjustment(sampleSize);
}

export function getWeightOptimizerStatus(sampleSize: number): WeightOptimizerStatus {
  return sampleSize < 100 ? "insufficient_sample" : "analysis";
}
