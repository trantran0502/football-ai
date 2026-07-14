import type { MarketSelection } from "@/types/match";
import {
  inferMarketPeriod,
  resolveMarketFamily,
} from "@/lib/parser/marketMeta";
import { normalizeMarketContent, parseOddsNumber } from "@/lib/parser/oddsUtils";

interface ScoreOddsPair {
  label: string;
  odds: number;
}

function findGluedScoreAndOdds(
  rest: string
): { odds: number; consumed: number } | null {
  for (let colonIdx = 0; colonIdx < rest.length; colonIdx++) {
    if (rest[colonIdx] !== ":") {
      continue;
    }

    const after = rest.slice(colonIdx + 1);
    const awayDigit = after.charAt(0);
    if (!/^\d$/.test(awayDigit)) {
      continue;
    }

    const beforeColon = rest.slice(0, colonIdx);
    if (beforeColon.length === 0) {
      continue;
    }

    const home = beforeColon.slice(-1);
    if (!/^\d$/.test(home)) {
      continue;
    }

    const oddsStr = beforeColon.slice(0, -1);
    if (oddsStr.length === 0) {
      continue;
    }

    const odds = parseOddsNumber(oddsStr);
    if (odds === null) {
      continue;
    }

    return {
      odds,
      consumed: colonIdx + 2,
    };
  }

  return null;
}

/**
 * 以「下一個比分標籤」作分隔，解析可能黏在一起的波膽文字。
 * 例：0:0 90:1 90:2 16.20:3 450:4 126
 */
export function parseCorrectScorePairs(text: string): ScoreOddsPair[] {
  const normalized = text.replace(/\s+/g, "");
  const results: ScoreOddsPair[] = [];

  const firstMatch = normalized.match(/^(\d):(\d)/);
  if (!firstMatch) {
    return results;
  }

  let currentLabel = `${firstMatch[1]}:${firstMatch[2]}`;
  let pos = firstMatch[0].length;

  while (pos < normalized.length) {
    const rest = normalized.slice(pos);
    const glued = findGluedScoreAndOdds(rest);

    if (!glued) {
      const odds = parseOddsNumber(rest);
      if (odds !== null) {
        results.push({ label: currentLabel, odds });
      }
      break;
    }

    results.push({ label: currentLabel, odds: glued.odds });
    pos += glued.consumed;

    const gluedPart = rest.slice(0, glued.consumed);
    const scoreInGlued = gluedPart.match(/(\d):(\d)$/);
    if (!scoreInGlued) {
      break;
    }
    currentLabel = `${scoreInGlued[1]}:${scoreInGlued[2]}`;
  }

  return results;
}

export function parseCorrectScoreMarket(
  title: string,
  content: string | string[]
): MarketSelection[] {
  const text = normalizeMarketContent(content);
  const period = inferMarketPeriod(title);
  const family = resolveMarketFamily("correctScore", title);
  const pairs = parseCorrectScorePairs(text);

  return pairs.map((pair) => ({
    marketType: "correctScore" as const,
    marketFamily: family,
    title,
    period,
    side: "none" as const,
    label: pair.label,
    rawLine: pair.label,
    line: null,
    modifier: null,
    odds: pair.odds,
  }));
}
