import {
  CURRENT_MODEL_VERSION,
  ROLLING_WINDOW_SIZE,
} from "@/lib/beta/config";
import { computeBetaDashboardStats } from "@/lib/beta/betaStatistics";
import { getAllBetaRecommendations, saveRollingReport } from "@/lib/beta/betaStorage";
import type { RollingEvaluationReport } from "@/lib/beta/types";

function pickExtreme(
  rates: Record<string, { hits: number; total: number; rate: number }>,
  mode: "best" | "worst"
): string | null {
  const entries = Object.entries(rates).filter(([, value]) => value.total >= 3);
  if (entries.length === 0) {
    return null;
  }

  entries.sort((a, b) =>
    mode === "best" ? b[1].rate - a[1].rate : a[1].rate - b[1].rate
  );
  return entries[0][0];
}

export function buildRollingEvaluationReport(
  modelVersion: string = CURRENT_MODEL_VERSION
): RollingEvaluationReport | null {
  const verified = getAllBetaRecommendations()
    .filter(
      (item) =>
        item.modelVersion === modelVersion && item.status === "VERIFIED"
    )
    .sort((a, b) => (b.verifiedAt ?? "").localeCompare(a.verifiedAt ?? ""));

  if (verified.length < ROLLING_WINDOW_SIZE) {
    return null;
  }

  const window = verified.slice(0, ROLLING_WINDOW_SIZE);
  const stats = computeBetaDashboardStats(modelVersion);

  const bestMarket = pickExtreme(stats.marketTypeHitRates, "best");
  const worstMarket = pickExtreme(stats.marketTypeHitRates, "worst");
  const bestRule = pickExtreme(stats.ruleHitRates, "best");
  const worstRule = pickExtreme(stats.ruleHitRates, "worst");

  const suggestDownweightRules: string[] = [];
  const suggestPauseRules: string[] = [];

  for (const [rule, value] of Object.entries(stats.ruleHitRates)) {
    if (value.total >= 5 && value.rate < 0.35) {
      suggestDownweightRules.push(rule);
    }
    if (value.total >= 8 && value.rate < 0.25) {
      suggestPauseRules.push(rule);
    }
  }

  return {
    evaluatedAt: new Date().toISOString(),
    modelVersion,
    windowSize: ROLLING_WINDOW_SIZE,
    hitRate: stats.last20.rate,
    roi: stats.last20.roi,
    bestMarketType: bestMarket,
    worstMarketType: worstMarket,
    bestRule,
    worstRule,
    suggestDownweightRules,
    suggestPauseRules,
    notes: [
      "此報告僅為建議，不會自動修改 Rule 或權重。",
      `樣本警告：${stats.sampleWarning}`,
    ],
  };
}

export function maybeGenerateRollingReport(
  modelVersion: string = CURRENT_MODEL_VERSION
): RollingEvaluationReport | null {
  const verifiedCount = getAllBetaRecommendations().filter(
    (item) => item.modelVersion === modelVersion && item.status === "VERIFIED"
  ).length;

  if (verifiedCount === 0 || verifiedCount % ROLLING_WINDOW_SIZE !== 0) {
    return null;
  }

  const report = buildRollingEvaluationReport(modelVersion);
  if (report) {
    saveRollingReport(report);
  }
  return report;
}
