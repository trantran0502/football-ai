import type { DecisionLevel } from "@/lib/decision/decisionTypes";
import type {
  DecisionLevelStats,
  FeaturePerformanceStats,
  LearningEngineConfig,
  LearningSuggestions,
  RulePerformanceStats,
} from "@/lib/learning/learningTypes";
import type { RecommendationLevel } from "@/lib/recommendation/recommendationTypes";
import type { ValidationMarketKey, ValidationMetricBucket } from "@/lib/validation/validationTypes";

export interface WeightSuggestionInput {
  features: FeaturePerformanceStats[];
  rules: RulePerformanceStats[];
  byLeague: Record<string, ValidationMetricBucket>;
  byMarket: Record<ValidationMarketKey, ValidationMetricBucket>;
  byDecisionLevel: Record<DecisionLevel, DecisionLevelStats>;
  confidenceVsHitRate: Array<{
    confidence: RecommendationLevel;
    sampleSize: number;
    hitRate: number;
    roi: number;
  }>;
  config: LearningEngineConfig;
}

export function buildWeightSuggestions(input: WeightSuggestionInput): LearningSuggestions {
  const { config } = input;

  const increaseWeightFeatures = input.features
    .filter(
      (item) =>
        item.usageCount >= config.minSampleSize && item.roi >= config.highRoiThreshold
    )
    .sort((left, right) => right.roi - left.roi)
    .slice(0, 5)
    .map((item) => item.feature);

  const decreaseWeightFeatures = input.features
    .filter(
      (item) =>
        item.usageCount >= config.minSampleSize && item.roi <= config.lowRoiThreshold
    )
    .sort((left, right) => left.roi - right.roi)
    .slice(0, 5)
    .map((item) => item.feature);

  const disableRules = findDisableRules(input, config);
  const suggestedNewRules = buildSuggestedNewRules(input, config);

  return {
    increaseWeightFeatures,
    decreaseWeightFeatures,
    disableRules,
    suggestedNewRules,
  };
}

function findDisableRules(
  input: WeightSuggestionInput,
  config: LearningEngineConfig
): string[] {
  const invalid = new Set<string>();

  for (const item of input.rules) {
    if (
      item.usageCount >= config.minSampleSize &&
      (item.hitRate < config.invalidHitRateThreshold || item.roi < config.lowRoiThreshold)
    ) {
      invalid.add(formatRuleKey(item.rule));
    }
  }

  for (const [market, bucket] of Object.entries(input.byMarket)) {
    if (
      bucket.sampleSize >= config.minSampleSize &&
      (bucket.hitRate < config.invalidHitRateThreshold || bucket.roi < config.lowRoiThreshold)
    ) {
      invalid.add(`market:${market}`);
    }
  }

  for (const item of input.features) {
    if (
      item.usageCount >= config.minSampleSize &&
      (item.hitRate < config.invalidHitRateThreshold || item.roi <= config.lowRoiThreshold)
    ) {
      invalid.add(`feature:${item.feature}`);
    }
  }

  return [...invalid];
}

function buildSuggestedNewRules(
  input: WeightSuggestionInput,
  config: LearningEngineConfig
): string[] {
  const suggestions: string[] = [];

  for (const [market, bucket] of Object.entries(input.byMarket)) {
    if (
      bucket.sampleSize >= config.minSampleSize &&
      bucket.hitRate >= 0.55 &&
      bucket.roi > config.highRoiThreshold
    ) {
      suggestions.push(
        `Increase exposure to ${market} when confidence is medium or high (ROI ${formatRate(bucket.roi)}).`
      );
    }
  }

  for (const point of input.confidenceVsHitRate) {
    if (point.sampleSize >= config.minSampleSize && point.hitRate >= 0.55) {
      suggestions.push(
        `Add rule requiring minimum ${point.confidence} confidence when hit rate stays above ${formatRate(point.hitRate)}.`
      );
    }
  }

  for (const [league, bucket] of Object.entries(input.byLeague)) {
    if (
      bucket.sampleSize >= config.minSampleSize &&
      bucket.roi > 0.08 &&
      bucket.hitRate >= 0.5
    ) {
      suggestions.push(
        `Add league-specific weighting for ${league} (ROI ${formatRate(bucket.roi)}).`
      );
    }
  }

  for (const [level, stats] of Object.entries(input.byDecisionLevel) as Array<
    [DecisionLevel, DecisionLevelStats]
  >) {
    if (
      stats.usageCount >= config.minSampleSize &&
      stats.roi > config.highRoiThreshold &&
      stats.hitRate >= 0.5
    ) {
      suggestions.push(
        `Consider prioritizing ${level} decisions (ROI ${formatRate(stats.roi)}, hit rate ${formatRate(stats.hitRate)}).`
      );
    }
  }

  const topFeature = input.features.find(
    (item) => item.usageCount >= config.minSampleSize && item.roi >= config.highRoiThreshold
  );
  if (topFeature) {
    suggestions.push(
      `Add composite rule when ${topFeature.feature} contribution score exceeds ${topFeature.averageContributionScore.toFixed(1)} with positive ROI history.`
    );
  }

  return [...new Set(suggestions)].slice(0, 8);
}

function formatRuleKey(rule: string): string {
  if (
    rule.startsWith("reason:") ||
    rule.startsWith("confidence:") ||
    rule.startsWith("market:") ||
    rule.startsWith("feature:") ||
    rule.startsWith("rule:")
  ) {
    return rule;
  }
  return `rule:${rule}`;
}

function formatRate(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}
