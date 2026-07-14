import type { MarketFamily, MarketPeriod, MarketType } from "@/types/match";

/** 依內容特徵判斷亞洲盤家族（不依市場名稱硬寫）。 */
export function detectAsianFamilyFromContent(
  content: string | string[]
): "asianHandicap" | "asianOverUnder" | null {
  const text = Array.isArray(content) ? content.join(" ") : content;
  if (/[主客](?:\(|\d)/.test(text)) {
    return "asianHandicap";
  }
  if (/[大小](?:\(|\d)|(?:^|\s)[大小]\s/.test(text)) {
    return "asianOverUnder";
  }
  return null;
}

/** 是否為二選一亞洲盤（讓分或大小）。 */
export function isAsianTwoWayMarket(
  marketType: MarketType,
  title: string
): boolean {
  if (marketType === "handicap") {
    return true;
  }

  if (marketType === "totalGoals" || marketType === "teamGoals") {
    return true;
  }

  if (marketType === "corners" || marketType === "cards") {
    return /大小|让|讓|让分|讓分|让球|讓球/.test(title) || !/讓|让/.test(title);
  }

  return false;
}

/** 解析市場家族，不寫死單一玩法名稱。 */
export function resolveMarketFamily(
  marketType: MarketType,
  title: string
): MarketFamily {
  switch (marketType) {
    case "handicap":
      return "asianHandicap";
    case "moneyline":
      return "moneyline";
    case "btts":
      return "btts";
    case "oddEven":
      return "oddEven";
    case "correctScore":
      return "correctScore";
    case "halfTimeFullTime":
      return "halfTimeFullTime";
    case "doubleChance":
      return "doubleChance";
    case "firstGoal":
    case "lastGoal":
    case "special":
      return "special";
    case "totalGoals":
    case "teamGoals":
      return "asianOverUnder";
    case "corners":
    case "cards":
      if (/让|讓|让分|讓分|让球|讓球/.test(title)) {
        return "asianHandicap";
      }
      return "asianOverUnder";
    default:
      return "generic";
  }
}

/** 依標題推斷全場 / 半場 / 分鐘區間。 */
export function inferMarketPeriod(title: string): MarketPeriod {
  if (/分鐘|分钟|\d+\s*[-~–]\s*\d+\s*分/.test(title)) {
    return "segment";
  }
  if (/上半|上半场|半場|半场/.test(title)) {
    return "half";
  }
  return "full";
}

/** 亞洲盤主標籤（開盤方）與副標籤。 */
export function getAsianPrimarySecondaryLabels(
  family: "asianHandicap" | "asianOverUnder"
): { primary: readonly string[]; secondary: readonly string[] } {
  if (family === "asianHandicap") {
    return { primary: ["主", "客"], secondary: ["主", "客"] };
  }
  return { primary: ["大", "小"], secondary: ["大", "小"] };
}

/** 是否為正式非亞洲盤市場（波膽、半全場等特殊玩法）。 */
export function isFormalNonAsianMarket(marketType: MarketType): boolean {
  return (
    marketType === "correctScore" ||
    marketType === "halfTimeFullTime" ||
    marketType === "doubleChance" ||
    marketType === "firstGoal" ||
    marketType === "lastGoal" ||
    marketType === "special"
  );
}

/** 標籤是否表示讓分盤的客隊開盤。 */
export function labelToHandicapAnchorSide(
  label: string
): "home" | "away" | null {
  if (label === "主") {
    return "home";
  }
  if (label === "客") {
    return "away";
  }
  return null;
}

export function labelToOverUnderSide(label: string): "over" | "under" | null {
  if (label === "大") {
    return "over";
  }
  if (label === "小") {
    return "under";
  }
  return null;
}
