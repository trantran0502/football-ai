import type {
  MarketSelection,
  MatchData,
  UnknownMarket,
} from "@/types/match";
import {
  findAsianLineTokenInContent,
  isAsianMarketLineToken,
  isLabeledParenthesisLine,
  resolveAsianLineToken,
} from "@/lib/parser/asianLine";
import {
  classifyMarketHeader,
  isCombinedHalfMlHcHeader,
  isKnownMarketHeader,
  normalizeMarketHeader,
  TABLE_MARKET_HEADERS,
} from "@/lib/parser/marketClassifier";
import {
  buildCombinedHalfMoneylineHandicapSelections,
  buildMarketSelectionsForType,
} from "@/lib/parser/marketBuilders";
import { isOddsToken } from "@/lib/parser/oddsUtils";
import {
  finalizeMatchData,
  hasParsedMarkets,
  mergeMatchData,
  warnUnknownMarkets,
} from "@/lib/parser/syncLegacyMarkets";
import { normalizeMarketSelections } from "@/lib/parser/normalizeMarketSelections";

export {
  parseAsianMarketLine,
  getOppositeAsianLine,
  getTotalSettlementAtBoundary,
  getHandicapSettlementAtBoundary,
  getSignedHandicap,
  modifierToWater,
} from "@/lib/parser/asianRules";
export { normalizeMarketSelections } from "@/lib/parser/normalizeMarketSelections";
export { parseOddsNumber } from "@/lib/parser/marketSelection";
export {
  isAsianMarketLineToken,
  resolveAsianLineToken,
  findAsianLineTokenInContent,
  deriveOppositeLineToken,
  deriveOppositeAsianLine,
} from "@/lib/parser/asianLine";
export { classifyMarketHeader } from "@/lib/parser/marketClassifier";
export { runAsianRulesValidation, assertAsianRulesValidation } from "@/lib/parser/asianRulesValidation";

const TEAM_PATTERN =
  /^(.+?)\s+(?:vs|VS|v|V|对|對|－|—|-)\s+(.+)$/i;

const ODDS_VALUE = /^\d+(?:\.\d+)?$/;

const BTTS_YES_LABELS = ["是", "有", "Yes", "yes", "Y"];
const BTTS_NO_LABELS = ["否", "無", "No", "no", "N"];

function isOddsValue(value: string): boolean {
  return ODDS_VALUE.test(value) && isOddsToken(value);
}

interface ParseMarketsResult {
  marketSelections: MarketSelection[];
  unknownMarkets: UnknownMarket[];
}

function emptyParseResult(): ParseMarketsResult {
  return { marketSelections: [], unknownMarkets: [] };
}

function emptyMatchData(): MatchData {
  return finalizeMatchData({
    league: "",
    homeTeam: "",
    awayTeam: "",
    marketSelections: [],
    unknownMarkets: [],
  });
}

function stripHomeTeamMarker(name: string): string {
  return name.replace(/\[主\]\s*$/, "").trim();
}

function isBettingContentLine(line: string): boolean {
  const trimmed = normalizeMarketHeader(line);
  return /^(主|客|和|大|小|是|否|單|单|雙|双)\b/.test(trimmed);
}

function isPotentialUnknownMarketHeader(line: string): boolean {
  const trimmed = normalizeMarketHeader(line);
  if (!trimmed || trimmed.length > 30) {
    return false;
  }
  if (isKnownMarketHeader(trimmed)) {
    return false;
  }
  if (isBettingContentLine(trimmed)) {
    return false;
  }
  if (isOddsValue(trimmed)) {
    return false;
  }
  if (isAsianMarketLineToken(trimmed)) {
    return false;
  }
  if (
    ["大", "小", "單", "单", "雙", "双", "是", "否", "主", "客", "和"].includes(
      trimmed
    )
  ) {
    return false;
  }
  if (isDateLine(trimmed) || isTimeLine(trimmed)) {
    return false;
  }
  if (/^聯盟[:：]/.test(trimmed) || /^联盟[:：]/.test(trimmed)) {
    return false;
  }
  if (/\[主\]$/.test(trimmed)) {
    return false;
  }
  if (TEAM_PATTERN.test(trimmed)) {
    return false;
  }
  if (trimmed === "滾球" || trimmed === "走地" || trimmed.toLowerCase() === "grade") {
    return false;
  }

  return /^[\u4e00-\u9fa5a-zA-Z][\u4e00-\u9fa5a-zA-Z0-9/·\s]{0,20}$/.test(trimmed);
}

