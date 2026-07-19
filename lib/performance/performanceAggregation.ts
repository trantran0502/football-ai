import type {
  EnrichedDailyRecommendation,
  PerformanceBucketStats,
  PerformanceCenterReport,
  PerformanceHighlight,
  PerformanceHitRateTrend,
  PerformancePeriodStats,
  PerformanceRecentPick,
  PerformanceStreakStats,
  PerformanceTotalStats,
} from "@/lib/performance/performanceTypes";

const MIN_HIGHLIGHT_DECISIVE = 3;

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function computeHitRate(hits: number, misses: number): number | null {
  const decisive = hits + misses;
  if (decisive === 0) {
    return null;
  }
  return hits / decisive;
}

function computeRoi(profit: number, totalStake: number): number | null {
  if (totalStake === 0) {
    return null;
  }
  return profit / totalStake;
}

function buildPeriodStats(items: EnrichedDailyRecommendation[]): PerformancePeriodStats {
  let hits = 0;
  let misses = 0;
  let pending = 0;
  let profit = 0;
  let totalStake = 0;

  for (const item of items) {
    if (item.outcome === "hit") {
      hits += 1;
      totalStake += item.stake;
      profit += item.profit ?? 0;
    } else if (item.outcome === "miss") {
      misses += 1;
      totalStake += item.stake;
      profit += item.profit ?? -item.stake;
    } else {
      pending += 1;
    }
  }

  return {
    recommendations: items.length,
    hits,
    misses,
    pending,
    hitRate: computeHitRate(hits, misses),
    profit,
    totalStake,
    roi: computeRoi(profit, totalStake),
  };
}

function buildBucketStats(
  items: EnrichedDailyRecommendation[],
  keySelector: (item: EnrichedDailyRecommendation) => string,
  labelSelector: (key: string) => string
): PerformanceBucketStats[] {
  const groups = new Map<string, EnrichedDailyRecommendation[]>();

  for (const item of items) {
    const key = keySelector(item);
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }

  return [...groups.entries()]
    .map(([key, bucketItems]) => {
      const stats = buildPeriodStats(bucketItems);
      return {
        key,
        label: labelSelector(key),
        recommendations: stats.recommendations,
        hits: stats.hits,
        misses: stats.misses,
        pending: stats.pending,
        hitRate: stats.hitRate,
        profit: stats.profit,
        totalStake: stats.totalStake,
        roi: stats.roi,
      };
    })
    .sort((left, right) => {
      if (right.recommendations !== left.recommendations) {
        return right.recommendations - left.recommendations;
      }
      return left.label.localeCompare(right.label, "zh-Hant");
    });
}

function resolveLastUpdatedAt(items: EnrichedDailyRecommendation[]): string | null {
  let latest: string | null = null;

  for (const item of items) {
    const candidate = item.recommendation.createdAt;
    if (!latest || candidate > latest) {
      latest = candidate;
    }
  }

  return latest;
}

function sortDecisiveChronologically(
  items: EnrichedDailyRecommendation[]
): EnrichedDailyRecommendation[] {
  return items
    .filter((item) => item.outcome === "hit" || item.outcome === "miss")
    .sort((left, right) => {
      const dateCompare = left.recommendation.matchDate.localeCompare(
        right.recommendation.matchDate
      );
      if (dateCompare !== 0) {
        return dateCompare;
      }
      if (left.recommendation.rank !== right.recommendation.rank) {
        return left.recommendation.rank - right.recommendation.rank;
      }
      return left.recommendation.createdAt.localeCompare(right.recommendation.createdAt);
    });
}

