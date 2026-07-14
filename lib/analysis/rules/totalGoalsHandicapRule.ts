import type { MarketSelection } from "@/types/match";

export type TotalGoalsHandicapStrength =
  | "strong"
  | "medium"
  | "weak"
  | "conflict";

export interface TotalGoalsHandicapRuleResult {
  consistent: boolean;
  strength: TotalGoalsHandicapStrength;
  reason: string;
}

export interface TotalGoalsHandicapRuleInput {
  handicap: MarketSelection[];
  totalGoals: MarketSelection[];
}

const DEEP_HANDICAP_LOW_TOTAL_REASON = "讓分深，但總進球預期偏低。";

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

function isDeepHomeHandicap(selection: MarketSelection): boolean {
  return (selection.line ?? 0) >= 1.5;
}

function isHomeHandicapOne(selection: MarketSelection): boolean {
  return selection.line === 1 && selection.modifier === "plain";
}

function getTotalGoalsLine(totalGoals: MarketSelection[]): number | null {
  const over = totalGoals.find((item) => item.side === "over");
  const under = totalGoals.find((item) => item.side === "under");
  const line = over?.line ?? under?.line ?? null;
  return line !== null && Number.isFinite(line) ? line : null;
}

/**
 * Rule 2：Handicap × Total Goals 一致性。
 */
export function totalGoalsHandicapRule(
  input: TotalGoalsHandicapRuleInput
): TotalGoalsHandicapRuleResult {
  const homeHandicap = input.handicap.find((item) => item.side === "home");
  const totalLine = getTotalGoalsLine(input.totalGoals);

  if (!homeHandicap || totalLine === null) {
    return {
      consistent: true,
      strength: "weak",
      reason: "缺少 Handicap 或 Total Goals 資料，無法套用 Rule 2。",
    };
  }

  if (isLevelZeroHandicap(homeHandicap) && totalLine >= 4) {
    return {
      consistent: false,
      strength: "conflict",
      reason: "讓分平手，但大小球盤口偏高，敘事不一致。",
    };
  }

  if (isDeepHomeHandicap(homeHandicap) && totalLine <= 2) {
    return {
      consistent: false,
      strength: "conflict",
      reason: DEEP_HANDICAP_LOW_TOTAL_REASON,
    };
  }

  if (isHomeHandicapOne(homeHandicap) && totalLine === 3) {
    return {
      consistent: true,
      strength: "strong",
      reason: "主讓 1 球，大小球 3 球，讓分與進球敘事一致。",
    };
  }

  if (isLevelZeroHandicap(homeHandicap) && totalLine === 2) {
    return {
      consistent: true,
      strength: "medium",
      reason: "讓分平手，大小球 2 球，敘事大致一致。",
    };
  }

  return {
    consistent: true,
    strength: "weak",
    reason: "Rule 2 未涵蓋此 Handicap × Total Goals 組合。",
  };
}
