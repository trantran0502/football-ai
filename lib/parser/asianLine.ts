/**
 * 亞洲盤 token 解析與順序群組解析（標籤優先，賠率綁定該標籤）。
 */
import {
  getOppositeAsianLine,
  modifierToWater,
  parseAsianMarketLine,
  resolvePairedLineToken,
  type AsianLine,
  type HandicapAnchorSide,
} from "@/lib/parser/asianRules";
import { isOddsToken } from "@/lib/parser/oddsUtils";

/** @deprecated 使用 AsianLine + modifier；保留供 legacy 相容 */
export interface AsianMarketLine {
  raw: string;
  line: number;
  water: string | null;
}

/** @deprecated */
export interface AsianMarketSide extends AsianMarketLine {
  odds: string;
}

export { parseAsianMarketLine } from "@/lib/parser/asianRules";
export {
  getOppositeAsianLine,
  getTotalSettlementAtBoundary,
  getHandicapSettlementAtBoundary,
  getSignedHandicap,
  modifierToWater,
  resolvePairedLineToken,
  deriveOppositeLineToken,
} from "@/lib/parser/asianRules";

export function asianLineToLegacy(line: AsianLine): AsianMarketLine {
  return {
    raw: line.raw,
    line: line.line,
    water: modifierToWater(line.modifier),
  };
}

export function extractParenthesisInner(text: string): string | null {
  const match = text.match(/\(([^)]+)\)/);
  return match?.[1]?.trim() ?? null;
}

export function resolveAsianLineToken(text: string): string | null {
  const inner = extractParenthesisInner(text);
  if (inner && parseAsianMarketLine(inner)) {
    return inner;
  }
  if (parseAsianMarketLine(text)) {
    return text;
  }
  return null;
}

export function findAsianLineTokenInContent(content: string): string | null {
  const labeledMatch = content.match(/(?:大|小|主|客)\(([^)]+)\)/);
  if (labeledMatch?.[1] && parseAsianMarketLine(labeledMatch[1])) {
    return labeledMatch[1];
  }

  for (const match of content.matchAll(/\(([^)]+)\)/g)) {
    if (parseAsianMarketLine(match[1])) {
      return match[1];
    }
  }

  for (const token of content.split(/\s+/)) {
    const resolved = resolveAsianLineToken(token);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

export function parseAsianLineFromToken(text: string): AsianMarketLine | null {
  const token = resolveAsianLineToken(text);
  if (!token) {
    return null;
  }
  const parsed = parseAsianMarketLine(token);
  return parsed ? asianLineToLegacy(parsed) : null;
}

export function isAsianMarketLineToken(line: string): boolean {
  return resolveAsianLineToken(line) !== null;
}

export function isLabeledParenthesisLine(line: string): boolean {
  return /^(大|小|主|客)\([^)]+\)$/.test(line);
}

/** @deprecated */
export function deriveOppositeAsianLine(line: AsianMarketLine): AsianMarketLine {
  const oppositeRaw = getOppositeAsianLine(line.raw);
  if (oppositeRaw) {
    const opposite = parseAsianMarketLine(oppositeRaw);
    if (opposite) {
      return asianLineToLegacy(opposite);
    }
  }
  return { ...line };
}

export function buildAsianMarketSide(
  token: string,
  odds: string
): AsianMarketSide | null {
  const parsed = parseAsianMarketLine(token);
  if (!parsed) {
    return null;
  }
  return { ...asianLineToLegacy(parsed), odds };
}

export function buildOppositeAsianMarketSide(
  side: AsianMarketSide,
  odds: string
): AsianMarketSide {
  const oppositeRaw = getOppositeAsianLine(side.raw);
  const opposite = oppositeRaw ? parseAsianMarketLine(oppositeRaw) : null;
  return {
    ...(opposite ? asianLineToLegacy(opposite) : side),
    odds,
  };
}

