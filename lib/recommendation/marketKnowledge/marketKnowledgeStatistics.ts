import type {
  HistoricalPattern,
  KnowledgeMarketType,
  LeagueStatistics,
  MarketKnowledgeSnapshot,
  MarketStatisticsMap,
  PatternStatistics,
  RuleStatistics,
} from "./marketKnowledgeTypes";
import {
  createEmptyMarketKnowledgeSnapshot,
  createEmptyMarketStatisticsMap,
} from "./marketKnowledgeTypes";
import type { MarketKnowledgeObservation } from "./marketKnowledgeAccumulator";
import { isHit, isPush, resolveOddsRange } from "./marketKnowledgeAccumulator";

interface MutableRuleBucket {
  ruleId: string;
  sampleSize: number;
  hitCount: number;
  missCount: number;
  pushCount: number;
  totalProfit: number;
  totalStake: number;
  totalOdds: number;
  totalConfidence: number;
  totalMarketScore: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

interface MutablePatternBucket {
  patternId: string;
  sampleSize: number;
  hitCount: number;
  totalProfit: number;
  totalStake: number;
  totalOdds: number;
  totalConfidence: number;
  totalMarketScore: number;
  leagueHitRates: Map<string, { hits: number; total: number; profit: number; stake: number }>;
  firstSeen: string | null;
  lastSeen: string | null;
}

interface MutableLeagueBucket {
  leagueId: string;
  leagueName: string;
  marketType: KnowledgeMarketType;
  sampleSize: number;
  hitCount: number;
  totalProfit: number;
  totalStake: number;
  totalOdds: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

interface MutableMarketBucket {
  marketType: KnowledgeMarketType;
  sampleSize: number;
  hitCount: number;
  totalProfit: number;
  totalStake: number;
  totalOdds: number;
  totalMarketScore: number;
}

interface MutableHistoricalBucket {
  key: string;
  marketType: KnowledgeMarketType;
  patternId: string | null;
  ruleIds: string[];
  leagueId: string | null;
  oddsRange: string | null;
  waterRange: string | null;
  sampleSize: number;
  hitCount: number;
  totalProfit: number;
  totalStake: number;
  totalConfidence: number;
}

function updateFirstSeen(current: string | null, candidate: string): string {
  if (!current) {
    return candidate;
  }
  return candidate < current ? candidate : current;
}

function updateLastSeen(current: string | null, candidate: string): string {
  if (!current) {
    return candidate;
  }
  return candidate > current ? candidate : current;
}

function finalizeHitRate(hitCount: number, missCount: number): number {
  const decisive = hitCount + missCount;
  if (decisive === 0) {
    return 0;
  }
  return hitCount / decisive;
}

function finalizeRoi(totalProfit: number, totalStake: number): number {
  if (totalStake <= 0) {
    return 0;
  }
  return totalProfit / totalStake;
}

function applyObservationToRuleBucket(
  bucket: MutableRuleBucket,
  observation: MarketKnowledgeObservation
): void {
  bucket.sampleSize += 1;
  bucket.totalProfit += observation.profit;
  bucket.totalStake += observation.stake;
  bucket.totalOdds += observation.odds;
  bucket.totalConfidence += observation.confidence;
  bucket.totalMarketScore += observation.marketScore;
  bucket.firstSeen = updateFirstSeen(bucket.firstSeen, observation.matchDate);
  bucket.lastSeen = updateLastSeen(bucket.lastSeen, observation.matchDate);

  if (isPush(observation.outcome)) {
    bucket.pushCount += 1;
    return;
  }
  if (observation.hit) {
    bucket.hitCount += 1;
    return;
  }
  bucket.missCount += 1;
}

function applyObservationToPatternBucket(
  bucket: MutablePatternBucket,
  observation: MarketKnowledgeObservation
): void {
  bucket.sampleSize += 1;
  bucket.totalProfit += observation.profit;
  bucket.totalStake += observation.stake;
  bucket.totalOdds += observation.odds;
  bucket.totalConfidence += observation.confidence;
  bucket.totalMarketScore += observation.marketScore;
  bucket.firstSeen = updateFirstSeen(bucket.firstSeen, observation.matchDate);
  bucket.lastSeen = updateLastSeen(bucket.lastSeen, observation.matchDate);

  if (isPush(observation.outcome)) {
    return;
  }

  if (observation.hit) {
    bucket.hitCount += 1;
  }

  const leagueKey = observation.leagueName;
  const leagueBucket = bucket.leagueHitRates.get(leagueKey) ?? {
    hits: 0,
    total: 0,
    profit: 0,
    stake: 0,
  };
  if (!isPush(observation.outcome)) {
    leagueBucket.total += 1;
    if (observation.hit) {
      leagueBucket.hits += 1;
    }
  }
  leagueBucket.profit += observation.profit;
  leagueBucket.stake += observation.stake;
  bucket.leagueHitRates.set(leagueKey, leagueBucket);
}

function applyObservationToLeagueBucket(
  bucket: MutableLeagueBucket,
  observation: MarketKnowledgeObservation
): void {
  bucket.sampleSize += 1;
  bucket.totalProfit += observation.profit;
  bucket.totalStake += observation.stake;
  bucket.totalOdds += observation.odds;
  bucket.firstSeen = updateFirstSeen(bucket.firstSeen, observation.matchDate);
  bucket.lastSeen = updateLastSeen(bucket.lastSeen, observation.matchDate);

  if (isPush(observation.outcome)) {
    return;
  }
  if (observation.hit) {
    bucket.hitCount += 1;
  }
}

function applyObservationToMarketBucket(
  bucket: MutableMarketBucket,
  observation: MarketKnowledgeObservation
): void {
  bucket.sampleSize += 1;
  bucket.totalProfit += observation.profit;
  bucket.totalStake += observation.stake;
  bucket.totalOdds += observation.odds;
  bucket.totalMarketScore += observation.marketScore;

  if (isPush(observation.outcome)) {
    return;
  }
  if (observation.hit) {
    bucket.hitCount += 1;
  }
}

function applyObservationToHistoricalBucket(
  bucket: MutableHistoricalBucket,
  observation: MarketKnowledgeObservation
): void {
  bucket.sampleSize += 1;
  bucket.totalProfit += observation.profit;
  bucket.totalStake += observation.stake;
  bucket.totalConfidence += observation.confidence;

  if (isPush(observation.outcome)) {
    return;
  }
  if (observation.hit) {
    bucket.hitCount += 1;
  }
}

export function buildStatisticsFromObservations(
  observations: MarketKnowledgeObservation[],
  snapshotId: string,
  generatedAt: string
): MarketKnowledgeSnapshot {
  const ruleBuckets = new Map<string, MutableRuleBucket>();
  const patternBuckets = new Map<string, MutablePatternBucket>();
  const leagueBuckets = new Map<string, MutableLeagueBucket>();
  const mutableMarketBuckets: Record<KnowledgeMarketType, MutableMarketBucket> = {
    "1X2": { marketType: "1X2", sampleSize: 0, hitCount: 0, totalProfit: 0, totalStake: 0, totalOdds: 0, totalMarketScore: 0 },
    AH: { marketType: "AH", sampleSize: 0, hitCount: 0, totalProfit: 0, totalStake: 0, totalOdds: 0, totalMarketScore: 0 },
    "O/U": { marketType: "O/U", sampleSize: 0, hitCount: 0, totalProfit: 0, totalStake: 0, totalOdds: 0, totalMarketScore: 0 },
    BTTS: { marketType: "BTTS", sampleSize: 0, hitCount: 0, totalProfit: 0, totalStake: 0, totalOdds: 0, totalMarketScore: 0 },
  };
  const historicalBuckets = new Map<string, MutableHistoricalBucket>();

  for (const observation of observations) {
    if (observation.ruleId) {
      const bucket =
        ruleBuckets.get(observation.ruleId) ??
        ({
          ruleId: observation.ruleId,
          sampleSize: 0,
          hitCount: 0,
          missCount: 0,
          pushCount: 0,
          totalProfit: 0,
          totalStake: 0,
          totalOdds: 0,
          totalConfidence: 0,
          totalMarketScore: 0,
          firstSeen: null,
          lastSeen: null,
        } satisfies MutableRuleBucket);
      applyObservationToRuleBucket(bucket, observation);
      ruleBuckets.set(observation.ruleId, bucket);
    }

    if (observation.patternId) {
      const bucket =
        patternBuckets.get(observation.patternId) ??
        ({
          patternId: observation.patternId,
          sampleSize: 0,
          hitCount: 0,
          totalProfit: 0,
          totalStake: 0,
          totalOdds: 0,
          totalConfidence: 0,
          totalMarketScore: 0,
          leagueHitRates: new Map(),
          firstSeen: null,
          lastSeen: null,
        } satisfies MutablePatternBucket);
      applyObservationToPatternBucket(bucket, observation);
      patternBuckets.set(observation.patternId, bucket);
    }

    if (!observation.ruleId && !observation.patternId) {
      const leagueKey = `${observation.leagueId ?? observation.leagueName}|${observation.marketType}`;
      const leagueBucket =
        leagueBuckets.get(leagueKey) ??
        ({
          leagueId: observation.leagueId ?? observation.leagueName,
          leagueName: observation.leagueName,
          marketType: observation.marketType,
          sampleSize: 0,
          hitCount: 0,
          totalProfit: 0,
          totalStake: 0,
          totalOdds: 0,
          firstSeen: null,
          lastSeen: null,
        } satisfies MutableLeagueBucket);
      applyObservationToLeagueBucket(leagueBucket, observation);
      leagueBuckets.set(leagueKey, leagueBucket);

      applyObservationToMarketBucket(
        mutableMarketBuckets[observation.marketType],
        observation
      );

      const historicalKey = [
        observation.marketType,
        observation.patternId ?? "none",
        observation.ruleId ?? "none",
        observation.leagueId ?? observation.leagueName,
        resolveOddsRange(observation.odds),
        observation.waterLevel,
      ].join("|");

      const historicalBucket =
        historicalBuckets.get(historicalKey) ??
        ({
          key: historicalKey,
          marketType: observation.marketType,
          patternId: observation.patternId,
          ruleIds: observation.triggeredRuleIds,
          leagueId: observation.leagueId,
          oddsRange: resolveOddsRange(observation.odds),
          waterRange: observation.waterLevel,
          sampleSize: 0,
          hitCount: 0,
          totalProfit: 0,
          totalStake: 0,
          totalConfidence: 0,
        } satisfies MutableHistoricalBucket);
      applyObservationToHistoricalBucket(historicalBucket, observation);
      historicalBuckets.set(historicalKey, historicalBucket);
    }
  }

  const ruleStatistics: RuleStatistics[] = [...ruleBuckets.values()]
    .map((bucket) => ({
      ruleId: bucket.ruleId,
      sampleSize: bucket.sampleSize,
      hitCount: bucket.hitCount,
      missCount: bucket.missCount,
      pushCount: bucket.pushCount,
      hitRate: finalizeHitRate(bucket.hitCount, bucket.missCount),
      roi: finalizeRoi(bucket.totalProfit, bucket.totalStake),
      averageOdds: bucket.sampleSize > 0 ? bucket.totalOdds / bucket.sampleSize : 0,
      averageConfidence:
        bucket.sampleSize > 0 ? bucket.totalConfidence / bucket.sampleSize : 0,
      averageMarketScore:
        bucket.sampleSize > 0 ? bucket.totalMarketScore / bucket.sampleSize : 0,
      firstSeen: bucket.firstSeen,
      lastSeen: bucket.lastSeen,
      lastUpdated: generatedAt,
    }))
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId));

