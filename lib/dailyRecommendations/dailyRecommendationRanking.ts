import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  DAILY_RECOMMENDATION_MAX_PICKS,
  type DailyRecommendationRecord,
} from "@/lib/dailyRecommendations/dailyRecommendationTypes";
import {
  formatDailyRecommendationMarket,
  formatDailyRecommendationSelection,
  resolveDailyRecommendationGrade,
} from "@/lib/dailyRecommendations/dailyRecommendationPresentation";
import { isBettableMatchRecordForRecommendation } from "@/lib/dailyRecommendations/bettableRecommendationFilter";
import { isEligibleForDailyRecommendation } from "@/lib/analysis/analysisDataCompleteness";
import {
  computeDailyRecommendationThresholdDiagnostics,
  filterEligibleDailyRecommendationEntries,
  type DailyRecommendationThresholdDiagnostics,
} from "@/lib/dailyRecommendations/dailyRecommendationThresholdFilter";
import type { RecommendationCandidate } from "@/lib/recommendation/recommendationTypes";
import { sortRecommendationCandidates } from "@/lib/recommendation/recommendationPresentation";

export interface DailyRecommendationRankingEntry {
  matchRecord: HistoricalMatchRecord;
  candidate: RecommendationCandidate;
  score: number;
  confidence: number;
  reasoning: string[];
}

export interface BuildDailyRecommendationsInput {
  matchDate: string;
  schedulerRunId: string;
  records: HistoricalMatchRecord[];
  now?: () => Date;
}

function resolveFusionConfidence(record: HistoricalMatchRecord): number {
  const fusionConfidence = record.analysisSnapshot?.recommendation?.fusion?.overallConfidence;
  if (typeof fusionConfidence === "number" && Number.isFinite(fusionConfidence)) {
    return fusionConfidence <= 1 ? fusionConfidence : fusionConfidence / 100;
  }

  const providerConfidence =
    record.analysisSnapshot?.recommendation?.result?.providerOverallConfidence;
  if (typeof providerConfidence === "number" && Number.isFinite(providerConfidence)) {
    return providerConfidence <= 1 ? providerConfidence : providerConfidence / 100;
  }

  return 0;
}

export function computeDailyRecommendationScore(
  candidate: RecommendationCandidate,
  fusionConfidence: number
): number {
  const magnitude = Math.abs(candidate.score);
  const confidencePercent = Math.min(1, Math.max(0, fusionConfidence)) * 100;
  return Math.round(Math.min(100, Math.max(0, magnitude * 0.7 + confidencePercent * 0.3)));
}

export function computeDailyRecommendationConfidence(fusionConfidence: number): number {
  return Math.round(Math.min(100, Math.max(0, fusionConfidence <= 1 ? fusionConfidence * 100 : fusionConfidence)));
}

function pickBestCandidate(record: HistoricalMatchRecord): RecommendationCandidate | null {
  const result = record.analysisSnapshot?.recommendation?.result ?? null;
  if (!result || result.candidates.length === 0) {
    return null;
  }

  const sorted = sortRecommendationCandidates(result.candidates);
  const actionable = sorted.filter((candidate) => candidate.confidence !== "pass");
  return actionable[0] ?? sorted[0] ?? null;
}

function buildReasoning(
  record: HistoricalMatchRecord,
  candidate: RecommendationCandidate
): string[] {
  const result = record.analysisSnapshot?.recommendation?.result ?? null;
  const merged = [
    ...candidate.reasons,
    ...(result?.evidenceSummary ?? []),
    ...candidate.supportingFeatures.map((feature) => `${feature} 支持此方向`),
  ]
    .map((item) => item.trim())
    .filter(Boolean);

  const unique = [...new Set(merged)];
  if (unique.length >= 3) {
    return unique.slice(0, 5);
  }

  if (unique.length > 0) {
    return unique;
  }

  return ["AI 綜合評分為今日最佳選項"];
}

export function rankDailyRecommendationEntries(
  records: HistoricalMatchRecord[]
): DailyRecommendationRankingEntry[] {
  const entries: DailyRecommendationRankingEntry[] = [];

  for (const record of records) {
    const candidate = pickBestCandidate(record);
    if (!candidate) {
      continue;
    }

    const fusionConfidence = resolveFusionConfidence(record);
    entries.push({
      matchRecord: record,
      candidate,
      score: computeDailyRecommendationScore(candidate, fusionConfidence),
      confidence: computeDailyRecommendationConfidence(fusionConfidence),
      reasoning: buildReasoning(record, candidate),
    });
  }

  return entries.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }
    return left.matchRecord.homeTeam.localeCompare(right.matchRecord.homeTeam);
  });
}

export function selectDailyRecommendationEntries(
  entries: DailyRecommendationRankingEntry[]
): DailyRecommendationRankingEntry[] {
  if (entries.length === 0) {
    return [];
  }

  const qualified = filterEligibleDailyRecommendationEntries(entries);
  return qualified.slice(0, DAILY_RECOMMENDATION_MAX_PICKS);
}

export interface DailyRecommendationBuildResult {
  records: DailyRecommendationRecord[];
  diagnostics: DailyRecommendationThresholdDiagnostics;
}

export function buildDailyRecommendationRecordsWithDiagnostics(
  input: BuildDailyRecommendationsInput
): DailyRecommendationBuildResult {
  const nowFn = input.now ?? (() => new Date());
  const currentTime = nowFn();
  const dayRecords = input.records.filter(
    (record) =>
      record.matchDate === input.matchDate &&
      isBettableMatchRecordForRecommendation(record, currentTime) &&
      isEligibleForDailyRecommendation(record)
  );
  const ranked = rankDailyRecommendationEntries(dayRecords);
  const diagnostics = computeDailyRecommendationThresholdDiagnostics(ranked);
  const selected = selectDailyRecommendationEntries(ranked);

  return {
    diagnostics,
    records: selected.map((entry, index) => {
      const { matchRecord, candidate, score, confidence, reasoning } = entry;
      const grade = resolveDailyRecommendationGrade(score);
      const kickoffTime = matchRecord.analysisSnapshot?.replay?.match?.matchTime ?? null;

      return {
        id: crypto.randomUUID(),
        schedulerRun: input.schedulerRunId,
        fixtureId: matchRecord.fixtureId ?? null,
        matchDate: matchRecord.matchDate,
        kickoffTime,
        leagueId: matchRecord.leagueId ?? null,
        leagueName: matchRecord.league || "未分類",
        country: "",
        homeTeam: matchRecord.homeTeam,
        awayTeam: matchRecord.awayTeam,
        market: formatDailyRecommendationMarket(candidate.marketType),
        recommendation: formatDailyRecommendationSelection(candidate.selection),
        odds: candidate.selection.odds,
        confidence,
        score,
        rank: index + 1,
        grade: grade.recommended ? grade.grade : "—",
        reasoning,
        analysisSnapshot: matchRecord.analysisSnapshot,
        matchRecordId: matchRecord.id,
        createdAt: currentTime.toISOString(),
      };
    }),
  };
}

export function buildDailyRecommendationRecords(
  input: BuildDailyRecommendationsInput
): DailyRecommendationRecord[] {
  return buildDailyRecommendationRecordsWithDiagnostics(input).records;
}
