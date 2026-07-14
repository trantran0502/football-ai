import {
  getMoneylineStrength,
  MoneylineStrength,
} from "@/lib/knowledge/rules/moneylineStrength";
import type { MarketSelection } from "@/types/match";

export type MoneylineHandicapStrength =
  | "strong"
  | "medium"
  | "weak"
  | "conflict";

export interface MoneylineHandicapRuleResult {
  consistent: boolean;
  strength: MoneylineHandicapStrength;
  reason: string;
}

export interface MoneylineHandicapRuleInput {
  moneyline: MarketSelection[];
  handicap: MarketSelection[];
}

const CONFLICT_REASON =
  "Moneyline 顯示主隊明顯熱門，但亞洲讓分未反映相同強度。";

function isHomeMoneylineFavorite(moneyline: MarketSelection[]): boolean {
  const home = moneyline.find((item) => item.side === "home");
  if (!home) {
    return false;
  }

  const homeOdds = home.odds;
  const awayOdds = moneyline.find((item) => item.side === "away")?.odds;
  const drawOdds = moneyline.find((item) => item.side === "draw")?.odds;

  if (awayOdds !== undefined && homeOdds >= awayOdds) {
    return false;
  }
  if (drawOdds !== undefined && homeOdds >= drawOdds) {
    return false;
  }

  return true;
}

function isClearlyHomeFavorite(strength: MoneylineStrength): boolean {
  return (
    strength === MoneylineStrength.SUPER_HEAVY_FAVORITE ||
    strength === MoneylineStrength.HEAVY_FAVORITE ||
    strength === MoneylineStrength.FAVORITE
  );
}

function isSuperHomeFavorite(strength: MoneylineStrength): boolean {
  return (
    strength === MoneylineStrength.SUPER_HEAVY_FAVORITE ||
    strength === MoneylineStrength.HEAVY_FAVORITE
  );
}

function isLevelZeroHandicap(selection: MarketSelection): boolean {
  if ((selection.line ?? 0) !== 0) {
    return false;
  }

  const raw = selection.rawLine ?? "";
  if (raw === "0" || raw === "0-50" || raw === "0+50" || raw === "0平") {
    return true;
  }

  const modifier = selection.modifier;
  return modifier === "plain" || modifier === "minus50" || modifier === "plus50";
}

function isHalfPointHandicap(selection: MarketSelection): boolean {
  return selection.line === 0.5 && selection.modifier === "half";
}

function isOneOrMoreHandicap(selection: MarketSelection): boolean {
  return (selection.line ?? -1) >= 1;
}

/**
 * Rule 1：Moneyline × Handicap 一致性（僅主隊熱門情境）。
 */
export function moneylineHandicapRule(
  input: MoneylineHandicapRuleInput
): MoneylineHandicapRuleResult {
  const homeSelection = input.moneyline.find((item) => item.side === "home");
  const homeHandicap = input.handicap.find((item) => item.side === "home");

  if (!homeSelection || !homeHandicap) {
    return {
      consistent: true,
      strength: "weak",
      reason: "缺少 Moneyline 或 Handicap 主隊資料，無法套用 Rule 1。",
    };
  }

  if (!isHomeMoneylineFavorite(input.moneyline)) {
    return {
      consistent: true,
      strength: "weak",
      reason: "Rule 1 僅適用於 Moneyline 主隊為熱門的情境。",
    };
  }

  const moneylineStrength = getMoneylineStrength(homeSelection.odds);

  if (isClearlyHomeFavorite(moneylineStrength) && isLevelZeroHandicap(homeHandicap)) {
    return {
      consistent: false,
      strength: "conflict",
      reason: CONFLICT_REASON,
    };
  }

  if (isSuperHomeFavorite(moneylineStrength) && isOneOrMoreHandicap(homeHandicap)) {
    return {
      consistent: true,
      strength: "strong",
      reason: "Moneyline 顯示主隊超級熱門，亞洲讓分讓 1 球或以上，強度一致。",
    };
  }

  if (isHalfPointHandicap(homeHandicap)) {
    return {
      consistent: true,
      strength: "medium",
      reason: "Moneyline 顯示主隊熱門，亞洲讓分讓 0.5 球，強度大致一致。",
    };
  }

  return {
    consistent: true,
    strength: "weak",
    reason: "Rule 1 未涵蓋此 Moneyline × Handicap 組合。",
  };
}
