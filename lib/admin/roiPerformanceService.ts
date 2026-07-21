import { calculateProfit } from "@/lib/backtest/betEvaluator";
import { canSettleMarketSelection, settleBet } from "@/lib/backtest/settlement";
import type { BetResult } from "@/lib/backtest/types";
import type { HistoricalMatchRecord, MatchResult } from "@/lib/database/matchSchema";
import { resolveDailyRecommendationGrade } from "@/lib/dailyRecommendations/dailyRecommendationPresentation";
import {
  getActionableRecommendations,
  RECOMMENDATION_MARKET_LABELS,
} from "@/lib/recommendation/recommendationPresentation";
import type { RecommendationCandidate } from "@/lib/recommendation/recommendationTypes";
import type { MarketType } from "@/types/match";
import type {
  RoiBreakdownRow,
  RoiExcludedReasonCounts,
  RoiExclusionReason,
  RoiPerformanceFilters,
  RoiPerformanceRecord,
  RoiPerformanceResponse,
  RoiPerformanceSummary,
  RoiVerificationResult,
} from "@/lib/admin/roiPerformanceTypes";

const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_LOOKBACK_DAYS = 30;
const UNIT_STAKE = 1;

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function isValidOdds(odds: unknown): odds is number {
  return typeof odds === "number" && Number.isFinite(odds) && odds >= 1.01;
}

function createEmptyExclusionCounts(): RoiExcludedReasonCounts {
  return {
    no_recommendation: 0,
    missing_odds: 0,
    invalid_odds: 0,
    unsettled_market: 0,
    push: 0,
    void: 0,
    missing_result: 0,
    legacy_incomplete_record: 0,
  };
}

function marketLabel(marketType: MarketType | string): string {
  if (
    marketType === "moneyline" ||
    marketType === "handicap" ||
    marketType === "totalGoals" ||
    marketType === "btts"
  ) {
    return RECOMMENDATION_MARKET_LABELS[marketType];
  }
  return String(marketType);
}

function selectionLabel(candidate: RecommendationCandidate): string {
  const selection = candidate.selection;
  const parts: string[] = [selection.side];
  if (selection.line !== null && selection.line !== undefined) {
    parts.push(String(selection.line));
  } else if (selection.rawLine) {
    parts.push(selection.rawLine);
  }
  if (selection.title) {
    parts.push(selection.title);
  }
  return parts.filter(Boolean).join(" · ");
}

function formatFinalScore(result: MatchResult | null): string | null {
  if (!result) {
    return null;
  }
  return `${result.fullTimeHomeGoals}-${result.fullTimeAwayGoals}`;
}

function resolveWeightVersion(record: HistoricalMatchRecord): string {
  const weight =
    record.analysisSnapshot?.weightConfig ??
    record.analysisSnapshot?.recommendation?.result?.weightConfig ??
    null;
  if (!weight) {
    return "unknown";
  }
  if (weight.versionLabel?.trim()) {
    return weight.versionLabel.trim();
  }
  if (weight.versionId?.trim()) {
    return weight.versionId.trim();
  }
  if (weight.version !== null && weight.version !== undefined) {
    return `v${weight.version}`;
  }
  return "unknown";
}

function resolveGrade(candidate: RecommendationCandidate): string {
  return resolveDailyRecommendationGrade(candidate.score).grade;
}

function mapBetResult(result: BetResult): RoiVerificationResult {
  return result;
}

function isRoiEligibleResult(result: RoiVerificationResult): boolean {
  return (
    result === "WIN" ||
    result === "LOSE" ||
    result === "HALF_WIN" ||
    result === "HALF_LOSE"
  );
}

function computeRoi(profit: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }
  return profit / denominator;
}

function computeHitRate(wins: number, losses: number): number | null {
  const decisive = wins + losses;
  if (decisive <= 0) {
    return null;
  }
  return wins / decisive;
}

interface MutableBucket {
  key: string;
  label: string;
  sampleSize: number;
  wins: number;
  losses: number;
  totalProfit: number;
}

function createBucket(key: string, label: string): MutableBucket {
  return {
    key,
    label,
    sampleSize: 0,
    wins: 0,
    losses: 0,
    totalProfit: 0,
  };
}

function accumulateEligible(
  bucket: MutableBucket,
  result: RoiVerificationResult,
  profit: number
): void {
  bucket.sampleSize += 1;
  bucket.totalProfit += profit;
  if (result === "WIN" || result === "HALF_WIN") {
    bucket.wins += 1;
  } else if (result === "LOSE" || result === "HALF_LOSE") {
    bucket.losses += 1;
  }
}

