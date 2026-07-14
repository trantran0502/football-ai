import type { RecommendationLevel } from "@/lib/recommendation/recommendationTypes";
import type { RecommendationEngineResult } from "@/lib/recommendation/recommendationTypes";
import type { RecommendationCandidate } from "@/lib/recommendation/recommendationTypes";
import type { MarketSelection, MarketType } from "@/types/match";

export const EMPTY_RECOMMENDATION_MESSAGE = "目前資料不足，無推薦。";
export const GLOBAL_PASS_HEADLINE = "本場不建議下注";

export const RECOMMENDATION_LEVEL_LABELS: Record<RecommendationLevel, string> = {
  pass: "PASS",
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
};

export const RECOMMENDATION_MARKET_LABELS: Record<
  Extract<MarketType, "moneyline" | "handicap" | "totalGoals" | "btts">,
  string
> = {
  moneyline: "Moneyline",
  handicap: "Handicap",
  totalGoals: "OverUnder",
  btts: "BTTS",
};

export function sortRecommendationCandidates(
  candidates: RecommendationCandidate[]
): RecommendationCandidate[] {
  return [...candidates].sort((left, right) => {
    if (right.score === left.score) {
      const levelOrder: RecommendationLevel[] = ["pass", "low", "medium", "high"];
      return levelOrder.indexOf(right.confidence) - levelOrder.indexOf(left.confidence);
    }
    return right.score - left.score;
  });
}

export function getActionableRecommendations(
  result: RecommendationEngineResult | null
): RecommendationCandidate[] {
  if (!result) {
    return [];
  }
  return sortRecommendationCandidates(
    result.candidates.filter((candidate) => candidate.confidence !== "pass")
  );
}

export function hasRecommendationContent(
  result: RecommendationEngineResult | null
): boolean {
  return Boolean(result && result.candidates.length > 0);
}

export function shouldShowEmptyRecommendationMessage(
  result: RecommendationEngineResult | null
): boolean {
  return !result || result.candidates.length === 0;
}

export function getRecommendationMessage(
  result: RecommendationEngineResult | null
): string {
  if (!result || result.candidates.length === 0) {
    return EMPTY_RECOMMENDATION_MESSAGE;
  }
  if (result.globalPass) {
    return result.passReason ?? GLOBAL_PASS_HEADLINE;
  }
  if (getActionableRecommendations(result).length === 0) {
    return EMPTY_RECOMMENDATION_MESSAGE;
  }
  return "";
}

export function formatRecommendationExpectedValue(value: number): string {
  const percent = Math.round(value * 1000) / 10;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent}%`;
}

export function formatRecommendationScore(score: number): string {
  return score.toFixed(1);
}

export function formatRecommendationSelection(selection: MarketSelection): string {
  const sideLabels: Record<string, string> = {
    home: "主",
    away: "客",
    draw: "和",
    over: "大",
    under: "小",
    yes: "是",
    no: "否",
  };
  const side = sideLabels[selection.side] ?? selection.side;
  const line =
    selection.rawLine ??
    (selection.line !== null ? String(selection.line) : selection.label ?? "");
  const linePart = line ? ` ${line}` : "";
  return `${side}${linePart} @ ${selection.odds}`;
}

export function getRecommendationCardClassName(level: RecommendationLevel): string {
  switch (level) {
    case "high":
      return "rounded-lg border-2 border-amber-400 bg-amber-50 p-4 shadow-sm ring-2 ring-amber-200";
    case "medium":
      return "rounded-lg border border-indigo-300 bg-indigo-50/40 p-4";
    case "low":
      return "rounded-lg border border-slate-200 bg-white p-4";
    case "pass":
    default:
      return "rounded-lg border border-amber-200 bg-amber-50/70 p-4";
  }
}

export function getRecommendationLevelBadgeClassName(
  level: RecommendationLevel
): string {
  switch (level) {
    case "high":
      return "rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900";
    case "medium":
      return "rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700";
    case "low":
      return "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700";
    case "pass":
    default:
      return "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800";
  }
}

export function getRecommendationMarketLabel(
  marketType: MarketType
): string {
  if (marketType in RECOMMENDATION_MARKET_LABELS) {
    return RECOMMENDATION_MARKET_LABELS[
      marketType as keyof typeof RECOMMENDATION_MARKET_LABELS
    ];
  }
  return marketType;
}