function recordUnknownMarket(
  list: UnknownMarket[],
  name: string,
  raw: string
): void {
  const example = raw.trim();
  const existing = list.find((item) => item.name === name);

  if (existing) {
    existing.count += 1;
    existing.raw = example;
    if (example && !existing.examples.includes(example)) {
      existing.examples.push(example);
    }
    return;
  }

  list.push({
    name,
    raw: example,
    count: 1,
    examples: example ? [example] : [],
  });
}

function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isTableHeader(line: string): boolean {
  return TABLE_MARKET_HEADERS.has(line);
}

function isTabularFormat(lines: string[]): boolean {
  return (
    lines.some((line) => /^聯盟[:：]/.test(line) || /^联盟[:：]/.test(line)) ||
    lines.some((line) => /\[主\]$/.test(line))
  );
}

function extractOddsFromContent(content: string): string[] {
  return content.split(/\s+/).filter(isOddsValue);
}

function parseContentBlock(lines: string[], start: number) {
  const chunk: string[] = [];
  let idx = start;

  while (idx < lines.length) {
    const line = lines[idx];

    if (isKnownMarketHeader(line) || isPotentialUnknownMarketHeader(line)) {
      break;
    }

    chunk.push(line);
    idx++;
  }

  if (chunk.length === 0) {
    return null;
  }

  return {
    content: chunk,
    nextIdx: idx,
  };
}

function parseHandicapBlock(lines: string[], start: number, title: string) {
  const chunk: string[] = [];
  let idx = start;

  while (idx < lines.length) {
    const line = lines[idx];

    if (isKnownMarketHeader(line) || isPotentialUnknownMarketHeader(line)) {
      break;
    }

    chunk.push(line);
    idx++;
  }

  const marketSelections = buildMarketSelectionsForType("handicap", title, chunk);
  if (marketSelections.length > 0) {
    return { marketSelections, nextIdx: idx };
  }

  return { marketSelections: [], nextIdx: start };
}

function parseSectionContentByType(
  marketType: ReturnType<typeof classifyMarketHeader>,
  title: string,
  content: string
): MarketSelection[] {
  if (!marketType) {
    return [];
  }

  if (isCombinedHalfMlHcHeader(title)) {
    return buildCombinedHalfMoneylineHandicapSelections(title, content);
  }

  return buildMarketSelectionsForType(marketType, title, content);
}

function parseBttsBlock(lines: string[], start: number, title: string) {
  if (start >= lines.length) {
    return { marketSelections: [], nextIdx: start };
  }

  let i = start;
  const allLabels = [...BTTS_YES_LABELS, ...BTTS_NO_LABELS];

  if (BTTS_YES_LABELS.includes(lines[i]) || BTTS_NO_LABELS.includes(lines[i])) {
    i = skipLabels(lines, i, allLabels);
  }

  const odds = takeOddsValues(lines, i, 2);
  if (odds.values.length === 2) {
    return {
      marketSelections: buildMarketSelectionsForType(
        "btts",
        title,
        [odds.values[0], odds.values[1]].join(" ")
      ),
      nextIdx: odds.nextIdx,
    };
  }

  return { marketSelections: [], nextIdx: start };
}

function parseOddEvenBlock(lines: string[], start: number, title: string) {
  let i = skipLabels(lines, start, ["單", "单", "雙", "双"]);
  const odds = takeOddsValues(lines, i, 2);
  if (odds.values.length === 2) {
    return {
      marketSelections: buildMarketSelectionsForType(
        "oddEven",
        title,
        [odds.values[0], odds.values[1]].join(" ")
      ),
      nextIdx: odds.nextIdx,
    };
  }
  return { marketSelections: [], nextIdx: start };
}