  const patternStatistics: PatternStatistics[] = [...patternBuckets.values()]
    .map((bucket) => {
      let bestLeague: string | null = null;
      let worstLeague: string | null = null;
      let bestRate = -1;
      let worstRate = 2;

      for (const [leagueName, leagueBucket] of bucket.leagueHitRates.entries()) {
        if (leagueBucket.total === 0) {
          continue;
        }
        const rate = leagueBucket.hits / leagueBucket.total;
        if (rate > bestRate) {
          bestRate = rate;
          bestLeague = leagueName;
        }
        if (rate < worstRate) {
          worstRate = rate;
          worstLeague = leagueName;
        }
      }

      const missCount = bucket.sampleSize - bucket.hitCount;
      return {
        patternId: bucket.patternId,
        sampleSize: bucket.sampleSize,
        hitRate: finalizeHitRate(bucket.hitCount, missCount),
        roi: finalizeRoi(bucket.totalProfit, bucket.totalStake),
        averageOdds: bucket.sampleSize > 0 ? bucket.totalOdds / bucket.sampleSize : 0,
        averageConfidence:
          bucket.sampleSize > 0 ? bucket.totalConfidence / bucket.sampleSize : 0,
        averageMarketScore:
          bucket.sampleSize > 0 ? bucket.totalMarketScore / bucket.sampleSize : 0,
        bestLeague,
        worstLeague,
        firstSeen: bucket.firstSeen,
        lastSeen: bucket.lastSeen,
      };
    })
    .sort((left, right) => left.patternId.localeCompare(right.patternId));

