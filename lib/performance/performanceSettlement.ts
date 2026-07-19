import type { DailyRecommendationRecord } from "@/lib/dailyRecommendations/dailyRecommendationTypes";
import {
  formatDailyRecommendationMarket,
  formatDailyRecommendationSelection,
  resolveDailyRecommendationGrade,
} from "@/lib/dailyRecommendations/dailyRecommendationPresentation";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { evaluateRecommendationCandidate } from "@/lib/validation/validationEngine";
import type { RecommendationValidationEntry } from "@/lib/validation/validationTypes";
import type {
  EnrichedDailyRecommendation,
  PerformanceOutcome,
} from "@/lib/performance/performanceTypes";

const DEFAULT_STAKE = 1;

function findMatchingValidationEntry(
  recommendation: DailyRecommendationRecord,
  entries: RecommendationValidationEntry[]
): RecommendationValidationEntry | null {
  for (const entry of entries) {
    const market = formatDailyRecommendationMarket(entry.candidate.marketType);
    const selection = formatDailyRecommendationSelection(entry.candidate.selection);
    if (market === recommendation.market && selection === recommendation.recommendation) {
      return entry;
    }
  }

  return null;
}

function resolveCandidateFromSnapshot(recommendation: DailyRecommendationRecord) {
  const candidates = recommendation.analysisSnapshot?.recommendation?.result?.candidates ?? [];
  for (const candidate of candidates) {
    const market = formatDailyRecommendationMarket(candidate.marketType);
    const selection = formatDailyRecommendationSelection(candidate.selection);
    if (market === recommendation.market && selection === recommendation.recommendation) {
      return candidate;
    }
  }

  return candidates.find((candidate) => candidate.confidence !== "pass") ?? candidates[0] ?? null;
}

export function resolvePlayType(market: string, recommendation: string): string {
  if (market === "獨贏") {
    if (recommendation === "主勝") {
      return "主勝";
    }
    if (recommendation === "客勝") {
      return "客勝";
    }
    if (recommendation === "和局") {
      return "和局";
    }
    return recommendation || "獨贏";
  }

  if (market === "讓分") {
    return "讓球";
  }

  if (market === "大小球") {
    return "大小球";
  }

  if (market === "雙方進球") {
    return "BTTS";
  }

  return market || recommendation || "其他";
}

export function resolveRecommendationOutcome(
  recommendation: DailyRecommendationRecord,
  matchRecord: HistoricalMatchRecord | null | undefined
): { outcome: PerformanceOutcome; hit: boolean | null; profit: number | null } {
  if (!matchRecord) {
    return { outcome: "pending", hit: null, profit: null };
  }

  if (matchRecord.status === "PENDING") {
    return { outcome: "pending", hit: null, profit: null };
  }

  if (matchRecord.status === "FAILED" || matchRecord.status === "CANCELLED") {
    return { outcome: "pending", hit: null, profit: null };
  }

  if (matchRecord.status !== "VERIFIED" || !matchRecord.result) {
    return { outcome: "pending", hit: null, profit: null };
  }

  const validationEntries =
    matchRecord.verificationResult?.recommendationValidation.entries ?? [];
  const matchedEntry = findMatchingValidationEntry(recommendation, validationEntries);
  if (matchedEntry) {
    const hit = matchedEntry.evaluation.hit;
    return {
      outcome: hit ? "hit" : "miss",
      hit,
      profit: matchedEntry.evaluation.profit,
    };
  }

  const candidate = resolveCandidateFromSnapshot(recommendation);
  if (candidate) {
    const evaluation = evaluateRecommendationCandidate(candidate, matchRecord.result);
    return {
      outcome: evaluation.hit ? "hit" : "miss",
      hit: evaluation.hit,
      profit: evaluation.profit,
    };
  }

  return { outcome: "pending", hit: null, profit: null };
}

export function enrichDailyRecommendation(
  recommendation: DailyRecommendationRecord,
  matchRecord: HistoricalMatchRecord | null | undefined
): EnrichedDailyRecommendation {
  const { outcome, hit, profit } = resolveRecommendationOutcome(
    recommendation,
    matchRecord
  );
  const grade = resolveDailyRecommendationGrade(recommendation.score);
  const replayId =
    recommendation.matchRecordId ||
    recommendation.analysisSnapshot?.replay?.match?.matchId ||
    null;

  return {
    recommendation,
    outcome,
    hit,
    profit,
    stake: DEFAULT_STAKE,
    stars: grade.stars,
    playType: resolvePlayType(recommendation.market, recommendation.recommendation),
    replayId,
  };
}