function consumeUnknownMarketBlock(lines: string[], start: number) {
  const block: string[] = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];

    if (isKnownMarketHeader(line) || isPotentialUnknownMarketHeader(line)) {
      break;
    }

    if (
      isOddsValue(line) ||
      isAsianMarketLineToken(line) ||
      isLabeledParenthesisLine(line) ||
      ["大", "小", "單", "单", "雙", "双", "是", "否"].includes(line)
    ) {
      block.push(line);
      i++;

      if (isAsianMarketLineToken(line) || isLabeledParenthesisLine(line)) {
        i = skipLabels(lines, i, ["大", "小", "單", "单", "雙", "双"]);
        const odds = takeOddsValues(lines, i, 2);
        block.push(...odds.values);
        i = odds.nextIdx;
        continue;
      }

      if (["大", "小", "單", "单", "雙", "双"].includes(line)) {
        const odds = takeOddsValues(lines, i, 2);
        block.push(...odds.values);
        i = odds.nextIdx;
        continue;
      }

      if (["是", "否"].includes(line)) {
        const odds = takeOddsValues(lines, i, 2);
        block.push(...odds.values);
        i = odds.nextIdx;
        continue;
      }

      continue;
    }

    break;
  }

  return {
    raw: block.join("  "),
    nextIdx: i,
  };
}

function hasMarketLabels(lines: string[]): boolean {
  for (const line of lines) {
    const trimmed = normalizeMarketHeader(line);
    if (classifyMarketHeader(trimmed)) {
      return true;
    }
    if (isPotentialUnknownMarketHeader(line)) {
      return true;
    }
    if (
      isTableHeader(line) &&
      line !== "主客隊伍" &&
      line !== "主客队伍" &&
      line !== "備註" &&
      line !== "备注"
    ) {
      return true;
    }
  }
  return false;
}

function takeOddsValues(lines: string[], start: number, count: number) {
  const values: string[] = [];
  let i = start;

  while (i < lines.length && !isOddsValue(lines[i])) {
    if (
      isAsianMarketLineToken(lines[i]) ||
      isLabeledParenthesisLine(lines[i]) ||
      ["大", "小", "單", "单", "雙", "双"].includes(lines[i])
    ) {
      break;
    }
    i++;
  }

  while (i < lines.length && values.length < count) {
    if (isOddsValue(lines[i])) {
      values.push(lines[i]);
      i++;
    } else {
      break;
    }
  }
  return { values, nextIdx: i };
}

function skipLabels(lines: string[], start: number, labels: string[]) {
  let i = start;
  while (i < lines.length && labels.includes(lines[i])) i++;
  return i;
}

function isMatchMetaLine(line: string): boolean {
  return (
    isDateLine(line) ||
    isTimeLine(line) ||
    line === "滾球" ||
    line === "走地" ||
    line.toLowerCase() === "grade" ||
    isTableHeader(line)
  );
}

function isDateLine(line: string): boolean {
  return /^\d{2}-\d{2}$/.test(line);
}

function isTimeLine(line: string): boolean {
  return /^\d{2}:\d{2}$/.test(line);
}

function parseTabularMatch(lines: string[]) {
  let league = "";
  let homeTeam = "";
  let awayTeam = "";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (isTableHeader(line)) continue;

    if (/^聯盟[:：]/.test(line)) {
      league = line.replace(/^聯盟[:：]\s*/, "").trim();
      continue;
    }

    if (/^联盟[:：]/.test(line)) {
      league = line.replace(/^联盟[:：]\s*/, "").trim();
      continue;
    }

    if (isMatchMetaLine(line)) continue;

    if (/\[主\]$/.test(line)) {
      homeTeam = line.replace(/\[主\]\s*$/, "").trim();
      continue;
    }

    if (
      homeTeam &&
      !awayTeam &&
      !isOddsValue(line) &&
      !isAsianMarketLineToken(line) &&
      !isLabeledParenthesisLine(line) &&
      !["大", "小", "單", "单", "雙", "双"].includes(line)
    ) {
      awayTeam = line;
      continue;
    }

    dataLines.push(line);
  }

  return { league, homeTeam, awayTeam, dataLines };
}

