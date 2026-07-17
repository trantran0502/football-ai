import type { DecisionLevel } from "@/lib/decision/decisionTypes";
import {
  collectLearningInputFromRecords,
  resolveFeatureContributionScore,
  type TaggedValidationEntry,
} from "@/lib/learning/performanceAnalyzer";
import type {
  DecisionLevelStats,
  FeaturePerformanceStats,
  LearningEngineConfig,
  LearningEngineInput,
  LearningEngineRankings,
  LearningEngineReport,
  LearningEngineSampleSize,
  ModelVersionStats,
  RankedMetricBucket,
  RulePerformanceStats,
} from "@/lib/learning/learningTypes";
import { DEFAULT_LEARNING_ENGINE_CONFIG } from "@/lib/learning/learningTypes";
import { buildWeightSuggestions } from "@/lib/learning/weightSuggestions";
import { buildEvidencePerformanceFromHistory, buildEvidencePerformanceReport } from "@/lib/evidence/evidenceValidation";
import { buildEvidenceWeightOptimizerReport } from "@/lib/evidence/evidenceWeightOptimizer";
import { buildEvidenceLearningInsights } from "@/lib/evidence/evidenceLearningIntegration";
import { buildAiLearningReport } from "@/lib/learning/aiLearningEngine";
import { buildHistoricalFundamentalsBacktestFromRecords } from "@/lib/fundamentalsBacktest/historicalBacktestLoader";
import { buildRecommendationLearningRecord } from "@/lib/recommendation/recommendationLearningBuilder";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  accumulateBucket,
  buildValidationReport,
  createEmptyBucket,
  finalizeBucket,
} from "@/lib/validation/statistics";
import type {
  RecommendationValidationEntry,
  ValidationMarketKey,
  ValidationMetricBucket,
} from "@/lib/validation/validationTypes";
import type { RecommendationLevel } from "@/lib/recommendation/recommendationTypes";

