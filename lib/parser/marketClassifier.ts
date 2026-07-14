import type { MarketType } from "@/types/match";
import { isFormalNonAsianMarket } from "@/lib/parser/marketMeta";

const EXACT_MARKET_HEADERS: Record<string, MarketType> = {
  獨贏: "moneyline",
  "1X2": "moneyline",
  "1x2": "moneyline",
  勝平負: "moneyline",
  胜平负: "moneyline",
  上半場獨贏: "moneyline",
  上半场独赢: "moneyline",
  上半独赢: "moneyline",
  上半獨贏: "moneyline",
  亞洲讓分: "handicap",
  亚洲让分: "handicap",
  亞洲让球: "handicap",
  全場讓分: "handicap",
  全场让分: "handicap",
  让球: "handicap",
  讓球: "handicap",
  上半場讓分: "handicap",
  上半场让分: "handicap",
  上半让球: "handicap",
  上半讓球: "handicap",
  大小球: "totalGoals",
  大小: "totalGoals",
  大小盤: "totalGoals",
  大小盘: "totalGoals",
  全場大小: "totalGoals",
  全场大小: "totalGoals",
  上半場大小: "totalGoals",
  上半场大小: "totalGoals",
  上半大小: "totalGoals",
  "Over/Under": "totalGoals",
  "over/under": "totalGoals",
  單隊進球: "teamGoals",
  单队进球: "teamGoals",
  單隊總進球: "teamGoals",
  单队总进球: "teamGoals",
  主隊進球數: "teamGoals",
  主队进球数: "teamGoals",
  客隊進球數: "teamGoals",
  客队进球数: "teamGoals",
  主隊上半場進球數: "teamGoals",
  主队上半场进球数: "teamGoals",
  客隊上半場進球數: "teamGoals",
  客队上半场进球数: "teamGoals",
  BTTS: "btts",
  btts: "btts",
  雙方進球: "btts",
  双方进球: "btts",
  雙方是否都進球: "btts",
  双方是否都进球: "btts",
  雙方得分: "btts",
  双方得分: "btts",
  單雙: "oddEven",
  单双: "oddEven",
  角球: "corners",
  角球数: "corners",
  角球數: "corners",
  角球大小: "corners",
  角球讓分: "corners",
  角球让分: "corners",
  牌数: "cards",
  牌數: "cards",
  罰牌: "cards",
  罚牌: "cards",
  罰牌大小: "cards",
  罚牌大小: "cards",
  罰牌讓分: "cards",
  罚牌让分: "cards",
  黄牌: "cards",
  黃牌: "cards",
  波胆: "correctScore",
  波膽: "correctScore",
  上半場波膽: "correctScore",
  上半场波胆: "correctScore",
  正确比分: "correctScore",
  正確比分: "correctScore",
  半全場: "halfTimeFullTime",
  半全场: "halfTimeFullTime",
  "半場/全場": "halfTimeFullTime",
  "半场/全场": "halfTimeFullTime",
  雙勝彩: "doubleChance",
  双胜彩: "doubleChance",
  最先入球: "firstGoal",
  最后入球: "lastGoal",
  最後入球: "lastGoal",
  上半場獨贏與讓分: "handicap",
  上半场独赢与让分: "handicap",
};

export const TABLE_MARKET_HEADERS = new Set([
  "主客隊伍",
  "主客队伍",
  ...Object.keys(EXACT_MARKET_HEADERS),
  "備註",
  "备注",
]);

export function normalizeMarketHeader(line: string): string {
  return line.replace(/[：:]\s*$/, "").trim();
}

/** 正式非亞洲盤市場（不套用亞洲盤結算規則）。 */
export function isRawOnlyMarketType(marketType: MarketType): boolean {
  return isFormalNonAsianMarket(marketType);
}

function isBttsHeader(normalized: string): boolean {
  return (
    /^btts$/i.test(normalized) ||
    /雙方是否都進球/.test(normalized) ||
    /双方是否都进球/.test(normalized) ||
    /雙方.*進球/.test(normalized) ||
    /双方.*进球/.test(normalized) ||
    /雙方.*得分/.test(normalized) ||
    /双方.*得分/.test(normalized)
  );
}

