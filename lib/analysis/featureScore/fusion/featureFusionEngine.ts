import { clampConfidence, clampScore } from "@/lib/analysis/featureScore/oddsConversion";
import {
  FUSION_SOURCE_CATEGORIES,
  type FeatureFusionOptions,
  type FeatureFusionResult,
  type FeatureScore,
  type FusionCategoryScore,
  type FusionFactorSummary,
  type FusionSourceCategory,
  type FusionWarning,
} from "@/lib/analysis/featureScore/fusion/fusionTypes";

const DEFAULT_MIN_CONFIDENCE = 0.2;
const DEFAULT_MIN_ACTIVE_FEATURES = 5;
const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.35;
const DEFAULT_CONFLICT_SCORE_THRESHOLD = 45;
const DEFAULT_SMALL_SAMPLE_SIZE_THRESHOLD = 5;
const TOP_FACTOR_COUNT = 5;

export class FeatureFusionEngine {
  private readonly options: Required<FeatureFusionOptions>;

  constructor(options: FeatureFusionOptions = {}) {
    this.options = {
      minConfidence: options.minConfidence ?? DEFAULT_MIN_CONFIDENCE,
      minActiveFeatures: options.minActiveFeatures ?? DEFAULT_MIN_ACTIVE_FEATURES,
      lowConfidenceThreshold:
        options.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE_THRESHOLD,
      conflictScoreThreshold:
        options.conflictScoreThreshold ?? DEFAULT_CONFLICT_SCORE_THRESHOLD,
      smallSampleSizeThreshold:
        options.smallSampleSizeThreshold ?? DEFAULT_SMALL_SAMPLE_SIZE_THRESHOLD,
    };
  }

  fuse(features: FeatureScore[]): FeatureFusionResult {
    const activeFeatures = features.filter(
      (feature) => feature.confidence >= this.options.minConfidence
    );
    const ignoredFeatures = features
      .filter((feature) => feature.confidence < this.options.minConfidence)
      .map((feature) => toFactorSummary(feature));

    const categoryScores = buildCategoryScores(activeFeatures);
    const overall = aggregateOverall(activeFeatures);
    const strongestFactors = pickTopFactors(activeFeatures, "desc");
    const weakestFactors = pickTopFactors(activeFeatures, "asc");
    const warnings = buildWarnings({
      features,
      activeFeatures,
      ignoredFeatures,
      overallConfidence: overall.confidence,
      options: this.options,
    });

    return {
      overallScore: overall.score,
      overallConfidence: overall.confidence,
      categoryScores,
      strongestFactors,
      weakestFactors,
      ignoredFeatures,
      warnings,
    };
  }
}

export function fuseFeatureScores(
  features: FeatureScore[],
  options?: FeatureFusionOptions
): FeatureFusionResult {
  return new FeatureFusionEngine(options).fuse(features);
}

export function resolveFusionSourceCategory(
  featureId: string
): FusionSourceCategory | "unknown" {
  for (const definition of FUSION_SOURCE_CATEGORIES) {
    if (
      definition.idPrefixes.some((prefix) =>
        prefix.endsWith(".") ? featureId.startsWith(prefix) : featureId === prefix
      )
    ) {
      return definition.category;
    }
  }
  return "unknown";
}

function toFactorSummary(feature: FeatureScore): FusionFactorSummary {
  return {
    id: feature.id,
    score: feature.score,
    confidence: feature.confidence,
    weight: feature.weight,
    reason: feature.reason,
    sourceCategory: resolveFusionSourceCategory(feature.id),
  };
}

function buildCategoryScores(activeFeatures: FeatureScore[]): FusionCategoryScore[] {
  return FUSION_SOURCE_CATEGORIES.map((definition) => {
    const categoryFeatures = activeFeatures.filter((feature) =>
      definition.idPrefixes.some((prefix) =>
        prefix.endsWith(".") ? feature.id.startsWith(prefix) : feature.id === prefix
      )
    );

    if (categoryFeatures.length === 0) {
      return {
        category: definition.category,
        label: definition.label,
        totalScore: 0,
        weightedScore: 0,
        confidence: 0,
        featureCount: 0,
      };
    }

    const totalScore = categoryFeatures.reduce((sum, feature) => sum + feature.score, 0);
    const weightSum = categoryFeatures.reduce((sum, feature) => sum + feature.weight, 0);

    let weightedScore = 0;
    let confidence = 0;
    if (weightSum > 0) {
      weightedScore =
        categoryFeatures.reduce(
          (sum, feature) => sum + feature.score * feature.weight,
          0
        ) / weightSum;
      confidence =
        categoryFeatures.reduce(
          (sum, feature) => sum + feature.confidence * feature.weight,
          0
        ) / weightSum;
    }

    return {
      category: definition.category,
      label: definition.label,
      totalScore: clampScore(totalScore),
      weightedScore: clampScore(weightedScore),
      confidence: clampConfidence(confidence),
      featureCount: categoryFeatures.length,
    };
  });
}