const CONFIDENCE_SCORE: Record<RecommendationLevel, number> = {
  pass: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const DECISION_LEVELS: DecisionLevel[] = [
  "PASS",
  "WATCH",
  "SMALL BET",
  "NORMAL BET",
  "STRONG BET",
];

export function buildLearningEngineReport(
  input: LearningEngineInput | HistoricalMatchRecord[],
  config: LearningEngineConfig = DEFAULT_LEARNING_ENGINE_CONFIG
): LearningEngineReport {
  const learningInput = Array.isArray(input)
    ? collectLearningInputFromRecords(input)
    : input;

  const taggedEntries = learningInput.validationResults as TaggedValidationEntry[];
  const validationReport = buildValidationReport(
    taggedEntries,
    new Set(taggedEntries.map((entry) => entry.matchId))
  );

  const features = buildFeaturePerformanceStats(taggedEntries, learningInput.featureHistory);
  const rules = buildRulePerformanceStats(validationReport.byRule);
  const byLeague = buildLeagueBuckets(taggedEntries);
  const byMarket = validationReport.byMarket;
  const byDecisionLevel = buildDecisionLevelStats(learningInput);
  const byModelVersion = buildModelVersionStats(taggedEntries, learningInput);

  const evidencePerformance = Array.isArray(input)
    ? buildEvidencePerformanceReport(
        input
          .map((record) => buildRecommendationLearningRecord(record))
          .filter((record): record is NonNullable<typeof record> => record !== null)
      )
    : buildEvidencePerformanceFromHistory(learningInput.recommendationHistory);
  const evidenceLearning = buildEvidenceLearningInsights(
    evidencePerformance,
    config.rankingLimit
  );
  const rankings = buildRankings(
    features,
    rules,
    byLeague,
    byMarket,
    config,
    evidencePerformance,
    evidenceLearning
  );
  const suggestions = buildWeightSuggestions({
    features,
    rules,
    byLeague,
    byMarket,
    byDecisionLevel,
    confidenceVsHitRate: buildConfidenceVsHitRate(taggedEntries),
    config,
  });

  const evidenceWeightSuggestions = buildEvidenceWeightOptimizerReport(evidencePerformance);
  const sampleSize = buildSampleSize(learningInput);
  const fundamentalsBacktest = Array.isArray(input)
    ? buildHistoricalFundamentalsBacktestFromRecords(input)
    : null;

  return {
    generatedAt: new Date().toISOString(),
    sampleSize,
    features,
    rules,
    byLeague,
    byMarket,
    byDecisionLevel,
    byModelVersion,
    suggestions,
    rankings,
    evidencePerformance,
    evidenceWeightSuggestions,
    evidenceLearning,
    aiLearning: buildAiLearningReport({
      recommendationHistory: learningInput.recommendationHistory,
      validationResults: learningInput.validationResults,
      evidenceLearning,
      weightOptimizerReport: evidenceWeightSuggestions,
      rules,
      byLeague,
      byMarket,
      rankings,
      sampleSize,
      minSampleSize: config.minSampleSize,
      fundamentalsBacktest,
    }),
    fundamentalsBacktest,
  };
}

function buildSampleSize(input: LearningEngineInput): LearningEngineSampleSize {
  const verifiedMatchIds = new Set(input.validationResults.map((entry) => entry.matchId));
  return {
    validationEntries: input.validationResults.length,
    verifiedMatches: verifiedMatchIds.size,
    recommendationHistory: input.recommendationHistory.length,
    featureHistory: input.featureHistory.length,
    decisionHistory: input.decisionHistory.length,
  };
}

function buildFeaturePerformanceStats(
  entries: TaggedValidationEntry[],
  featureHistory: LearningEngineInput["featureHistory"]
): FeaturePerformanceStats[] {
  const groups = new Map<
    string,
    {
      evaluations: RecommendationValidationEntry[];
      contributionScores: number[];
    }
  >();

  for (const entry of entries) {
    for (const feature of entry.candidate.supportingFeatures) {
      const group = groups.get(feature) ?? {
        evaluations: [],
        contributionScores: [],
      };
      group.evaluations.push(entry);
      group.contributionScores.push(
        resolveFeatureContributionScore({
          feature,
          recordMatchId: entry.matchId,
          entry,
          featureHistory,
        })
      );
      groups.set(feature, group);
    }
  }

  return [...groups.entries()]
    .map(([feature, group]) => {
      const bucket = buildBucketFromEntries(group.evaluations);
      return {
        feature,
        usageCount: group.evaluations.length,
        hitRate: bucket.hitRate,
        roi: bucket.roi,
        averageConfidence: bucket.averageConfidence,
        averageContributionScore:
          group.contributionScores.length > 0
            ? group.contributionScores.reduce((sum, value) => sum + value, 0) /
              group.contributionScores.length
            : 0,
      };
    })
    .filter((item) => item.usageCount >= 1)
    .sort((left, right) => right.roi - left.roi || right.usageCount - left.usageCount);
}

function buildRulePerformanceStats(
  byRule: Record<string, ValidationMetricBucket>
): RulePerformanceStats[] {
  return Object.entries(byRule)
    .map(([rule, bucket]) => ({
      rule,
      usageCount: bucket.sampleSize,
      hitRate: bucket.hitRate,
      roi: bucket.roi,
    }))
    .filter((item) => item.usageCount >= 1)
    .sort((left, right) => right.roi - left.roi || right.usageCount - left.usageCount);
}

function buildLeagueBuckets(
  entries: TaggedValidationEntry[]
): Record<string, ValidationMetricBucket> {
  const groups = new Map<string, TaggedValidationEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.league) ?? [];
    list.push(entry);
    groups.set(entry.league, list);
  }

  return Object.fromEntries(
    [...groups.entries()].map(([league, leagueEntries]) => [
      league,
      buildBucketFromEntries(leagueEntries),
    ])
  );
}

function buildDecisionLevelStats(
  input: LearningEngineInput
): Record<DecisionLevel, DecisionLevelStats> {
  const output = Object.fromEntries(
    DECISION_LEVELS.map((level) => [
      level,
      {
        level,
        usageCount: 0,
        hitRate: 0,
        roi: 0,
        averageDecisionScore: 0,
      },
    ])
  ) as Record<DecisionLevel, DecisionLevelStats>;

  const groups = new Map<
    DecisionLevel,
    NonNullable<(typeof input.decisionHistory)[number]["validationEntry"]>[]
  >();

  for (const record of input.decisionHistory) {
    if (!record.validationEntry) {
      continue;
    }
    const list = groups.get(record.validationEntry.decision) ?? [];
    list.push(record.validationEntry);
    groups.set(record.validationEntry.decision, list);
  }

  for (const level of DECISION_LEVELS) {
    const entries = groups.get(level) ?? [];
    if (entries.length === 0) {
      continue;
    }
    const profit = entries.reduce((sum, entry) => sum + entry.profit, 0);
    const hits = entries.filter((entry) => entry.hit).length;
    output[level] = {
      level,
      usageCount: entries.length,
      hitRate: entries.length > 0 ? hits / entries.length : 0,
      roi: entries.length > 0 ? profit / entries.length : 0,
      averageDecisionScore:
        entries.reduce((sum, entry) => sum + entry.decisionScore, 0) / entries.length,
    };
  }

  return output;
}

