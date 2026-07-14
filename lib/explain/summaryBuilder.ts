import type {
  ExplainConflict,
  MarketReason,
  RuleReason,
} from "@/lib/explain/types";

const MAX_SUMMARY_POINTS = 5;
const MIN_SUMMARY_POINTS = 2;

function uniquePoints(points: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const point of points) {
    if (seen.has(point)) {
      continue;
    }
    seen.add(point);
    result.push(point);
  }

  return result;
}

function summarizeMarketConsensus(marketReasons: MarketReason[]): string[] {
  const points: string[] = [];

  const moneyline = marketReasons.find((item) => item.marketType === "moneyline");
  const handicap = marketReasons.find((item) => item.marketType === "handicap");
  const totalGoals = marketReasons.find(
    (item) => item.marketType === "totalGoals"
  );
  const btts = marketReasons.find((item) => item.marketType === "btts");

  if (moneyline && handicap) {
    const homeFavorite =
      moneyline.evidence.favorite === "home" &&
      handicap.reasons.some((reason) => reason.includes("支持主隊"));

    const awayFavorite =
      moneyline.evidence.favorite === "away" &&
      handicap.reasons.some((reason) => reason.includes("支持客隊"));

    if (homeFavorite) {
      points.push("市場一致看好主隊。");
    } else if (awayFavorite) {
      points.push("市場一致看好客隊。");
    }
  }

  if (moneyline) {
    points.push(moneyline.reasons[0]);
  }

  if (handicap) {
    const supportReason = handicap.reasons.find((reason) =>
      reason.includes("支持")
    );
    if (supportReason) {
      points.push(supportReason.replace("亞洲盤", "讓分盤"));
    }
  }

  if (totalGoals) {
    const levelReason = totalGoals.reasons.find((reason) =>
      reason.includes("市場預期")
    );
    if (levelReason) {
      const text = levelReason.replace("市場預期", "大小球支持");
      points.push(text.endsWith("。") ? text : `${text}。`);
    }
    const leanReason = totalGoals.reasons.find((reason) =>
      reason.includes("傾向")
    );
    if (leanReason) {
      points.push(leanReason);
    }
  }

  if (btts) {
    points.push(btts.reasons[0]);
  }

  return points;
}

function summarizeRuleOutcomes(ruleReasons: RuleReason[]): string[] {
  const points: string[] = [];

  for (const rule of ruleReasons) {
    if (rule.status === "PASS") {
      points.push(`${rule.displayName} 通過。`);
      continue;
    }
    if (rule.status === "SKIPPED") {
      points.push(`${rule.displayName} 已跳過。`);
    }
  }

  return points;
}

function summarizeConflicts(conflicts: ExplainConflict[]): string[] {
  return conflicts.map((item) => `衝突：${item.message}`);
}

export function buildSummary(input: {
  marketReasons: MarketReason[];
  ruleReasons: RuleReason[];
  conflicts: ExplainConflict[];
}): string[] {
  const points = uniquePoints([
    ...summarizeConflicts(input.conflicts),
    ...summarizeMarketConsensus(input.marketReasons),
    ...summarizeRuleOutcomes(input.ruleReasons),
  ]);

  if (points.length >= MIN_SUMMARY_POINTS) {
    return points.slice(0, MAX_SUMMARY_POINTS);
  }

  if (input.marketReasons.length > 0) {
    for (const market of input.marketReasons) {
      if (points.length >= MIN_SUMMARY_POINTS) {
        break;
      }
      if (market.reasons[0] && !points.includes(market.reasons[0])) {
        points.push(market.reasons[0]);
      }
    }
  }

  if (points.length === 0) {
    return ["尚無足夠盤口資料可供解釋。"];
  }

  while (points.length < MIN_SUMMARY_POINTS && input.ruleReasons.length > 0) {
    const fallback = input.ruleReasons
      .map((rule) => rule.reason)
      .find((reason) => !points.includes(reason));
    if (!fallback) {
      break;
    }
    points.push(fallback);
  }

  return points.slice(0, MAX_SUMMARY_POINTS);
}