function finalizeBucket(bucket: MutableBucket): RoiBreakdownRow {
  return {
    key: bucket.key,
    label: bucket.label,
    sampleSize: bucket.sampleSize,
    wins: bucket.wins,
    losses: bucket.losses,
    hitRate: computeHitRate(bucket.wins, bucket.losses),
    totalProfit: bucket.totalProfit,
    roi: computeRoi(bucket.totalProfit, bucket.sampleSize),
  };
}

function sortBreakdownRows(rows: RoiBreakdownRow[]): RoiBreakdownRow[] {
  return [...rows].sort((left, right) => {
    if (right.sampleSize !== left.sampleSize) {
      return right.sampleSize - left.sampleSize;
    }
    return left.label.localeCompare(right.label);
  });
}

function resolveDefaultDateRange(now: Date = new Date()): { fromDate: string; toDate: string } {
  const toDate = toDateKey(now);
  const fromDate = toDateKey(addUtcDays(now, -(DEFAULT_LOOKBACK_DAYS - 1)));
  return { fromDate, toDate };
}

export function normalizeRoiPerformanceFilters(
  input: RoiPerformanceFilters = {},
  now: Date = new Date()
): Required<
  Pick<RoiPerformanceFilters, "fromDate" | "toDate" | "onlyRoiEligible" | "page" | "pageSize">
> & {
  market: string | null;
  league: string | null;
  verificationResult: RoiVerificationResult | "all" | null;
  weightVersion: string | null;
} {
  const defaults = resolveDefaultDateRange(now);
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize ?? DEFAULT_PAGE_SIZE)));

  return {
    fromDate: input.fromDate?.trim() || defaults.fromDate,
    toDate: input.toDate?.trim() || defaults.toDate,
    market: input.market?.trim() || null,
    league: input.league?.trim() || null,
    verificationResult: input.verificationResult ?? "all",
    weightVersion: input.weightVersion?.trim() || null,
    onlyRoiEligible: Boolean(input.onlyRoiEligible),
    page,
    pageSize,
  };
}

function recordInDateRange(
  record: HistoricalMatchRecord,
  fromDate: string,
  toDate: string
): boolean {
  return record.matchDate >= fromDate && record.matchDate <= toDate;
}

function classifyCandidate(input: {
  record: HistoricalMatchRecord;
  candidate: RecommendationCandidate;
  exclusionCounts: RoiExcludedReasonCounts;
}): RoiPerformanceRecord | null {
  const { record, candidate, exclusionCounts } = input;
  const weightVersion = resolveWeightVersion(record);
  const grade = resolveGrade(candidate);
  const market = marketLabel(candidate.marketType);
  const selection = selectionLabel(candidate);
  const oddsRaw = candidate.selection?.odds;
  const base = {
    matchId: record.id,
    matchDate: record.matchDate,
    league: record.league || "Unknown",
    homeTeam: record.homeTeam,
    awayTeam: record.awayTeam,
    fixtureId: record.fixtureId ?? null,
    market,
    selection,
    odds: typeof oddsRaw === "number" ? oddsRaw : null,
    finalScore: formatFinalScore(record.result),
    recommendationGrade: grade,
    weightVersion,
  };

  if (record.status === "CANCELLED") {
    exclusionCounts.void += 1;
    return {
      ...base,
      verificationResult: "VOID",
      profit: null,
      roi: null,
      roiEligible: false,
      exclusionReason: "void",
    };
  }

  if (!record.result) {
    exclusionCounts.missing_result += 1;
    return {
      ...base,
      verificationResult: "VOID",
      profit: null,
      roi: null,
      roiEligible: false,
      exclusionReason: "missing_result",
    };
  }

  if (oddsRaw === null || oddsRaw === undefined) {
    exclusionCounts.missing_odds += 1;
    return {
      ...base,
      verificationResult: "VOID",
      profit: null,
      roi: null,
      roiEligible: false,
      exclusionReason: "missing_odds",
    };
  }

  if (!isValidOdds(oddsRaw)) {
    exclusionCounts.invalid_odds += 1;
    return {
      ...base,
      verificationResult: "VOID",
      profit: null,
      roi: null,
      roiEligible: false,
      exclusionReason: "invalid_odds",
    };
  }

  if (!canSettleMarketSelection(candidate.selection, record.result)) {
    exclusionCounts.unsettled_market += 1;
    return {
      ...base,
      verificationResult: "VOID",
      profit: null,
      roi: null,
      roiEligible: false,
      exclusionReason: "unsettled_market",
    };
  }

  const settled = settleBet(candidate.selection, record.result);
  const verificationResult = mapBetResult(settled);
  const profit = calculateProfit(settled, oddsRaw, UNIT_STAKE);

  if (verificationResult === "PUSH") {
    exclusionCounts.push += 1;
    return {
      ...base,
      odds: oddsRaw,
      verificationResult,
      profit: 0,
      roi: null,
      roiEligible: false,
      exclusionReason: "push",
    };
  }

  return {
    ...base,
    odds: oddsRaw,
    verificationResult,
    profit,
    roi: profit / UNIT_STAKE,
    roiEligible: isRoiEligibleResult(verificationResult),
    exclusionReason: null,
  };
}

