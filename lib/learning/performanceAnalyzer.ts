import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { RecommendationValidationEntry } from "@/lib/validation/validationTypes";
import { REPLAY_SNAPSHOT_VERSION } from "@/lib/replay/replayTypes";
import { validateDecisionOnRecord } from "@/lib/decision/decisionValidation";
import type {
  DecisionHistoryRecord,
  FeatureHistoryRecord,
  LearningEngineInput,
  RecommendationHistoryRecord,
} from "@/lib/learning/learningTypes";

export interface TaggedValidationEntry extends RecommendationValidationEntry {
  league: string;
  modelVersion: string;
}

export function collectLearningInputFromRecords(
  records: HistoricalMatchRecord[]
): LearningEngineInput {
  const verified = records.filter((record) => record.status === "VERIFIED");
  const validationResults: TaggedValidationEntry[] = [];
  const recommendationHistory: RecommendationHistoryRecord[] = [];
  const featureHistory: FeatureHistoryRecord[] = [];
  const decisionHistory: DecisionHistoryRecord[] = [];

  for (const record of verified) {
    const modelVersion = resolveModelVersion(record);
    const entries =
      record.verificationResult?.recommendationValidation?.entries ?? [];

    for (const entry of entries) {
      validationResults.push({
        ...entry,
        league: record.league || "Unknown",
        modelVersion,
      });
    }

    const recommendation = record.analysisSnapshot?.recommendation?.result ?? null;
    recommendationHistory.push({
      matchId: record.id,
      matchDate: record.matchDate,
      league: record.league,
      homeTeam: record.homeTeam,
      awayTeam: record.awayTeam,
      modelVersion,
      recommendation,
      validationEntries: entries,
    });

    const fusion = record.analysisSnapshot?.recommendation?.fusion ?? null;
    const supportingFeatures = collectSupportingFeatures(entries, recommendation);
    featureHistory.push({
      matchId: record.id,
      modelVersion,
      features: record.analysisSnapshot?.features ?? [],
      fusion,
      supportingFeatures,
    });

    decisionHistory.push({
      matchId: record.id,
      modelVersion,
      decision: record.analysisSnapshot?.decision ?? null,
      validationEntry: validateDecisionOnRecord(record),
    });
  }

  return {
    validationResults,
    recommendationHistory,
    featureHistory,
    decisionHistory,
  };
}

export function resolveModelVersion(record: HistoricalMatchRecord): string {
  return record.analysisSnapshot?.replay?.version ?? REPLAY_SNAPSHOT_VERSION;
}

function collectSupportingFeatures(
  entries: RecommendationValidationEntry[],
  recommendation: RecommendationHistoryRecord["recommendation"]
): string[] {
  const fromEntries = entries.flatMap((entry) => entry.candidate.supportingFeatures);
  const fromRecommendation =
    recommendation?.candidates.flatMap((candidate) => candidate.supportingFeatures) ?? [];
  return [...new Set([...fromEntries, ...fromRecommendation])];
}

export function resolveFeatureContributionScore(input: {
  feature: string;
  recordMatchId: string;
  entry: RecommendationValidationEntry;
  featureHistory: FeatureHistoryRecord[];
}): number {
  const history = input.featureHistory.find((item) => item.matchId === input.recordMatchId);
  if (!history?.fusion) {
    return input.entry.evaluation.score;
  }

  const normalizedFeature = input.feature.trim().toLowerCase();
  const factors = [
    ...history.fusion.strongestFactors,
    ...history.fusion.weakestFactors,
    ...history.fusion.ignoredFeatures,
  ];

  const matched = factors.find((factor) => {
    const id = factor.id.toLowerCase();
    const reason = factor.reason.toLowerCase();
    return (
      id.includes(normalizedFeature) ||
      reason.includes(normalizedFeature) ||
      normalizedFeature.includes(factor.sourceCategory.toLowerCase())
    );
  });

  return matched?.score ?? input.entry.evaluation.score;
}
