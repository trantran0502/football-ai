import { calculateProfit } from "@/lib/backtest/betEvaluator";
import { settleBet } from "@/lib/backtest/settlement";
import { runFeatureRecommendationPipeline } from "@/lib/analysis/featureRecommendationPipeline";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { getActionableRecommendations } from "@/lib/recommendation/recommendationPresentation";
import type {
  RecommendationCandidate,
  RecommendationEngineResult,
} from "@/lib/recommendation/recommendationTypes";
import { buildValidationReport } from "@/lib/validation/statistics";
import type {
  RecommendationValidationEntry,
  RecommendationValidationEvaluation,
  RecommendationValidationResult,
  ValidationMarketKey,
  ValidationMatchInput,
} from "@/lib/validation/validationTypes";
import type { MatchResult } from "@/lib/database/matchSchema";
import type { MarketType } from "@/types/match";

const DEFAULT_STAKE = 1;

export function evaluateRecommendationCandidate(
  candidate: RecommendationCandidate,
  matchResult: MatchResult,
  stake: number = DEFAULT_STAKE
): RecommendationValidationEvaluation {
  const result = settleBet(candidate.selection, matchResult);
  const profit = calculateProfit(result, candidate.selection.odds, stake);
  const hit = result === "WIN" || result === "HALF_WIN";

  return {
    result,
    profit,
    hit,
    odds: candidate.selection.odds,
    confidence: candidate.confidence,
    stake,
    expectedValue: candidate.expectedValue,
    score: candidate.score,
  };
}

export function validateMatchRecommendations(
  input: ValidationMatchInput
): RecommendationValidationEntry[] {
  if (!input.recommendation || input.recommendation.globalPass) {
    return [];
  }

  const actionable = getActionableRecommendations(input.recommendation);
  return actionable.map((candidate) => ({
    matchId: input.matchId,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    matchDate: input.matchDate,
    candidate,
    evaluation: evaluateRecommendationCandidate(candidate, input.result),
    marketKey: normalizeMarketKey(candidate.marketType),
    ruleKeys: buildRuleKeys(candidate),
  }));
}

export function runRecommendationValidation(
  input: ValidationMatchInput
): RecommendationValidationResult {
  const entries = validateMatchRecommendations(input);
  const report = buildValidationReport(entries, new Set([input.matchId]));
  return { entries, report };
}

export function runBatchRecommendationValidation(
  inputs: ValidationMatchInput[]
): RecommendationValidationResult {
  const entries = inputs.flatMap((input) => validateMatchRecommendations(input));
  const matchIds = new Set(inputs.map((input) => input.matchId));
  const report = buildValidationReport(entries, matchIds);
  return { entries, report };
}

export function validateVerifiedMatch(
  record: HistoricalMatchRecord,
  recommendation: RecommendationEngineResult | null
): RecommendationValidationResult {
  if (!record.result || record.status !== "VERIFIED") {
    return {
      entries: [],
      report: buildValidationReport([]),
    };
  }

  return runRecommendationValidation({
    matchId: record.id,
    homeTeam: record.homeTeam,
    awayTeam: record.awayTeam,
    matchDate: record.matchDate,
    result: record.result,
    recommendation,
  });
}

export function validateVerifiedMatchFromPipeline(
  record: HistoricalMatchRecord
): RecommendationValidationResult {
  if (!record.result || record.status !== "VERIFIED") {
    return {
      entries: [],
      report: buildValidationReport([]),
    };
  }

  const pipeline = runFeatureRecommendationPipeline(
    {
      league: record.league,
      homeTeam: record.homeTeam,
      awayTeam: record.awayTeam,
      marketSelections: record.marketSelections,
      selections: [],
      unknownMarkets: [],
      moneyline: [],
      handicap: [],
      overUnder: [],
      btts: [],
      oddEven: [],
      otherMarkets: [],
    },
    record.marketSelections
  );

  return validateVerifiedMatch(record, pipeline.recommendation);
}

function normalizeMarketKey(marketType: MarketType): ValidationMarketKey {
  switch (marketType) {
    case "moneyline":
      return "Moneyline";
    case "handicap":
      return "Handicap";
    case "totalGoals":
      return "OverUnder";
    case "btts":
      return "BTTS";
    default:
      return "Moneyline";
  }
}

function buildRuleKeys(candidate: RecommendationCandidate): string[] {
  const keys = new Set<string>([`confidence:${candidate.confidence}`]);
  for (const reason of candidate.reasons) {
    keys.add(`reason:${reason}`);
  }
  return [...keys];
}

export { buildValidationReport } from "@/lib/validation/statistics";