function buildRecordsFromMatch(
  record: HistoricalMatchRecord,
  exclusionCounts: RoiExcludedReasonCounts
): RoiPerformanceRecord[] {
  if (record.status !== "VERIFIED" && record.status !== "CANCELLED") {
    return [];
  }

  if (record.status === "VERIFIED" && !record.result) {
    exclusionCounts.missing_result += 1;
    return [];
  }

  const recommendation = record.analysisSnapshot?.recommendation?.result ?? null;
  const snapshotIncomplete =
    !record.analysisSnapshot ||
    record.analysisSnapshot.dataCompleteness?.eligibleForRecommendation === false;

  if (record.status === "VERIFIED" && snapshotIncomplete && !recommendation) {
    exclusionCounts.legacy_incomplete_record += 1;
    return [];
  }

  const actionable = getActionableRecommendations(recommendation);
  if (actionable.length === 0) {
    if (record.status === "VERIFIED") {
      exclusionCounts.no_recommendation += 1;
    }
    return [];
  }

  return actionable
    .map((candidate) =>
      classifyCandidate({
        record,
        candidate,
        exclusionCounts,
      })
    )
    .filter((row): row is RoiPerformanceRecord => row !== null);
}

function matchesFilters(
  row: RoiPerformanceRecord,
  filters: ReturnType<typeof normalizeRoiPerformanceFilters>
): boolean {
  if (filters.market && row.market !== filters.market) {
    return false;
  }
  if (filters.league && row.league !== filters.league) {
    return false;
  }
  if (
    filters.verificationResult &&
    filters.verificationResult !== "all" &&
    row.verificationResult !== filters.verificationResult
  ) {
    return false;
  }
  if (filters.weightVersion && row.weightVersion !== filters.weightVersion) {
    return false;
  }
  if (filters.onlyRoiEligible && !row.roiEligible) {
    return false;
  }
  return true;
}

function buildSummary(
  rows: RoiPerformanceRecord[],
  verifiedCount: number,
  now: Date
): RoiPerformanceSummary {
  const today = toDateKey(now);
  const last7From = toDateKey(addUtcDays(now, -6));
  const last30From = toDateKey(addUtcDays(now, -29));

  let winCount = 0;
  let lossCount = 0;
  let pushCount = 0;
  let voidCount = 0;
  let halfWinCount = 0;
  let halfLossCount = 0;
  let totalProfit = 0;
  let oddsSum = 0;
  let oddsCount = 0;

  const eligible = rows.filter((row) => row.roiEligible);
  for (const row of rows) {
    switch (row.verificationResult) {
      case "WIN":
        winCount += 1;
        break;
      case "LOSE":
        lossCount += 1;
        break;
      case "PUSH":
        pushCount += 1;
        break;
      case "VOID":
        voidCount += 1;
        break;
      case "HALF_WIN":
        halfWinCount += 1;
        break;
      case "HALF_LOSE":
        halfLossCount += 1;
        break;
    }
  }

  for (const row of eligible) {
    totalProfit += row.profit ?? 0;
    if (typeof row.odds === "number") {
      oddsSum += row.odds;
      oddsCount += 1;
    }
  }

  const hitWins = winCount + halfWinCount;
  const hitLosses = lossCount + halfLossCount;

  function windowRoi(fromDate: string, toDate: string): number | null {
    const windowRows = eligible.filter(
      (row) => row.matchDate >= fromDate && row.matchDate <= toDate
    );
    const profit = windowRows.reduce((sum, row) => sum + (row.profit ?? 0), 0);
    return computeRoi(profit, windowRows.length);
  }

  return {
    verifiedCount,
    roiEligibleCount: eligible.length,
    winCount,
    lossCount,
    pushCount,
    voidCount,
    halfWinCount,
    halfLossCount,
    hitRate: computeHitRate(hitWins, hitLosses),
    totalProfit,
    cumulativeRoi: computeRoi(totalProfit, eligible.length),
    averageOdds: oddsCount > 0 ? oddsSum / oddsCount : null,
    todayRoi: windowRoi(today, today),
    last7DaysRoi: windowRoi(last7From, today),
    last30DaysRoi: windowRoi(last30From, today),
  };
}