function isFormalHeader(normalized: string): MarketType | null {
  if (/波胆|波膽|正确比分|正確比分/.test(normalized)) {
    return "correctScore";
  }
  if (/半全場|半全场|半場.*全場|半场.*全场/.test(normalized)) {
    return "halfTimeFullTime";
  }
  if (/雙勝彩|双胜彩/.test(normalized)) {
    return "doubleChance";
  }
  if (/最先入球/.test(normalized)) {
    return "firstGoal";
  }
  if (/最後入球|最后入球/.test(normalized)) {
    return "lastGoal";
  }
  return null;
}

function isTeamGoalsHeader(normalized: string): boolean {
  return (
    /(主隊|主队|客隊|客队|單隊|单队)/.test(normalized) &&
    /(進球|进球)/.test(normalized)
  );
}

function isHalfTotalGoalsHeader(normalized: string): boolean {
  return /上半/.test(normalized) && /(大小球|大小)/.test(normalized);
}

function isSegmentTotalGoalsHeader(normalized: string): boolean {
  return (
    /\d+\s*[~～\-–]\s*\d+\s*分/.test(normalized) &&
    /(大小球|大小)/.test(normalized)
  );
}

function isCombinedHalfMoneylineHandicapHeader(normalized: string): boolean {
  return (
    /上半/.test(normalized) &&
    /(獨贏|独赢)/.test(normalized) &&
    /(讓分|让分|讓球|让球)/.test(normalized)
  );
}

function isHalfCornerHandicapHeader(normalized: string): boolean {
  return /上半/.test(normalized) && /角球/.test(normalized) && /(讓|让)/.test(normalized);
}

function isHalfMoneylineHeader(normalized: string): boolean {
  if (isCombinedHalfMoneylineHandicapHeader(normalized)) {
    return false;
  }
  return (
    /上半/.test(normalized) &&
    /(獨贏|独赢|1X2|1x2|勝平負|胜平负)/.test(normalized)
  );
}

export function isCombinedHalfMlHcHeader(title: string): boolean {
  return isCombinedHalfMoneylineHandicapHeader(normalizeMarketHeader(title));
}

/**
 * 依市場標題辨識 marketType。
 */
export function classifyMarketHeader(title: string): MarketType | null {
  const normalized = normalizeMarketHeader(title);
  const exact = EXACT_MARKET_HEADERS[normalized];
  if (exact) {
    return exact;
  }

  const formal = isFormalHeader(normalized);
  if (formal) {
    return formal;
  }

  if (isBttsHeader(normalized)) {
    return "btts";
  }

  if (isHalfMoneylineHeader(normalized)) {
    return "moneyline";
  }

  if (isHalfTotalGoalsHeader(normalized) || isSegmentTotalGoalsHeader(normalized)) {
    return "totalGoals";
  }

  if (isHalfCornerHandicapHeader(normalized)) {
    return "corners";
  }

  if (/让球|讓球|让分|讓分/.test(normalized)) {
    return "handicap";
  }

  if (/角球/.test(normalized)) {
    return "corners";
  }

  if (/(罰牌|罚牌|牌数|牌數|黄牌|黃牌)/.test(normalized)) {
    return "cards";
  }

  if (isTeamGoalsHeader(normalized)) {
    return "teamGoals";
  }

  if (
    /(進球|进球|大小球|大小)/.test(normalized) &&
    !/雙方|双方/.test(normalized)
  ) {
    return "totalGoals";
  }

  if (/單雙|单双|odd|even/i.test(normalized)) {
    return "oddEven";
  }

  if (/獨贏|独赢|1X2|1x2|勝平負|胜平负/.test(normalized)) {
    return "moneyline";
  }

  return null;
}

export function isKnownMarketHeader(title: string): boolean {
  return classifyMarketHeader(title) !== null;
}