export function buildStreakStats(items: EnrichedDailyRecommendation[]): PerformanceStreakStats {
  const decisive = sortDecisiveChronologically(items);

  let maxWinStreak = 0;
  let runningStreak = 0;

  for (const item of decisive) {
    if (item.outcome === "hit") {
      runningStreak += 1;
      maxWinStreak = Math.max(maxWinStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  }

  let currentWinStreak = 0;
  for (let index = decisive.length - 1; index >= 0; index -= 1) {
    if (decisive[index]?.outcome !== "hit") {
      break;
    }
    currentWinStreak += 1;
  }

  return {
    currentWinStreak,
    maxWinStreak,
  };
}

function bucketToHighlight(bucket: PerformanceBucketStats): PerformanceHighlight {
  return {
    label: bucket.label,
    hitRate: bucket.hitRate,
    recommendations: bucket.recommendations,
    hits: bucket.hits,
    misses: bucket.misses,
    roi: bucket.roi,
  };
}

export function resolveBestHighlight(
  buckets: PerformanceBucketStats[],
  minDecisive = MIN_HIGHLIGHT_DECISIVE
): PerformanceHighlight | null {
  const qualified = buckets.filter(
    (bucket) => bucket.hits + bucket.misses >= minDecisive && bucket.hitRate !== null
  );

  if (qualified.length === 0) {
    return null;
  }

  const best = [...qualified].sort((left, right) => {
    const leftRate = left.hitRate ?? 0;
    const rightRate = right.hitRate ?? 0;
    if (rightRate !== leftRate) {
      return rightRate - leftRate;
    }
    const leftDecisive = left.hits + left.misses;
    const rightDecisive = right.hits + right.misses;
    if (rightDecisive !== leftDecisive) {
      return rightDecisive - leftDecisive;
    }
    return left.label.localeCompare(right.label, "zh-Hant");
  })[0];

  return best ? bucketToHighlight(best) : null;
}

export function buildHitRateTrend(
  last30Stats: PerformancePeriodStats,
  previous30Stats: PerformancePeriodStats
): PerformanceHitRateTrend {
  const hitRate = last30Stats.hitRate;
  const previousHitRate = previous30Stats.hitRate;
  let delta: number | null = null;
  let direction: PerformanceHitRateTrend["direction"] = null;

  if (hitRate !== null && previousHitRate !== null) {
    delta = hitRate - previousHitRate;
    if (Math.abs(delta) < 0.001) {
      direction = "flat";
    } else if (delta > 0) {
      direction = "up";
    } else {
      direction = "down";
    }
  }

  return {
    periodLabel: "近 30 天",
    hitRate,
    previousHitRate,
    delta,
    direction,
  };
}

function buildRecentPicks(items: EnrichedDailyRecommendation[]): PerformanceRecentPick[] {
  return [...items]
    .sort((left, right) => {
      const leftDate = left.recommendation.matchDate;
      const rightDate = right.recommendation.matchDate;
      if (leftDate !== rightDate) {
        return rightDate.localeCompare(leftDate);
      }
      if (left.recommendation.rank !== right.recommendation.rank) {
        return left.recommendation.rank - right.recommendation.rank;
      }
      return right.recommendation.createdAt.localeCompare(left.recommendation.createdAt);
    })
    .slice(0, 20)
    .map((item) => ({
      id: item.recommendation.id,
      matchDate: item.recommendation.matchDate,
      leagueName: item.recommendation.leagueName || "未分類",
      matchLabel: `${item.recommendation.homeTeam} vs ${item.recommendation.awayTeam}`,
      market: item.recommendation.market,
      recommendation: item.recommendation.recommendation,
      playType: item.playType,
      odds: item.recommendation.odds,
      score: item.recommendation.score,
      confidence: item.recommendation.confidence,
      grade: item.recommendation.grade,
      stars: item.stars,
      outcome: item.outcome,
      profit: item.profit,
      replayId: item.replayId,
    }));
}

export interface BuildPerformanceCenterReportInput {
  items: EnrichedDailyRecommendation[];
  now?: Date;
}

export function buildPerformanceCenterReport(
  input: BuildPerformanceCenterReportInput
): PerformanceCenterReport {
  const now = input.now ?? new Date();
  const todayKey = dateKey(now);
  const yesterdayKeyValue = dateKey(addUtcDays(now, -1));
  const last7StartKey = dateKey(addUtcDays(now, -6));
  const last30StartKey = dateKey(addUtcDays(now, -29));
  const previous30StartKey = dateKey(addUtcDays(now, -59));
  const previous30EndKey = dateKey(addUtcDays(now, -30));

  const yesterdayItems = input.items.filter(
    (item) => item.recommendation.matchDate === yesterdayKeyValue
  );
  const last7Items = input.items.filter(
    (item) =>
      item.recommendation.matchDate >= last7StartKey &&
      item.recommendation.matchDate <= todayKey
  );
  const last30Items = input.items.filter(
    (item) =>
      item.recommendation.matchDate >= last30StartKey &&
      item.recommendation.matchDate <= todayKey
  );
  const previous30Items = input.items.filter(
    (item) =>
      item.recommendation.matchDate >= previous30StartKey &&
      item.recommendation.matchDate <= previous30EndKey
  );

  const allTimeStats = buildPeriodStats(input.items);
  const last30Stats = buildPeriodStats(last30Items);
  const previous30Stats = buildPeriodStats(previous30Items);
  const byLeague = buildBucketStats(
    input.items,
    (item) => item.recommendation.leagueName || "未分類",
    (key) => key
  );
  const byMarket = buildBucketStats(
    input.items,
    (item) => item.playType,
    (key) => key
  );

  const total: PerformanceTotalStats = {
    ...allTimeStats,
    lastUpdatedAt: resolveLastUpdatedAt(input.items),
  };

  return {
    total,
    yesterday: buildPeriodStats(yesterdayItems),
    last7Days: buildPeriodStats(last7Items),
    last30Days: last30Stats,
    allTime: allTimeStats,
    streaks: buildStreakStats(input.items),
    bestLeague: resolveBestHighlight(byLeague),
    bestMarket: resolveBestHighlight(byMarket),
    hitRateTrend: buildHitRateTrend(last30Stats, previous30Stats),
    byLeague,
    byMarket,
    byGrade: buildBucketStats(
      input.items.filter((item) => item.stars),
      (item) => item.stars,
      (key) => key
    ),
    recent: buildRecentPicks(input.items),
  };
}