function parseTabularMarketByType(
  marketType: NonNullable<ReturnType<typeof classifyMarketHeader>>,
  title: string,
  dataLines: string[],
  dataIdx: number
): { marketSelections: MarketSelection[]; nextIdx: number } {
  if (isCombinedHalfMlHcHeader(title)) {
    const block = parseContentBlock(dataLines, dataIdx);
    if (!block) {
      return { marketSelections: [], nextIdx: dataIdx };
    }
    return {
      marketSelections: buildCombinedHalfMoneylineHandicapSelections(
        title,
        block.content
      ),
      nextIdx: block.nextIdx,
    };
  }

  if (marketType === "handicap") {
    const parsed = parseHandicapBlock(dataLines, dataIdx, title);
    return {
      marketSelections: parsed.marketSelections,
      nextIdx:
        parsed.marketSelections.length > 0 ? parsed.nextIdx : dataIdx,
    };
  }

  if (marketType === "btts") {
    const block = parseBttsBlock(dataLines, dataIdx, title);
    return {
      marketSelections: block.marketSelections,
      nextIdx: block.nextIdx,
    };
  }

  if (marketType === "oddEven") {
    const block = parseOddEvenBlock(dataLines, dataIdx, title);
    return {
      marketSelections: block.marketSelections,
      nextIdx: block.nextIdx,
    };
  }

  const block = parseContentBlock(dataLines, dataIdx);
  if (!block) {
    return { marketSelections: [], nextIdx: dataIdx };
  }

  return {
    marketSelections: buildMarketSelectionsForType(
      marketType,
      title,
      block.content
    ),
    nextIdx: block.nextIdx,
  };
}

function parseTabularMarkets(lines: string[], dataLines: string[]) {
  const result = emptyParseResult();
  const headers: string[] = [];

  for (const line of lines) {
    if (isTableHeader(line)) {
      headers.push(line);
    } else if (
      /^聯盟[:：]/.test(line) ||
      /^联盟[:：]/.test(line) ||
      /\[主\]$/.test(line) ||
      isDateLine(line)
    ) {
      break;
    }
  }

  const playableHeaders = headers.filter(
    (header) =>
      header !== "主客隊伍" &&
      header !== "主客队伍" &&
      header !== "備註" &&
      header !== "备注"
  );

  let dataIdx = 0;

  for (const header of playableHeaders) {
    if (dataIdx >= dataLines.length) break;

    const marketType = classifyMarketHeader(header);

    if (!marketType) {
      const block = consumeUnknownMarketBlock(dataLines, dataIdx);
      if (block.raw) {
        recordUnknownMarket(result.unknownMarkets, header, block.raw);
        dataIdx = block.nextIdx;
      }
      continue;
    }

    const parsed = parseTabularMarketByType(
      marketType,
      header,
      dataLines,
      dataIdx
    );
    if (parsed.marketSelections.length > 0) {
      result.marketSelections.push(...parsed.marketSelections);
      dataIdx = parsed.nextIdx;
    }
  }

  return result;
}

/**
 * 解析莊家原始盤口格式（無玩法標籤，依序排列賠率）。
 */
