/**
 * 亞洲盤 Rules Engine — 共用型別、解析、對盤、邊界結算規則。
 */

export type AsianModifier = "plain" | "minus50" | "plus50" | "half";

export type SettlementAtBoundary =
  | "push"
  | "halfLose"
  | "halfWin"
  | "fullResult";

export interface AsianLine {
  raw: string;
  line: number;
  modifier: AsianModifier;
}

const ODDS_LIKE_DECIMAL = /^\d+\.\d{2,3}$/;

function isOddsLikeDecimal(value: string): boolean {
  return ODDS_LIKE_DECIMAL.test(value);
}

/**
 * 解析亞洲盤盤口字串。
 * 禁止把 0-50 當成 0.5、1-50 當成 1.5。
 */
export function parseAsianMarketLine(raw: string): AsianLine | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const drawLine = trimmed.match(/^(\d+)平$/);
  if (drawLine) {
    return {
      raw: trimmed,
      line: Number(drawLine[1]),
      modifier: "plain",
    };
  }

  const minus50 = trimmed.match(/^(\d+)-50$/);
  if (minus50) {
    return {
      raw: trimmed,
      line: Number(minus50[1]),
      modifier: "minus50",
    };
  }

  const plus50 = trimmed.match(/^(\d+)\+50$/);
  if (plus50) {
    return {
      raw: trimmed,
      line: Number(plus50[1]),
      modifier: "plus50",
    };
  }

  if (/^\d+$/.test(trimmed)) {
    return {
      raw: trimmed,
      line: Number(trimmed),
      modifier: "plain",
    };
  }

  if (/^\d+\.5$/.test(trimmed) && !isOddsLikeDecimal(trimmed)) {
    return {
      raw: trimmed,
      line: Number(trimmed),
      modifier: "half",
    };
  }

  return null;
}

/** 由 modifier 還原 legacy water 字串（供 UI / 舊欄位相容）。 */
export function modifierToWater(modifier: AsianModifier): string | null {
  switch (modifier) {
    case "plain":
      return "平水";
    case "minus50":
      return "低水";
    case "plus50":
      return "高水";
    case "half":
      return null;
  }
}

/** 由 AsianLine 還原 raw 盤口字串。 */
export function formatAsianLineRaw(line: AsianLine): string;
export function formatAsianLineRaw(line: number, water: string | null): string;
export function formatAsianLineRaw(
  line: AsianLine | number,
  water?: string | null
): string {
  if (typeof line === "number") {
    if (water === "低水") {
      return `${line}-50`;
    }
    if (water === "高水") {
      return `${line}+50`;
    }
    if (water === "平水") {
      return String(line);
    }
    return String(line);
  }

  const parsed = line;
  if (parsed.modifier === "minus50") {
    return `${parsed.line}-50`;
  }
  if (parsed.modifier === "plus50") {
    return `${parsed.line}+50`;
  }
  if (parsed.modifier === "plain" && /^\d+平$/.test(parsed.raw)) {
    return parsed.raw;
  }
  return parsed.raw;
}

/**
 * 取得對應盤 raw 字串。
 * 0-50 ↔ 0+50；平水整數/小數 .5 保持不變。
 */
export function getOppositeAsianLine(raw: string): string | null {
  const parsed = parseAsianMarketLine(raw);
  if (!parsed) {
    return null;
  }

  if (parsed.modifier === "minus50") {
    return `${parsed.line}+50`;
  }
  if (parsed.modifier === "plus50") {
    return `${parsed.line}-50`;
  }
  return parsed.raw;
}

/** 第二邊未標盤口時，依 anchor 推導對邊 token。 */
export function resolvePairedLineToken(
  anchorToken: string,
  explicitToken: string | null
): string | null {
  if (explicitToken) {
    return explicitToken;
  }
  const parsed = parseAsianMarketLine(anchorToken);
  if (!parsed) {
    return null;
  }
  if (parsed.modifier === "minus50" || parsed.modifier === "plus50") {
    return getOppositeAsianLine(anchorToken);
  }
  return anchorToken;
}

/**
 * 大小球：總進球剛好落在盤口邊界時的結算。
 */
export function getTotalSettlementAtBoundary(
  side: "over" | "under",
  modifier: AsianModifier
): SettlementAtBoundary {
  switch (modifier) {
    case "plain":
      return "push";
    case "half":
      return "fullResult";
    case "minus50":
      return side === "over" ? "halfLose" : "halfWin";
    case "plus50":
      return side === "over" ? "halfWin" : "halfLose";
  }
}

/**
 * 讓分：淨勝球剛好落在盤口邊界時的結算（依下注方向）。
 */
export function getHandicapSettlementAtBoundary(
  side: "home" | "away",
  modifier: AsianModifier
): SettlementAtBoundary {
  void side;
  switch (modifier) {
    case "plain":
      return "push";
    case "half":
      return "fullResult";
    case "minus50":
      return "halfLose";
    case "plus50":
      return "halfWin";
  }
}

export type HandicapAnchorSide = "home" | "away";

/**
 * 讓分正負方向。
 * anchorSide 為該組開盤標籤方（主或客）；下注方與 anchor 相同為讓方（負）。
 */
export function getSignedHandicap(
  betSide: "home" | "away",
  anchorSide: HandicapAnchorSide,
  asianLine: AsianLine
): number {
  const magnitude = asianLine.line;
  if (betSide === anchorSide) {
    return -magnitude;
  }
  return magnitude;
}

/** @deprecated 使用 getOppositeAsianLine */
export function deriveOppositeLineToken(token: string): string | null {
  return getOppositeAsianLine(token);
}

/** @deprecated 使用 parseAsianMarketLine + getOppositeAsianLine */
export function deriveOppositeAsianLineStruct(line: AsianLine): AsianLine {
  const oppositeRaw = getOppositeAsianLine(line.raw);
  if (oppositeRaw) {
    const opposite = parseAsianMarketLine(oppositeRaw);
    if (opposite) {
      return opposite;
    }
  }
  return { ...line };
}
