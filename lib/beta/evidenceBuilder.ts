import {
  buildBttsReason,
  buildHandicapReason,
  buildMoneylineReason,
  buildTotalGoalsReason,
} from "@/lib/explain/reasonBuilder";
import { countAvailableMarkets } from "@/lib/analysis/marketCoverage";
import type { CrossMarketValidation } from "@/lib/analysis/types";
import type { MarketSelection } from "@/types/match";

export interface MarketEvidenceContext {
  supporting: string[];
  opposing: string[];
  rulesUsed: string[];
  hasMajorConflict: boolean;
  availableMarkets: number;
}

export function buildMarketEvidenceContext(
  markets: MarketSelection[],
  validation: CrossMarketValidation
): MarketEvidenceContext {
  const supporting: string[] = [];
  const opposing: string[] = [];
  const rulesUsed: string[] = [];

  if (validation.moneylineHandicap.status === "PASS") {
    supporting.push(`Rule #1 通過：${validation.moneylineHandicap.reason}`);
    rulesUsed.push("MoneylineHandicapRule");
  } else if (validation.moneylineHandicap.status === "FAIL") {
    opposing.push(`Rule #1 失敗：${validation.moneylineHandicap.reason}`);
  }

  if (validation.handicapTotalGoals.status === "PASS") {
    supporting.push(`Rule #2 通過：${validation.handicapTotalGoals.reason}`);
    rulesUsed.push("HandicapTotalGoalsRule");
  } else if (validation.handicapTotalGoals.status === "FAIL") {
    opposing.push(`Rule #2 失敗：${validation.handicapTotalGoals.reason}`);
  }

  const moneyline = buildMoneylineReason(markets);
  if (moneyline) {
    supporting.push(...moneyline.reasons.slice(0, 2));
  }

  const handicap = buildHandicapReason(markets);
  if (handicap) {
    const supportLine = handicap.reasons.find((item) => item.includes("支持"));
    if (supportLine) {
      supporting.push(supportLine);
    }
  }

  const totalGoals = buildTotalGoalsReason(markets);
  if (totalGoals) {
    const lean = totalGoals.reasons.find((item) => item.includes("傾向"));
    if (lean) {
      supporting.push(lean);
    }
  }

  const btts = buildBttsReason(markets);
  if (btts) {
    supporting.push(btts.reasons[0]);
  }

  const hasMajorConflict =
    validation.moneylineHandicap.status === "FAIL" ||
    validation.handicapTotalGoals.status === "FAIL";

  return {
    supporting: [...new Set(supporting)],
    opposing: [...new Set(opposing)],
    rulesUsed,
    hasMajorConflict,
    availableMarkets: countAvailableMarkets(markets),
  };
}

export function getFavoriteSide(
  markets: MarketSelection[]
): "home" | "away" | "draw" | null {
  const moneyline = markets.filter(
    (item) => item.marketType === "moneyline" && item.period === "full"
  );
  const entries = [
    { side: "home" as const, odds: moneyline.find((item) => item.side === "home")?.odds },
    { side: "draw" as const, odds: moneyline.find((item) => item.side === "draw")?.odds },
    { side: "away" as const, odds: moneyline.find((item) => item.side === "away")?.odds },
  ].filter((item) => item.odds !== undefined);

  if (entries.length === 0) {
    return null;
  }

  return entries.reduce((best, item) =>
    (item.odds ?? Infinity) < (best.odds ?? Infinity) ? item : best
  ).side;
}

export function getHandicapSupportedSide(
  markets: MarketSelection[]
): "home" | "away" | null {
  const handicap = markets.filter(
    (item) => item.marketType === "handicap" && item.period === "full"
  );
  const home = handicap.find((item) => item.side === "home");
  const away = handicap.find((item) => item.side === "away");
  if (!home || !away) {
    return null;
  }
  if (home.odds < away.odds) {
    return "home";
  }
  if (away.odds < home.odds) {
    return "away";
  }
  return null;
}

export function getTotalLeanSide(
  markets: MarketSelection[]
): "over" | "under" | null {
  const totalGoals = markets.filter(
    (item) => item.marketType === "totalGoals" && item.period === "full"
  );
  const over = totalGoals.find((item) => item.side === "over");
  const under = totalGoals.find((item) => item.side === "under");
  if (!over || !under) {
    return null;
  }
  if (over.odds < under.odds) {
    return "over";
  }
  if (under.odds < over.odds) {
    return "under";
  }
  return null;
}

export function getBttsLeanSide(markets: MarketSelection[]): "yes" | "no" | null {
  const btts = markets.filter((item) => item.marketType === "btts" && item.period === "full");
  const yes = btts.find((item) => item.side === "yes");
  const no = btts.find((item) => item.side === "no");
  if (!yes || !no) {
    return null;
  }
  if (yes.odds < no.odds) {
    return "yes";
  }
  if (no.odds < yes.odds) {
    return "no";
  }
  return null;
}
