import type { DailyRecommendationGrade } from "@/lib/dailyRecommendations/dailyRecommendationTypes";
import type { MarketSelection } from "@/types/match";

export const DAILY_RECOMMENDATION_RANK_LABELS: Record<number, string> = {
  1: "🥇 Top 1",
  2: "🥈 Top 2",
  3: "🥉 Top 3",
};

export function resolveDailyRecommendationGrade(score: number): DailyRecommendationGrade {
  if (score >= 95) {
    return { grade: "S", stars: "★★★★★", recommended: true };
  }
  if (score >= 90) {
    return { grade: "A+", stars: "★★★★", recommended: true };
  }
  if (score >= 85) {
    return { grade: "A", stars: "★★★", recommended: true };
  }
  if (score >= 80) {
    return { grade: "B", stars: "★★", recommended: true };
  }
  if (score >= 60) {
    return { grade: "C", stars: "★", recommended: true };
  }
  return { grade: "—", stars: "", recommended: false };
}

export function formatDailyRecommendationMarket(marketType: string): string {
  switch (marketType) {
    case "moneyline":
      return "獨贏";
    case "handicap":
      return "讓分";
    case "totalGoals":
      return "大小球";
    case "btts":
      return "雙方進球";
    default:
      return marketType;
  }
}

export function formatDailyRecommendationSelection(selection: MarketSelection): string {
  const sideLabels: Record<string, string> = {
    home: "主",
    away: "客",
    draw: "和",
    over: "大",
    under: "小",
    yes: "BTTS 是",
    no: "BTTS 否",
  };

  const side = sideLabels[selection.side] ?? selection.side;
  const line =
    selection.rawLine ??
    (selection.line !== null ? String(selection.line) : selection.label ?? "");

  if (selection.marketType === "moneyline") {
    if (selection.side === "home") {
      return "主勝";
    }
    if (selection.side === "away") {
      return "客勝";
    }
    if (selection.side === "draw") {
      return "和局";
    }
  }

  if (selection.marketType === "handicap") {
    const handicapLine = line.startsWith("+") || line.startsWith("-") ? line : line ? `${line}` : "";
    return handicapLine ? `${side} ${handicapLine}` : side;
  }

  if (selection.marketType === "totalGoals") {
    return line ? `${side} ${line}` : side;
  }

  return line ? `${side} ${line}` : side;
}

export function formatKickoffDisplay(
  kickoffTime: string | null,
  matchDate: string
): { date: string; time: string } {
  if (kickoffTime && !Number.isNaN(Date.parse(kickoffTime))) {
    const date = new Date(kickoffTime);
    return {
      date: `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`,
      time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
    };
  }

  const [year, month, day] = matchDate.split("-");
  return {
    date: year && month && day ? `${year}/${month}/${day}` : matchDate,
    time: "—",
  };
}
