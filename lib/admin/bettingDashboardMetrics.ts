import type { BettingIntelligenceResult } from "@/lib/betting/intelligenceTypes";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";

export interface AdminBettingIntelligenceMetrics {
  valueBetToday: number;
  averageExpectedValue: number;
  averageClosingLineValue: number | null;
  bestMarket: string | null;
  bestBookmaker: string | null;
  bestLeague: string | null;
  sampleSize: number;
}

function isSameDay(isoDate: string, dayKey: string): boolean {
  return isoDate.slice(0, 10) === dayKey;
}

function collectIntelligenceRecords(
  records: HistoricalMatchRecord[],
  dayKey: string
): Array<{ league: string; intelligence: BettingIntelligenceResult }> {
  const output: Array<{ league: string; intelligence: BettingIntelligenceResult }> = [];

  for (const record of records) {
    const intelligence =
      record.analysisSnapshot?.bettingIntelligence ??
      record.analysisSnapshot?.replay?.marketReplay?.bettingIntelligence ??
      null;
    if (!intelligence) {
      continue;
    }
    if (!isSameDay(intelligence.generatedAt, dayKey)) {
      continue;
    }
    output.push({ league: record.league, intelligence });
  }

  return output;
}

export function buildBettingIntelligenceDashboardMetrics(
  records: HistoricalMatchRecord[],
  dayKey: string = new Date().toISOString().slice(0, 10)
): AdminBettingIntelligenceMetrics {
  const items = collectIntelligenceRecords(records, dayKey);
  if (items.length === 0) {
    return {
      valueBetToday: 0,
      averageExpectedValue: 0,
      averageClosingLineValue: null,
      bestMarket: null,
      bestBookmaker: null,
      bestLeague: null,
      sampleSize: 0,
    };
  }

  const valueBetToday = items.reduce(
    (sum, item) => sum + item.intelligence.summary.valueBetCount,
    0
  );
  const averageExpectedValue =
    items.reduce(
      (sum, item) => sum + item.intelligence.summary.averageExpectedValue,
      0
    ) / items.length;

  const clvValues = items
    .map((item) => item.intelligence.summary.averageClosingLineValue)
    .filter((value): value is number => value !== null);
  const averageClosingLineValue =
    clvValues.length > 0
      ? clvValues.reduce((sum, value) => sum + value, 0) / clvValues.length
      : null;

  const bestMarketEntry = [...items].sort(
    (left, right) =>
      (right.intelligence.summary.averageExpectedValue ?? 0) -
      (left.intelligence.summary.averageExpectedValue ?? 0)
  )[0];

  const leagueScores = new Map<string, number>();
  for (const item of items) {
    const current = leagueScores.get(item.league) ?? 0;
    leagueScores.set(
      item.league,
      current + item.intelligence.summary.averageExpectedValue
    );
  }
  const bestLeague =
    [...leagueScores.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
    null;

  return {
    valueBetToday,
    averageExpectedValue,
    averageClosingLineValue,
    bestMarket: bestMarketEntry?.intelligence.summary.bestMarketType ?? null,
    bestBookmaker: bestMarketEntry?.intelligence.summary.bestBookmaker ?? null,
    bestLeague,
    sampleSize: items.length,
  };
}