function buildBreakdowns(eligibleRows: RoiPerformanceRecord[]) {
  const byMarket = new Map<string, MutableBucket>();
  const byLeague = new Map<string, MutableBucket>();
  const byGrade = new Map<string, MutableBucket>();
  const byWeightVersion = new Map<string, MutableBucket>();

  for (const row of eligibleRows) {
    const marketBucket =
      byMarket.get(row.market) ?? createBucket(row.market, row.market);
    accumulateEligible(marketBucket, row.verificationResult, row.profit ?? 0);
    byMarket.set(row.market, marketBucket);

    const leagueBucket =
      byLeague.get(row.league) ?? createBucket(row.league, row.league);
    accumulateEligible(leagueBucket, row.verificationResult, row.profit ?? 0);
    byLeague.set(row.league, leagueBucket);

    const gradeBucket =
      byGrade.get(row.recommendationGrade) ??
      createBucket(row.recommendationGrade, row.recommendationGrade);
    accumulateEligible(gradeBucket, row.verificationResult, row.profit ?? 0);
    byGrade.set(row.recommendationGrade, gradeBucket);

    const weightBucket =
      byWeightVersion.get(row.weightVersion) ??
      createBucket(row.weightVersion, row.weightVersion);
    accumulateEligible(weightBucket, row.verificationResult, row.profit ?? 0);
    byWeightVersion.set(row.weightVersion, weightBucket);
  }

  return {
    byMarket: sortBreakdownRows([...byMarket.values()].map(finalizeBucket)),
    byLeague: sortBreakdownRows([...byLeague.values()].map(finalizeBucket)),
    byGrade: sortBreakdownRows([...byGrade.values()].map(finalizeBucket)),
    byWeightVersion: sortBreakdownRows(
      [...byWeightVersion.values()].map(finalizeBucket)
    ),
  };
}

/**
 * Build ROI performance summary from an in-memory match_records snapshot.
 * Intended for a single date-filtered load (no per-row DB queries).
 */
export function buildRoiPerformanceResponse(
  records: HistoricalMatchRecord[],
  inputFilters: RoiPerformanceFilters = {},
  now: Date = new Date()
): RoiPerformanceResponse {
  const filters = normalizeRoiPerformanceFilters(inputFilters, now);
  const exclusionCounts = createEmptyExclusionCounts();

  const scopedRecords = records.filter((record) =>
    recordInDateRange(record, filters.fromDate, filters.toDate)
  );
  const verifiedCount = scopedRecords.filter(
    (record) => record.status === "VERIFIED"
  ).length;

  const allRows = scopedRecords.flatMap((record) =>
    buildRecordsFromMatch(record, exclusionCounts)
  );

  const filteredRows = allRows.filter((row) => matchesFilters(row, filters));
  const eligibleForBreakdown = filteredRows.filter((row) => row.roiEligible);
  const summary = buildSummary(filteredRows, verifiedCount, now);
  const breakdowns = buildBreakdowns(eligibleForBreakdown);

  const totalRecords = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / filters.pageSize));
  const page = Math.min(filters.page, totalPages);
  const start = (page - 1) * filters.pageSize;
  const pagedRows = filteredRows
    .slice()
    .sort((left, right) => {
      if (left.matchDate === right.matchDate) {
        return left.matchId.localeCompare(right.matchId);
      }
      return right.matchDate.localeCompare(left.matchDate);
    })
    .slice(start, start + filters.pageSize);

  const markets = [...new Set(allRows.map((row) => row.market))].sort();
  const leagues = [...new Set(allRows.map((row) => row.league))].sort();
  const weightVersions = [
    ...new Set(allRows.map((row) => row.weightVersion)),
  ].sort();

  return {
    generatedAt: now.toISOString(),
    filters: {
      ...filters,
      page,
    },
    summary,
    breakdowns,
    records: pagedRows,
    excludedReasonCounts: exclusionCounts,
    pagination: {
      page,
      pageSize: filters.pageSize,
      totalRecords,
      totalPages,
    },
    filterOptions: {
      markets,
      leagues,
      weightVersions,
      verificationResults: ["WIN", "LOSE", "PUSH", "VOID", "HALF_WIN", "HALF_LOSE"],
    },
  };
}

export function parseRoiPerformanceSearchParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>
): RoiPerformanceFilters {
  const read = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) {
      return params.get(key) ?? undefined;
    }
    const value = params[key];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  };

  const verification = read("verificationResult");
  const onlyEligible = read("onlyRoiEligible");

  return {
    fromDate: read("fromDate"),
    toDate: read("toDate"),
    market: read("market"),
    league: read("league"),
    verificationResult:
      verification === "WIN" ||
      verification === "LOSE" ||
      verification === "PUSH" ||
      verification === "VOID" ||
      verification === "HALF_WIN" ||
      verification === "HALF_LOSE" ||
      verification === "all"
        ? verification
        : undefined,
    weightVersion: read("weightVersion"),
    onlyRoiEligible: onlyEligible === "1" || onlyEligible === "true",
    page: Number.parseInt(read("page") ?? "1", 10) || 1,
    pageSize: Number.parseInt(read("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE,
  };
}

export type { RoiExclusionReason };