function aggregateOverall(activeFeatures: FeatureScore[]): {
  score: number;
  confidence: number;
} {
  if (activeFeatures.length === 0) {
    return { score: 0, confidence: 0 };
  }

  const weightSum = activeFeatures.reduce((sum, feature) => sum + feature.weight, 0);
  if (weightSum <= 0) {
    return { score: 0, confidence: 0 };
  }

  const weightedScore =
    activeFeatures.reduce((sum, feature) => sum + feature.score * feature.weight, 0) /
    weightSum;
  const weightedConfidence =
    activeFeatures.reduce(
      (sum, feature) => sum + feature.confidence * feature.weight,
      0
    ) / weightSum;

  return {
    score: clampScore(weightedScore),
    confidence: clampConfidence(weightedConfidence),
  };
}

function pickTopFactors(
  activeFeatures: FeatureScore[],
  direction: "asc" | "desc"
): FusionFactorSummary[] {
  const sorted = [...activeFeatures].sort((left, right) => {
    if (left.score === right.score) {
      return direction === "desc"
        ? right.confidence - left.confidence
        : left.confidence - right.confidence;
    }
    return direction === "desc" ? right.score - left.score : left.score - right.score;
  });

  return sorted.slice(0, TOP_FACTOR_COUNT).map((feature) => toFactorSummary(feature));
}

function buildWarnings(input: {
  features: FeatureScore[];
  activeFeatures: FeatureScore[];
  ignoredFeatures: FusionFactorSummary[];
  overallConfidence: number;
  options: Required<FeatureFusionOptions>;
}): FusionWarning[] {
  const warnings: FusionWarning[] = [];

  if (input.features.length === 0) {
    warnings.push({
      code: "insufficient_data",
      message: "No feature scores were provided.",
      details: { featureCount: 0 },
    });
    warnings.push({
      code: "too_few_features",
      message: "Too few active features to produce a reliable fusion score.",
      details: { activeFeatureCount: 0, minimum: input.options.minActiveFeatures },
    });
    return warnings;
  }

  if (input.activeFeatures.length < input.options.minActiveFeatures) {
    warnings.push({
      code: "too_few_features",
      message: "Too few active features to produce a reliable fusion score.",
      details: {
        activeFeatureCount: input.activeFeatures.length,
        minimum: input.options.minActiveFeatures,
      },
    });
  }

  if (input.activeFeatures.length === 0) {
    warnings.push({
      code: "insufficient_data",
      message: "All features were ignored due to low confidence.",
      details: { ignoredFeatureCount: input.ignoredFeatures.length },
    });
  }

  if (
    input.activeFeatures.length > 0 &&
    input.overallConfidence < input.options.lowConfidenceThreshold
  ) {
    warnings.push({
      code: "low_confidence",
      message: "Overall fusion confidence is below the reliability threshold.",
      details: {
        overallConfidence: input.overallConfidence,
        threshold: input.options.lowConfidenceThreshold,
      },
    });
  }

  const conflictPairs = detectFeatureConflicts(
    input.activeFeatures,
    input.options.conflictScoreThreshold
  );
  if (conflictPairs.length > 0) {
    warnings.push({
      code: "feature_conflict",
      message: "Strong opposing feature signals were detected.",
      details: { conflicts: conflictPairs },
    });
  }

  const smallSampleFeatures = collectSmallSampleFeatures(
    input.activeFeatures,
    input.options.smallSampleSizeThreshold
  );
  if (smallSampleFeatures.length > 0) {
    warnings.push({
      code: "small_sample_size",
      message: "Some features rely on a very small sample size.",
      details: {
        featureIds: smallSampleFeatures.map((item) => item.id),
        threshold: input.options.smallSampleSizeThreshold,
      },
    });
  }

  return warnings;
}

function detectFeatureConflicts(
  activeFeatures: FeatureScore[],
  threshold: number
): Array<{ positiveId: string; negativeId: string }> {
  const positives = activeFeatures.filter((feature) => feature.score >= threshold);
  const negatives = activeFeatures.filter((feature) => feature.score <= -threshold);
  const conflicts: Array<{ positiveId: string; negativeId: string }> = [];

  for (const positive of positives) {
    for (const negative of negatives) {
      conflicts.push({
        positiveId: positive.id,
        negativeId: negative.id,
      });
    }
  }

  return conflicts.slice(0, 10);
}

function collectSmallSampleFeatures(
  activeFeatures: FeatureScore[],
  threshold: number
): FeatureScore[] {
  return activeFeatures.filter((feature) => {
    const sampleSize = extractSampleSize(feature.metadata);
    return sampleSize !== null && sampleSize < threshold;
  });
}

function extractSampleSize(metadata: Record<string, unknown> | undefined): number | null {
  if (!metadata) {
    return null;
  }

  const direct = metadata.sampleSize;
  if (typeof direct === "number" && Number.isFinite(direct)) {
    return direct;
  }

  const homeSampleSize = metadata.homeSampleSize;
  const awaySampleSize = metadata.awaySampleSize;
  if (
    typeof homeSampleSize === "number" &&
    typeof awaySampleSize === "number" &&
    Number.isFinite(homeSampleSize) &&
    Number.isFinite(awaySampleSize)
  ) {
    return Math.min(homeSampleSize, awaySampleSize);
  }

  const minSampleSize = metadata.minSampleSize;
  if (typeof minSampleSize === "number" && Number.isFinite(minSampleSize)) {
    return minSampleSize;
  }

  return null;
}