  const leagueStatistics: LeagueStatistics[] = [...leagueBuckets.values()]
    .map((bucket) => ({
      leagueId: bucket.leagueId,
      leagueName: bucket.leagueName,
      marketType: bucket.marketType,
      sampleSize: bucket.sampleSize,
      hitRate: finalizeHitRate(bucket.hitCount, bucket.sampleSize - bucket.hitCount),
      roi: finalizeRoi(bucket.totalProfit, bucket.totalStake),
      averageOdds: bucket.sampleSize > 0 ? bucket.totalOdds / bucket.sampleSize : 0,
    }))
    .sort((left, right) =>
      `${left.leagueName}:${left.marketType}`.localeCompare(
        `${right.leagueName}:${right.marketType}`
      )
    );

  const marketStatistics: MarketStatisticsMap = {
    "1X2": finalizeMarketBucket(mutableMarketBuckets["1X2"]),
    AH: finalizeMarketBucket(mutableMarketBuckets.AH),
    "O/U": finalizeMarketBucket(mutableMarketBuckets["O/U"]),
    BTTS: finalizeMarketBucket(mutableMarketBuckets.BTTS),
  };

  const historicalPatterns: HistoricalPattern[] = [...historicalBuckets.values()]
    .map((bucket) => ({
      marketType: bucket.marketType,
      patternId: bucket.patternId,
      ruleIds: bucket.ruleIds,
      leagueId: bucket.leagueId,
      oddsRange: bucket.oddsRange,
      waterRange: bucket.waterRange,
      sampleSize: bucket.sampleSize,
      hitRate: finalizeHitRate(bucket.hitCount, bucket.sampleSize - bucket.hitCount),
      roi: finalizeRoi(bucket.totalProfit, bucket.totalStake),
      confidence: bucket.sampleSize > 0 ? bucket.totalConfidence / bucket.sampleSize : 0,
    }))
    .sort((left, right) =>
      `${left.marketType}:${left.patternId}:${left.leagueId}`.localeCompare(
        `${right.marketType}:${right.patternId}:${right.leagueId}`
      )
    );

