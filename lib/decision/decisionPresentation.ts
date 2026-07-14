import type { DecisionLevel } from "@/lib/decision/decisionTypes";
import { decisionScoreToStars } from "@/lib/decision/decisionScoring";

export const DECISION_LEVEL_LABELS: Record<DecisionLevel, string> = {
  PASS: "PASS",
  WATCH: "WATCH",
  "SMALL BET": "SMALL BET",
  "NORMAL BET": "NORMAL BET",
  "STRONG BET": "STRONG BET",
};

export function formatDecisionStars(score: number): string {
  const count = decisionScoreToStars(score);
  return "★".repeat(count) + "☆".repeat(5 - count);
}

export function getDecisionBadgeClassName(decision: DecisionLevel): string {
  switch (decision) {
    case "STRONG BET":
      return "rounded-full bg-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-900";
    case "NORMAL BET":
      return "rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800";
    case "SMALL BET":
      return "rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800";
    case "WATCH":
      return "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800";
    case "PASS":
    default:
      return "rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700";
  }
}

export function formatDecisionScore(score: number): string {
  return score.toFixed(0);
}

export function formatDecisionPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