export function parseRawOddsFormat(lines: string[]): MatchData {
  const result = emptyMatchData();
  let awayTeamIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^聯盟[:：]/.test(line)) {
      result.league = line.replace(/^聯盟[:：]\s*/, "").trim();
      continue;
    }

    if (/^联盟[:：]/.test(line)) {
      result.league = line.replace(/^联盟[:：]\s*/, "").trim();
      continue;
    }

    if (
      isDateLine(line) ||
      isTimeLine(line) ||
      line === "滾球" ||
      line === "走地" ||
      line.toLowerCase() === "grade"
    ) {
      continue;
    }

    if (/\[主\]$/.test(line)) {
      result.homeTeam = line.replace(/\[主\]\s*$/, "").trim();
      continue;
    }

    if (
      result.homeTeam &&
      !result.awayTeam &&
      !isOddsValue(line) &&
      !isAsianMarketLineToken(line) &&
      !isLabeledParenthesisLine(line) &&
      !["大", "小", "單", "单", "雙", "双"].includes(line)
    ) {
      result.awayTeam = line;
      awayTeamIndex = i;
      continue;
    }

    if (
      !result.league &&
      !result.homeTeam &&
      !isOddsValue(line) &&
      !isAsianMarketLineToken(line) &&
      !isLabeledParenthesisLine(line) &&
      !["大", "小", "單", "单", "雙", "双"].includes(line)
    ) {
      result.league = line;
    }
  }

  const dataLines =
    awayTeamIndex >= 0 ? lines.slice(awayTeamIndex + 1) : lines;

  const parsedMarketSelections: MarketSelection[] = [];
  let dataIdx = 0;

  const moneylineOdds = takeOddsValues(dataLines, dataIdx, 3);
  if (moneylineOdds.values.length === 3) {
    parsedMarketSelections.push(
      ...buildMarketSelectionsForType(
        "moneyline",
        "獨贏",
        moneylineOdds.values.join(" ")
      )
    );
    dataIdx = moneylineOdds.nextIdx;
  }

  if (dataIdx < dataLines.length && resolveAsianLineToken(dataLines[dataIdx])) {
    const handicapOdds = takeOddsValues(dataLines, dataIdx + 1, 2);
    const token = resolveAsianLineToken(dataLines[dataIdx])!;
    if (handicapOdds.values.length === 2) {
      parsedMarketSelections.push(
        ...buildMarketSelectionsForType("handicap", "亞洲讓分", [
          `主(${token})`,
          handicapOdds.values[0],
          "客",
          handicapOdds.values[1],
        ])
      );
      dataIdx = handicapOdds.nextIdx;
    }
  }

  if (
    dataIdx < dataLines.length &&
    (resolveAsianLineToken(dataLines[dataIdx]) ||
      dataLines[dataIdx] === "大" ||
      dataLines[dataIdx] === "小" ||
      isLabeledParenthesisLine(dataLines[dataIdx]))
  ) {
    const block = parseContentBlock(dataLines, dataIdx);
    if (block) {
      parsedMarketSelections.push(
        ...buildMarketSelectionsForType("totalGoals", "大小球", block.content)
      );
      dataIdx = block.nextIdx;
    }
  }

  dataIdx = skipLabels(dataLines, dataIdx, ["單", "单", "雙", "双"]);
  const oddEvenOdds = takeOddsValues(dataLines, dataIdx, 2);
  if (oddEvenOdds.values.length === 2) {
    parsedMarketSelections.push(
      ...buildMarketSelectionsForType(
        "oddEven",
        "單雙",
        oddEvenOdds.values.join(" ")
      )
    );
  }

  return finalizeMatchData({
    league: result.league,
    homeTeam: result.homeTeam,
    awayTeam: result.awayTeam,
    marketSelections: parsedMarketSelections,
    unknownMarkets: [],
  });
}

function parseSectionMatch(lines: string[]) {
  let league = "";
  let homeTeam = "";
  let awayTeam = "";
  let teamLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (/\[主\]$/.test(lines[i]) && !homeTeam) {
      homeTeam = stripHomeTeamMarker(lines[i]);
      teamLineIndex = i;
      if (i > 0 && !league) {
        league = lines[i - 1];
      }
      continue;
    }

    const match = lines[i].match(TEAM_PATTERN);
    if (match) {
      homeTeam = stripHomeTeamMarker(match[1].trim());
      awayTeam = match[2].trim();
      teamLineIndex = i;
      if (i > 0) {
        league = lines[i - 1];
      }
      break;
    }
  }

  return { league, homeTeam, awayTeam, teamLineIndex };
}