function buildModelVersionStats(
  entries: TaggedValidationEntry[],
  input: LearningEngineInput
): Record<string, ModelVersionStats> {
  const groups = new Map<string, TaggedValidationEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.modelVersion) ?? [];
    list.push(entry);
    groups.set(entry.modelVersion, list);
  }

  const verifiedByVersion = new Map<string, Set<string>>();
  for (const record of input.recommendationHistory) {
    const set = verifiedByVersion.get(record.modelVersion) ?? new Set<string>();
    set.add(record.matchId);
    verifiedByVersion.set(record.modelVersion, set);
  }

  const output: Record<string, ModelVersionStats> = {};
  for (const [version, versionEntries] of groups.entries()) {
    const bucket = buildBucketFromEntries(versionEntries);
    output[version] = {
      version,
      usageCount: bucket.sampleSize,
      hitRate: bucket.hitRate,
      roi: bucket.roi,
      verifiedMatches: verifiedByVersion.get(version)?.size ?? 0,
    };
  }

  return output;
}

function buildRankings(
  features: FeaturePerformanceStats[],
  rules: RulePerformanceStats[],
  byLeague: Record<string, ValidationMetricBucket>,
  byMarket: Record<ValidationMarketKey, ValidationMetricBucket>,
  config: LearningEngineConfig,
  evidencePerformance: import("@/lib/evidence/evidenceValidation").EvidencePerformanceReport,
  evidenceLearning: import("@/lib/evidence/evidenceLearningIntegration").EvidenceLearningInsights
): LearningEngineRankings {
  const eligibleFeatures = features.filter(
    (item) => item.usageCount >= config.minSampleSize
  );
  const eligibleRules = rules.filter((item) => item.usageCount >= config.minSampleSize);

  return {
    topFeatures: [...eligibleFeatures]
      .sort((left, right) => right.roi - left.roi)
      .slice(0, config.rankingLimit),
    worstFeatures: [...eligibleFeatures]
      .sort((left, right) => left.roi - right.roi)
      .slice(0, config.rankingLimit),
    topRules: [...eligibleRules]
      .sort((left, right) => right.roi - left.roi)
      .slice(0, config.rankingLimit),
    worstRules: [...eligibleRules]
      .sort((left, right) => left.roi - right.roi)
      .slice(0, config.rankingLimit),
    leagueRoiRanking: rankBuckets(byLeague, config.rankingLimit),
    marketRoiRanking: rankBuckets(byMarket, config.rankingLimit),
    evidenceByAccuracy: evidencePerformance.byAccuracy.slice(0, config.rankingLimit),
    evidenceByConfidence: evidencePerformance.byConfidence.slice(0, config.rankingLimit),
    evidenceByUsage: evidencePerformance.byUsage.slice(0, config.rankingLimit),
    evidenceOverallRanking: evidenceLearning.overallRanking.slice(0, config.rankingLimit),
  };
}

function rankBuckets(
  buckets: Record<string, ValidationMetricBucket>,
  limit: number
): RankedMetricBucket[] {
  return Object.entries(buckets)
    .filter(([, bucket]) => bucket.sampleSize > 0)
    .map(([key, bucket]) => ({
      key,
      usageCount: bucket.sampleSize,
      hitRate: bucket.hitRate,
      roi: bucket.roi,
    }))
    .sort((left, right) => right.roi - left.roi)
    .slice(0, limit);
}

function buildBucketFromEntries(
  entries: RecommendationValidationEntry[]
): ValidationMetricBucket {
  const bucket = createEmptyBucket();
  for (const entry of entries) {
    accumulateBucket(bucket, entry.evaluation);
  }
  finalizeBucket(bucket);
  if (entries.length > 0) {
    bucket.averageOdds =
      entries.reduce((sum, entry) => sum + entry.evaluation.odds, 0) / entries.length;
    bucket.averageConfidence =
      entries.reduce(
        (sum, entry) => sum + CONFIDENCE_SCORE[entry.evaluation.confidence],
        0
      ) / entries.length;
  }
  return bucket;
}

function buildConfidenceVsHitRate(
  entries: TaggedValidationEntry[]
): Array<{ confidence: RecommendationLevel; sampleSize: number; hitRate: number; roi: number }> {
  const levels: RecommendationLevel[] = ["low", "medium", "high"];
  return levels.map((confidence) => {
    const filtered = entries.filter((entry) => entry.evaluation.confidence === confidence);
    const bucket = buildBucketFromEntries(filtered);
    return {
      confidence,
      sampleSize: bucket.sampleSize,
      hitRate: bucket.hitRate,
      roi: bucket.roi,
    };
  });
}