  const snapshot = createEmptyMarketKnowledgeSnapshot(snapshotId, generatedAt);
  snapshot.status = "available";
  snapshot.message = undefined;
  snapshot.ruleStatistics = ruleStatistics;
  snapshot.patternStatistics = patternStatistics;
  snapshot.marketStatistics = marketStatistics;
  snapshot.leagueStatistics = leagueStatistics;
  snapshot.historicalPatterns = historicalPatterns;
  return snapshot;
}

function finalizeMarketBucket(bucket: MutableMarketBucket) {
  const missCount = bucket.sampleSize - bucket.hitCount;
  return {
    marketType: bucket.marketType,
    sampleSize: bucket.sampleSize,
    hitRate: finalizeHitRate(bucket.hitCount, missCount),
    roi: finalizeRoi(bucket.totalProfit, bucket.totalStake),
    averageOdds: bucket.sampleSize > 0 ? bucket.totalOdds / bucket.sampleSize : 0,
    averageMarketScore:
      bucket.sampleSize > 0 ? bucket.totalMarketScore / bucket.sampleSize : 0,
  };
}

export function buildRuleStatisticsFromObservations(
  observations: MarketKnowledgeObservation[]
): RuleStatistics[] {
  return buildStatisticsFromObservations(
    observations,
    "temp",
    new Date().toISOString()
  ).ruleStatistics;
}

export function buildPatternStatisticsFromObservations(
  observations: MarketKnowledgeObservation[]
): PatternStatistics[] {
  return buildStatisticsFromObservations(
    observations,
    "temp",
    new Date().toISOString()
  ).patternStatistics;
}

export function buildLeagueStatisticsFromObservations(
  observations: MarketKnowledgeObservation[]
): LeagueStatistics[] {
  return buildStatisticsFromObservations(
    observations,
    "temp",
    new Date().toISOString()
  ).leagueStatistics;
}

export function buildMarketStatisticsFromObservations(
  observations: MarketKnowledgeObservation[]
): MarketStatisticsMap {
  return buildStatisticsFromObservations(
    observations,
    "temp",
    new Date().toISOString()
  ).marketStatistics;
}