function parseSectionMarkets(
  lines: string[],
  matchInfo: {
    league: string;
    homeTeam: string;
    awayTeam: string;
    teamLineIndex: number;
  }
) {
  const result = emptyParseResult();
  let currentMarketType: ReturnType<typeof classifyMarketHeader> = null;
  let currentMarketTitle = "";
  let currentUnknownName: string | null = null;
  let buffer: string[] = [];
  let unknownBuffer: string[] = [];

  function flushKnown() {
    if (!currentMarketType || buffer.length === 0) {
      buffer = [];
      return;
    }

    const content = buffer.join(" ").trim();
    if (!content) {
      buffer = [];
      return;
    }

    const marketSelections = parseSectionContentByType(
      currentMarketType,
      currentMarketTitle,
      content
    );
    if (marketSelections.length > 0) {
      result.marketSelections.push(...marketSelections);
    }

    buffer = [];
  }

  function flushUnknown() {
    if (!currentUnknownName) {
      unknownBuffer = [];
      return;
    }

    const raw = unknownBuffer.join(" ").trim();
    if (raw) {
      recordUnknownMarket(result.unknownMarkets, currentUnknownName, raw);
    }

    currentUnknownName = null;
    unknownBuffer = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (i === matchInfo.teamLineIndex) continue;
    if (matchInfo.league && line === matchInfo.league) continue;
    if (line === matchInfo.homeTeam || line === matchInfo.awayTeam) continue;
    if (/^聯盟[:：]/.test(line) || /^联盟[:：]/.test(line)) continue;
    if (/\[主\]$/.test(line)) continue;

    const header = normalizeMarketHeader(line);
    const marketType = classifyMarketHeader(header);

    if (marketType) {
      flushUnknown();
      flushKnown();
      currentMarketType = marketType;
      currentMarketTitle = header;
      currentUnknownName = null;
      continue;
    }

    if (currentMarketType) {
      buffer.push(line);
      continue;
    }

    if (isPotentialUnknownMarketHeader(line)) {
      flushKnown();
      flushUnknown();
      currentMarketType = null;
      currentMarketTitle = "";
      currentUnknownName = header;
      continue;
    }

    if (currentUnknownName) {
      unknownBuffer.push(line);
      continue;
    }
  }

  flushKnown();
  flushUnknown();

  return result;
}

export function parseOdds(text: string): MatchData {
  const lines = parseLines(text);

  if (lines.length === 0) {
    return emptyMatchData();
  }

  let parsed: MatchData;

  if (hasMarketLabels(lines)) {
    if (isTabularFormat(lines)) {
      const { league, homeTeam, awayTeam, dataLines } = parseTabularMatch(lines);
      const { marketSelections, unknownMarkets } = parseTabularMarkets(
        lines,
        dataLines
      );

      parsed = finalizeMatchData({
        league,
        homeTeam,
        awayTeam,
        marketSelections,
        unknownMarkets,
      });
    } else {
      const matchInfo = parseSectionMatch(lines);
      const { marketSelections, unknownMarkets } = parseSectionMarkets(
        lines,
        matchInfo
      );

      parsed = finalizeMatchData({
        league: matchInfo.league,
        homeTeam: matchInfo.homeTeam,
        awayTeam: matchInfo.awayTeam,
        marketSelections,
        unknownMarkets,
      });
    }
  } else {
    parsed = parseRawOddsFormat(lines);
  }

  if (!hasParsedMarkets(parsed)) {
    parsed = mergeMatchData(parsed, parseRawOddsFormat(lines));
  }

  parsed.marketSelections = normalizeMarketSelections(parsed.marketSelections);
  warnUnknownMarkets(parsed.unknownMarkets);
  return finalizeMatchData({
    league: parsed.league,
    homeTeam: parsed.homeTeam,
    awayTeam: parsed.awayTeam,
    marketSelections: parsed.marketSelections,
    unknownMarkets: parsed.unknownMarkets,
  });
}
