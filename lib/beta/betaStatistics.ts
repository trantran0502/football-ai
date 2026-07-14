import { CURRENT_MODEL_VERSION } from "@/lib/beta/config";
import { getSampleWarning } from "@/lib/beta/sampleWarning";
import { getAllBetaRecommendations } from "@/lib/beta/betaStorage";
import type {
  BetaDashboardStats,
  BetaRecommendationRecord,
} from "@/lib/beta/types";
import type { BetResult } from "@/lib/backtest/types";

function countSettlement(
  records: BetaRecommendationRecord[],
  settlement: BetResult
): number {
  return records.filter((item) => item.settlement === settlement).length;
}

function calcHitRate(records: BetaRecommendationRecord[]): number {
  const verified = records.filter(
    (item) => item.status === "VERIFIED" && item.settlement !== null
  );
  const decisive = verified.filter((item) => item.settlement !== "PUSH");
  if (decisive.length === 0) {
    return 0;
  }
  const hits = decisive.filter((item) => item.hit).length;
  return hits / decisive.length;
}

function calcRoi(records: BetaRecommendationRecord[]): number {
  const verified = records.filter(
    (item) => item.status === "VERIFIED" && item.profit !== null
  );
  if (verified.length === 0) {
    return 0;
  }
  const totalProfit = verified.reduce((sum, item) => sum + (item.profit ?? 0), 0);
  return totalProfit / verified.length;
}

function calcGroupedHitRates(
  records: BetaRecommendationRecord[],
  key: "marketType" | "rulesUsed"
): Record<string, { hits: number; total: number; rate: number }> {
  const groups = new Map<string, { hits: number; total: number }>();

  for (const record of records) {
    if (record.status !== "VERIFIED" || record.settlement === "PUSH") {
      continue;
    }

    const keys =
      key === "marketType"
        ? [record.candidate.marketType]
        : record.rulesUsed;

    for (const groupKey of keys) {
      const bucket = groups.get(groupKey) ?? { hits: 0, total: 0 };
      bucket.total += 1;
      if (record.hit) {
        bucket.hits += 1;
      }
      groups.set(groupKey, bucket);
    }
  }

  return Object.fromEntries(
    [...groups.entries()].map(([name, value]) => [
      name,
      {
        hits: value.hits,
        total: value.total,
        rate: value.total === 0 ? 0 : value.hits / value.total,
      },
    ])
  );
}

function sliceWindow(
  records: BetaRecommendationRecord[],
  size: number
): BetaRecommendationRecord[] {
  return records
    .filter((item) => item.status === "VERIFIED")
    .sort((a, b) => (b.verifiedAt ?? "").localeCompare(a.verifiedAt ?? ""))
    .slice(0, size);
}

export function computeBetaDashboardStats(
  modelVersion: string = CURRENT_MODEL_VERSION
): BetaDashboardStats {
  const all = getAllBetaRecommendations().filter(
    (item) => item.modelVersion === modelVersion
  );
  const verified = all.filter((item) => item.status === "VERIFIED");
  const pending = all.filter((item) => item.status === "PENDING");
  const last20 = sliceWindow(all, 20);
  const last50 = sliceWindow(all, 50);

  const averageOdds =
    all.length === 0
      ? 0
      : all.reduce((sum, item) => sum + item.candidate.odds, 0) / all.length;

  return {
    modelVersion,
    totalRecommendations: all.length,
    verifiedCount: verified.length,
    pendingCount: pending.length,
    wins: countSettlement(verified, "WIN"),
    losses: countSettlement(verified, "LOSE"),
    pushes: countSettlement(verified, "PUSH"),
    halfWins: countSettlement(verified, "HALF_WIN"),
    halfLoses: countSettlement(verified, "HALF_LOSE"),
    hitRate: calcHitRate(verified),
    roi: calcRoi(verified),
    averageOdds,
    marketTypeHitRates: calcGroupedHitRates(verified, "marketType"),
    ruleHitRates: calcGroupedHitRates(verified, "rulesUsed"),
    last20: {
      hits: last20.filter((item) => item.hit).length,
      total: last20.filter((item) => item.settlement !== "PUSH").length,
      rate: calcHitRate(last20),
      roi: calcRoi(last20),
    },
    last50: {
      hits: last50.filter((item) => item.hit).length,
      total: last50.filter((item) => item.settlement !== "PUSH").length,
      rate: calcHitRate(last50),
      roi: calcRoi(last50),
    },
    sampleWarning: getSampleWarning(verified.length),
  };
}
