import type { EvidenceWeightSuggestion } from "@/lib/evidence/evidenceWeightOptimizerTypes";
import {
  AI_LEARNING_HIGH_HIT_RATE,
  AI_LEARNING_HIGH_ROI,
  AI_LEARNING_LOW_HIT_RATE,
  AI_LEARNING_LOW_ROI,
  AI_LEARNING_MIN_SAMPLE,
  type AiLearningAction,
  type AiLearningDashboardStats,
  type AiLearningEngineInput,
  type AiLearningReport,
  type AiLearningRuleSummary,
  type AiLearningSuggestion,
  type AiLearningSuggestionGroups,
  type AiLearningTargetType,
  type ImprovementCandidate,
} from "@/lib/learning/aiLearningTypes";
import type { RulePerformanceStats } from "@/lib/learning/learningTypes";
import type { ValidationMetricBucket } from "@/lib/validation/validationTypes";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatRate(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function computeAiLearningConfidence(input: {
  sampleSize: number;
  hitRate: number;
  minSampleSize?: number;
}): number {
  const minSample = input.minSampleSize ?? AI_LEARNING_MIN_SAMPLE;
  if (input.sampleSize < minSample) {
    return clamp(input.sampleSize / Math.max(minSample * 2, 1), 0, 0.35);
  }

  const sampleReliability = clamp(input.sampleSize / 100, 0.35, 1);
  const signalStrength = clamp(Math.abs(input.hitRate - 0.5) * 2, 0, 1);
  return Math.round(sampleReliability * (0.45 + signalStrength * 0.55) * 100) / 100;
}

function buildSuggestion(input: {
  target: string;
  targetType: AiLearningTargetType;
  action: AiLearningAction;
  reason: string;
  sampleSize: number;
  hitRate: number;
  roi: number;
  minSampleSize: number;
}): AiLearningSuggestion {
  return {
    target: input.target,
    targetType: input.targetType,
    action: input.action,
    reason: input.reason,
    sampleSize: input.sampleSize,
    currentHitRate: input.hitRate,
    currentRoi: input.roi,
    confidence: computeAiLearningConfidence({
      sampleSize: input.sampleSize,
      hitRate: input.hitRate,
      minSampleSize: input.minSampleSize,
    }),
  };
}

function buildRuleSuggestions(
  rules: RulePerformanceStats[],
  minSampleSize: number
): AiLearningSuggestion[] {
  const suggestions: AiLearningSuggestion[] = [];

  for (const rule of rules) {
    if (rule.usageCount < minSampleSize) {
      continue;
    }

    if (rule.hitRate >= AI_LEARNING_HIGH_HIT_RATE && rule.roi >= AI_LEARNING_HIGH_ROI) {
      suggestions.push(
        buildSuggestion({
          target: rule.rule,
          targetType: "rule",
          action: "promote",
          reason: `規則命中率 ${formatRate(rule.hitRate)}、ROI ${formatRate(rule.roi)} 表現最佳，建議提高使用優先度`,
          sampleSize: rule.usageCount,
          hitRate: rule.hitRate,
          roi: rule.roi,
          minSampleSize,
        })
      );
      continue;
    }

    if (rule.hitRate <= AI_LEARNING_LOW_HIT_RATE || rule.roi <= AI_LEARNING_LOW_ROI) {
      suggestions.push(
        buildSuggestion({
          target: rule.rule,
          targetType: "rule",
          action: rule.roi < AI_LEARNING_LOW_ROI ? "disable" : "decrease",
          reason: `規則失敗率偏高（命中率 ${formatRate(rule.hitRate)}、ROI ${formatRate(rule.roi)}），建議降低信任或審查`,
          sampleSize: rule.usageCount,
          hitRate: rule.hitRate,
          roi: rule.roi,
          minSampleSize,
        })
      );
      continue;
    }

    suggestions.push(
      buildSuggestion({
        target: rule.rule,
        targetType: "rule",
        action: "monitor",
        reason: `規則表現接近平均，持續觀察（命中率 ${formatRate(rule.hitRate)}）`,
        sampleSize: rule.usageCount,
        hitRate: rule.hitRate,
        roi: rule.roi,
        minSampleSize,
      })
    );
  }

  return suggestions.sort((left, right) => right.confidence - left.confidence);
}

function buildMarketSuggestions(
  byMarket: Record<string, ValidationMetricBucket>,
  minSampleSize: number
): AiLearningSuggestion[] {
  const suggestions: AiLearningSuggestion[] = [];

  for (const [market, bucket] of Object.entries(byMarket)) {
    if (bucket.sampleSize < minSampleSize) {
      continue;
    }

    if (bucket.hitRate >= AI_LEARNING_HIGH_HIT_RATE && bucket.roi >= 0) {
      suggestions.push(
        buildSuggestion({
          target: market,
          targetType: "market",
          action: "promote",
          reason: `${market} 盤口命中率 ${formatRate(bucket.hitRate)}，屬於容易命中盤口`,
          sampleSize: bucket.sampleSize,
          hitRate: bucket.hitRate,
          roi: bucket.roi,
          minSampleSize,
        })
      );
      continue;
    }

    if (bucket.hitRate < AI_LEARNING_LOW_HIT_RATE || bucket.roi < AI_LEARNING_LOW_ROI) {
      suggestions.push(
        buildSuggestion({
          target: market,
          targetType: "market",
          action: "avoid",
          reason: `${market} 盤口容易誤判（命中率 ${formatRate(bucket.hitRate)}、ROI ${formatRate(bucket.roi)}），建議降低暴露`,
          sampleSize: bucket.sampleSize,
          hitRate: bucket.hitRate,
          roi: bucket.roi,
          minSampleSize,
        })
      );
      continue;
    }

    suggestions.push(
      buildSuggestion({
        target: market,
        targetType: "market",
        action: "monitor",
        reason: `${market} 盤口表現中性，維持現有策略`,
        sampleSize: bucket.sampleSize,
        hitRate: bucket.hitRate,
        roi: bucket.roi,
        minSampleSize,
      })
    );
  }

  return suggestions.sort((left, right) => right.confidence - left.confidence);
}

function buildLeagueSuggestions(
  byLeague: Record<string, ValidationMetricBucket>,
  minSampleSize: number
): AiLearningSuggestion[] {
  const suggestions: AiLearningSuggestion[] = [];

  for (const [league, bucket] of Object.entries(byLeague)) {
    if (bucket.sampleSize < minSampleSize) {
      continue;
    }

    if (bucket.roi >= AI_LEARNING_HIGH_ROI && bucket.hitRate >= 0.5) {
      suggestions.push(
        buildSuggestion({
          target: league,
          targetType: "league",
          action: "increase",
          reason: `${league} 聯賽 ROI ${formatRate(bucket.roi)} 表現最佳，建議提高信任`,
          sampleSize: bucket.sampleSize,
          hitRate: bucket.hitRate,
          roi: bucket.roi,
          minSampleSize,
        })
      );
      continue;
    }

    if (bucket.roi < AI_LEARNING_LOW_ROI || bucket.hitRate < AI_LEARNING_LOW_HIT_RATE) {
      suggestions.push(
        buildSuggestion({
          target: league,
          targetType: "league",
          action: "decrease",
          reason: `${league} 聯賽需要降低信任（命中率 ${formatRate(bucket.hitRate)}、ROI ${formatRate(bucket.roi)}）`,
          sampleSize: bucket.sampleSize,
          hitRate: bucket.hitRate,
          roi: bucket.roi,
          minSampleSize,
        })
      );
      continue;
    }

    suggestions.push(
      buildSuggestion({
        target: league,
        targetType: "league",
        action: "monitor",
        reason: `${league} 聯賽表現穩定，維持現有權重`,
        sampleSize: bucket.sampleSize,
        hitRate: bucket.hitRate,
        roi: bucket.roi,
        minSampleSize,
      })
    );
  }

  return suggestions.sort((left, right) => right.confidence - left.confidence);
}

function buildEvidenceSuggestions(
  weightOptimizerReport: AiLearningEngineInput["weightOptimizerReport"],
  minSampleSize: number
): AiLearningSuggestion[] {
  const suggestions: AiLearningSuggestion[] = [];

  for (const suggestion of weightOptimizerReport.suggestions) {
    if (suggestion.usageCount < minSampleSize && suggestion.usageCount > 0) {
      suggestions.push(
        buildSuggestion({
          target: suggestion.label,
          targetType: "evidence",
          action: "monitor",
          reason: `${suggestion.label} 樣本偏少，暫不調整權重`,
          sampleSize: suggestion.usageCount,
          hitRate: suggestion.hitRate,
          roi: suggestion.roi,
          minSampleSize,
        })
      );
      continue;
    }

    if (suggestion.disableCandidate) {
      suggestions.push(
        buildSuggestion({
          target: suggestion.label,
          targetType: "evidence",
          action: "disable",
          reason: suggestion.disableReason ?? `${suggestion.label} 建議停用候選（analysis-only）`,
          sampleSize: suggestion.usageCount,
          hitRate: suggestion.hitRate,
          roi: suggestion.roi,
          minSampleSize,
        })
      );
      continue;
    }

    if (suggestion.weightChange > 0) {
      suggestions.push(
        buildSuggestion({
          target: suggestion.label,
          targetType: "evidence",
          action: "increase",
          reason: `${suggestion.label} 建議升權：${suggestion.reason}`,
          sampleSize: suggestion.usageCount,
          hitRate: suggestion.hitRate,
          roi: suggestion.roi,
          minSampleSize,
        })
      );
      continue;
    }

    if (suggestion.weightChange < 0) {
      suggestions.push(
        buildSuggestion({
          target: suggestion.label,
          targetType: "evidence",
          action: "decrease",
          reason: `${suggestion.label} 建議降權：${suggestion.reason}`,
          sampleSize: suggestion.usageCount,
          hitRate: suggestion.hitRate,
          roi: suggestion.roi,
          minSampleSize,
        })
      );
    }
  }

  return suggestions.sort((left, right) => right.confidence - left.confidence);
}

function estimateExpectedImprovement(input: {
  hitRate: number;
  roi: number;
  action: AiLearningAction;
}): number {
  if (input.action === "promote" || input.action === "increase") {
    return clamp(input.roi * 0.5 + (input.hitRate - 0.5) * 0.3, 0, 0.5);
  }
  if (input.action === "disable" || input.action === "avoid" || input.action === "decrease") {
    return clamp(Math.abs(Math.min(input.roi, 0)) * 0.6 + (0.5 - input.hitRate) * 0.2, 0, 0.5);
  }
  return clamp(Math.abs(input.roi) * 0.15, 0, 0.15);
}

export function buildImprovementCandidates(
  suggestions: AiLearningSuggestionGroups,
  limit = 10
): ImprovementCandidate[] {
  const all = [
    ...suggestions.ruleSuggestions,
    ...suggestions.marketSuggestions,
    ...suggestions.leagueSuggestions,
    ...suggestions.evidenceSuggestions,
  ].filter((item) => item.action !== "monitor");

  return all
    .map((item) => ({
      target: item.target,
      targetType: item.targetType,
      currentPerformance: {
        hitRate: item.currentHitRate,
        roi: item.currentRoi,
        sampleSize: item.sampleSize,
      },
      expectedImprovement: estimateExpectedImprovement({
        hitRate: item.currentHitRate,
        roi: item.currentRoi,
        action: item.action,
      }),
      confidence: item.confidence,
      recommendation: item.reason,
    }))
    .sort(
      (left, right) =>
        right.expectedImprovement * right.confidence -
        left.expectedImprovement * left.confidence
    )
    .slice(0, limit);
}

function summarizeRules(rules: RulePerformanceStats[]): {
  bestRules: AiLearningRuleSummary[];
  worstRules: AiLearningRuleSummary[];
} {
  const eligible = rules.filter((rule) => rule.usageCount >= AI_LEARNING_MIN_SAMPLE);
  const mapRule = (rule: RulePerformanceStats): AiLearningRuleSummary => ({
    rule: rule.rule,
    hitRate: rule.hitRate,
    roi: rule.roi,
    sampleSize: rule.usageCount,
  });

  return {
    bestRules: [...eligible]
      .sort((left, right) => right.hitRate - left.hitRate || right.roi - left.roi)
      .slice(0, 10)
      .map(mapRule),
    worstRules: [...eligible]
      .sort((left, right) => left.hitRate - right.hitRate || left.roi - right.roi)
      .slice(0, 10)
      .map(mapRule),
  };
}

function buildSuggestedChanges(suggestions: AiLearningSuggestionGroups): string[] {
  const prioritized = [
    ...suggestions.ruleSuggestions.filter((item) => item.action !== "monitor"),
    ...suggestions.marketSuggestions.filter((item) => item.action !== "monitor"),
    ...suggestions.leagueSuggestions.filter((item) => item.action !== "monitor"),
    ...suggestions.evidenceSuggestions.filter((item) => item.action !== "monitor"),
  ]
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 12);

  return prioritized.map(
    (item) =>
      `[${item.targetType}/${item.action}] ${item.target}: ${item.reason} (confidence ${formatRate(item.confidence)}, n=${item.sampleSize})`
  );
}