export function formatAsianLineRaw(line: number, water: string | null): string {
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

function parseSideLabelToken(
  text: string,
  label: string
): { label: string; token: string | null } | null {
  if (text === label) {
    return { label, token: null };
  }

  const paren = text.match(new RegExp(`^${label}\\(([^)]+)\\)$`));
  if (paren?.[1]) {
    const token = paren[1].trim();
    if (parseAsianMarketLine(token)) {
      return { label, token };
    }
  }

  const bare = text.match(
    new RegExp(`^${label}(\\d+(?:[+\\-]50)?(?:平)?|\\d+\\.5)$`)
  );
  if (bare?.[1] && parseAsianMarketLine(bare[1])) {
    return { label, token: bare[1] };
  }

  return null;
}

function tryParseAnyLabel(
  text: string,
  labels: readonly string[]
): { label: string; token: string | null } | null {
  for (const label of labels) {
    const parsed = parseSideLabelToken(text, label);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

function isPairSecondary(
  label: string,
  anchorSide: SequentialAsianGroup["anchorSide"],
  kind: AsianMarketKind
): boolean {
  if (kind === "asianHandicap") {
    if (anchorSide === "home") {
      return label === "客";
    }
    if (anchorSide === "away") {
      return label === "主";
    }
  } else {
    if (anchorSide === "over") {
      return label === "小";
    }
    if (anchorSide === "under") {
      return label === "大";
    }
  }
  return false;
}

function isGroupComplete(group: SequentialAsianGroup, kind: AsianMarketKind): boolean {
  const labels = new Set(group.sides.map((side) => side.sideLabel));
  return kind === "asianHandicap"
    ? labels.has("主") && labels.has("客")
    : labels.has("大") && labels.has("小");
}

export type AsianMarketKind = "asianHandicap" | "asianOverUnder";

export interface SequentialAsianGroupSide {
  sideLabel: string;
  token: string;
  odds: string;
}

export interface SequentialAsianGroup {
  anchorToken: string;
  anchorSide: HandicapAnchorSide | "over" | "under";
  sides: SequentialAsianGroupSide[];
}

function tokenizeSequentialInput(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : [input];
  return parts.flatMap((part) => part.split(/\s+/)).filter(Boolean);
}

function labelToAnchorSide(
  label: string,
  kind: AsianMarketKind
): SequentialAsianGroup["anchorSide"] {
  if (kind === "asianHandicap") {
    return label === "客" ? "away" : "home";
  }
  return label === "小" ? "under" : "over";
}

/**
 * 依序解析亞洲盤群組：標籤建立 line，後續賠率只綁該標籤。
 */
export function parseSequentialAsianLineGroups(
  input: string | string[],
  _primaryLabel: "主" | "大",
  _secondaryLabel: "客" | "小",
  kind: AsianMarketKind
): SequentialAsianGroup[] {
  const allLabels =
    kind === "asianHandicap" ? (["主", "客"] as const) : (["大", "小"] as const);

  const tokens = tokenizeSequentialInput(input);
  const groups: SequentialAsianGroup[] = [];
  let anchorToken: string | null = null;
  let anchorSide: SequentialAsianGroup["anchorSide"] | null = null;
  let currentGroup: SequentialAsianGroup | null = null;
  let pending: { sideLabel: string; token: string } | null = null;

  function startGroup(token: string, side: SequentialAsianGroup["anchorSide"]) {
    anchorToken = token;
    anchorSide = side;
    currentGroup = { anchorToken: token, anchorSide: side, sides: [] };
  }

function normalizeGroupOppositeSides(
  group: SequentialAsianGroup
): SequentialAsianGroup {
  if (group.sides.length !== 2) {
    return group;
  }

  const [first, second] = group.sides;
  const firstLine = parseAsianMarketLine(first.token);
  const secondLine = parseAsianMarketLine(second.token);
  if (!firstLine || !secondLine || firstLine.line !== secondLine.line) {
    return group;
  }

  const firstIsSplit =
    firstLine.modifier === "minus50" || firstLine.modifier === "plus50";
  const secondIsSplit =
    secondLine.modifier === "minus50" || secondLine.modifier === "plus50";

  if (firstLine.modifier === "plain" && secondIsSplit) {
    const opposite = getOppositeAsianLine(second.token);
    if (opposite) {
      return {
        ...group,
        sides: [{ ...first, token: opposite }, second],
      };
    }
  }

  if (secondLine.modifier === "plain" && firstIsSplit) {
    const opposite = getOppositeAsianLine(first.token);
    if (opposite) {
      return {
        ...group,
        sides: [first, { ...second, token: opposite }],
      };
    }
  }

  if (firstIsSplit && secondIsSplit) {
    const expected = getOppositeAsianLine(first.token);
    if (expected && expected !== second.token) {
      return {
        ...group,
        sides: [first, { ...second, token: expected }],
      };
    }
  }

  return group;
}

  function flushGroup() {
    if (currentGroup && currentGroup.sides.length > 0) {
      groups.push(normalizeGroupOppositeSides(currentGroup));
    }
    currentGroup = null;
  }

  function bindOdds(odds: string) {
    if (!pending) {
      return;
    }
    if (!currentGroup) {
      startGroup(
        pending.token,
        anchorSide ?? labelToAnchorSide(pending.sideLabel, kind)
      );
    }
    currentGroup!.sides.push({
      sideLabel: pending.sideLabel,
      token: pending.token,
      odds,
    });
    pending = null;

    if (currentGroup && isGroupComplete(currentGroup, kind)) {
      flushGroup();
      anchorToken = null;
      anchorSide = null;
    }
  }

  for (const text of tokens) {
    const parsed = tryParseAnyLabel(text, allLabels);
    if (parsed) {
      if (parsed.token) {
        if (
          currentGroup &&
          anchorSide &&
          isPairSecondary(parsed.label, anchorSide, kind) &&
          !isGroupComplete(currentGroup, kind)
        ) {
          pending = { sideLabel: parsed.label, token: parsed.token };
        } else {
          if (currentGroup) {
            flushGroup();
          }
          const side = labelToAnchorSide(parsed.label, kind);
          startGroup(parsed.token, side);
          pending = { sideLabel: parsed.label, token: parsed.token };
        }
      } else {
        if (currentGroup && anchorToken && anchorSide) {
          const token = resolvePairedLineToken(anchorToken, null);
          if (!token) {
            continue;
          }
          pending = { sideLabel: parsed.label, token };
        } else if (!currentGroup) {
          const side = labelToAnchorSide(parsed.label, kind);
          const defaultToken = kind === "asianHandicap" ? "0" : null;
          if (!defaultToken) {
            continue;
          }
          startGroup(defaultToken, side);
          pending = { sideLabel: parsed.label, token: defaultToken };
        } else {
          continue;
        }
      }
      continue;
    }

    if (isOddsToken(text)) {
      bindOdds(text);
    }
  }

  if (currentGroup) {
    flushGroup();
  }

  return groups;
}
