import {
  assessSnapshotRecommendationEligibility,
  isEligibleForDailyRecommendation,
} from "@/lib/analysis/analysisDataCompleteness";
import type { AnalysisSnapshot } from "@/lib/database/matchSchema";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { resolveDailyRecommendationGrade } from "@/lib/dailyRecommendations/dailyRecommendationPresentation";
import type { DailyRecommendationRankingEntry } from "@/lib/dailyRecommendations/dailyRecommendationRanking";
import {
  DAILY_RECOMMENDATION_CONFIDENCE_THRESHOLD,
  DAILY_RECOMMENDATION_SCORE_THRESHOLD,
  type DailyRecommendationRecord,
} from "@/lib/dailyRecommendations/dailyRecommendationTypes";

export interface DailyRecommendationThresholdDiagnostics {
  rejectedByScore: number;
  rejectedByConfidence: number;
  rejectedByGrade: number;
  eligibleRecommendationCount: number;
}

export interface DailyRecommendationThresholdAssessment {
  eligible: boolean;
  rejectedByScore: boolean;
  rejectedByConfidence: boolean;
  rejectedByGrade: boolean;
}

export function isDataCompletenessStatusComplete(
  snapshot: AnalysisSnapshot | null | undefined
): boolean {
  const metadata = snapshot?.dataCompleteness;
  if (!metadata) {
    return false;
  }
  if (metadata.status === "complete") {
    return true;
  }
  if (metadata.status === "incomplete") {
    return false;
  }
  return metadata.eligibleForRecommendation === true;
}

export function assessDailyRecommendationThreshold(input: {
  score: number;
  confidence: number;
}): DailyRecommendationThresholdAssessment {
  const grade = resolveDailyRecommendationGrade(input.score);
  const rejectedByScore = input.score < DAILY_RECOMMENDATION_SCORE_THRESHOLD;
  const rejectedByConfidence = input.confidence < DAILY_RECOMMENDATION_CONFIDENCE_THRESHOLD;
  const rejectedByGrade = !grade.recommended || grade.grade === "—";

  return {
    eligible: !rejectedByScore && !rejectedByConfidence && !rejectedByGrade,
    rejectedByScore,
    rejectedByConfidence,
    rejectedByGrade,
  };
}

export function isEligibleDailyRecommendationEntry(
  entry: DailyRecommendationRankingEntry
): boolean {
  if (!isEligibleForDailyRecommendation(entry.matchRecord)) {
    return false;
  }
  if (!isDataCompletenessStatusComplete(entry.matchRecord.analysisSnapshot)) {
    return false;
  }

  return assessDailyRecommendationThreshold({
    score: entry.score,
    confidence: entry.confidence,
  }).eligible;
}

export function filterEligibleDailyRecommendationEntries(
  entries: DailyRecommendationRankingEntry[]
): DailyRecommendationRankingEntry[] {
  return entries.filter((entry) => isEligibleDailyRecommendationEntry(entry));
}

export function meetsDailyRecommendationThreshold(
  record: Pick<DailyRecommendationRecord, "score" | "confidence" | "grade">
): boolean {
  const assessment = assessDailyRecommendationThreshold({
    score: record.score,
    confidence: record.confidence,
  });
  return assessment.eligible && record.grade !== "—";
}

export function filterQualifiedDailyRecommendations(
  records: DailyRecommendationRecord[]
): DailyRecommendationRecord[] {
  return records.filter((record) => {
    if (!isDataCompletenessStatusComplete(record.analysisSnapshot)) {
      return false;
    }
    if (record.analysisSnapshot?.pendingPolicy?.excluded) {
      return false;
    }
    if (
      record.analysisSnapshot &&
      !assessSnapshotRecommendationEligibility(record.analysisSnapshot)
        .eligibleForRecommendation
    ) {
      return false;
    }
    return meetsDailyRecommendationThreshold(record);
  });
}

export function computeDailyRecommendationThresholdDiagnostics(
  entries: DailyRecommendationRankingEntry[]
): DailyRecommendationThresholdDiagnostics {
  let rejectedByScore = 0;
  let rejectedByConfidence = 0;
  let rejectedByGrade = 0;
  let eligibleRecommendationCount = 0;

  for (const entry of entries) {
    if (!isEligibleForDailyRecommendation(entry.matchRecord)) {
      continue;
    }
    if (!isDataCompletenessStatusComplete(entry.matchRecord.analysisSnapshot)) {
      continue;
    }

    const assessment = assessDailyRecommendationThreshold({
      score: entry.score,
      confidence: entry.confidence,
    });

    if (assessment.eligible) {
      eligibleRecommendationCount += 1;
      continue;
    }

    if (assessment.rejectedByScore) {
      rejectedByScore += 1;
    }
    if (assessment.rejectedByConfidence) {
      rejectedByConfidence += 1;
    }
    if (assessment.rejectedByGrade) {
      rejectedByGrade += 1;
    }
  }

  return {
    rejectedByScore,
    rejectedByConfidence,
    rejectedByGrade,
    eligibleRecommendationCount,
  };
}