function buildDashboardStats(input: {
  rules: RulePerformanceStats[];
  rankings: AiLearningEngineInput["rankings"];
  suggestions: AiLearningSuggestionGroups;
  improvementCandidates: ImprovementCandidate[];
}): AiLearningDashboardStats {
  const { bestRules, worstRules } = summarizeRules(input.rules);

  return {
    topImprovements: input.improvementCandidates.slice(0, 10),
    bestRules,
    worstRules,
    leagueRanking: input.rankings.leagueRoiRanking,
    marketRanking: input.rankings.marketRoiRanking,
    suggestedChanges: buildSuggestedChanges(input.suggestions),
  };
}

function computeOverallConfidence(suggestions: AiLearningSuggestion[]): number {
  if (suggestions.length === 0) {
    return 0;
  }

  const totalWeight = suggestions.reduce((sum, item) => sum + Math.max(item.sampleSize, 1), 0);
  const weighted = suggestions.reduce(
    (sum, item) => sum + item.confidence * Math.max(item.sampleSize, 1),
    0
  );
  return Math.round((weighted / totalWeight) * 100) / 100;
}

export function buildAiLearningReport(input: AiLearningEngineInput): AiLearningReport {
  const minSampleSize = input.minSampleSize ?? AI_LEARNING_MIN_SAMPLE;

  const suggestions: AiLearningSuggestionGroups = {
    ruleSuggestions: buildRuleSuggestions(input.rules, minSampleSize),
    marketSuggestions: buildMarketSuggestions(input.byMarket, minSampleSize),
    leagueSuggestions: buildLeagueSuggestions(input.byLeague, minSampleSize),
    evidenceSuggestions: buildEvidenceSuggestions(input.weightOptimizerReport, minSampleSize),
  };

  const improvementCandidates = buildImprovementCandidates(suggestions);
  const allSuggestions = [
    ...suggestions.ruleSuggestions,
    ...suggestions.marketSuggestions,
    ...suggestions.leagueSuggestions,
    ...suggestions.evidenceSuggestions,
  ];

  return {
    generatedAt: new Date().toISOString(),
    optimizerMode: "analysis",
    weightsApplied: false,
    sampleSize: input.sampleSize.verifiedMatches,
    confidence: computeOverallConfidence(allSuggestions),
    suggestions,
    improvementCandidates,
    dashboard: buildDashboardStats({
      rules: input.rules,
      rankings: input.rankings,
      suggestions,
      improvementCandidates,
    }),
  };
}

export function buildAiLearningReportFromWeightSuggestion(
  suggestion: EvidenceWeightSuggestion
): ImprovementCandidate | null {
  if (!suggestion.disableCandidate) {
    return null;
  }

  return {
    target: suggestion.label,
    targetType: "evidence",
    currentPerformance: {
      hitRate: suggestion.hitRate,
      roi: suggestion.roi,
      sampleSize: suggestion.usageCount,
    },
    expectedImprovement: estimateExpectedImprovement({
      hitRate: suggestion.hitRate,
      roi: suggestion.roi,
      action: "disable",
    }),
    confidence: computeAiLearningConfidence({
      sampleSize: suggestion.usageCount,
      hitRate: suggestion.hitRate,
    }),
    recommendation: suggestion.disableReason ?? suggestion.reason,
  };
}
