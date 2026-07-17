import type { KnowledgeMarketType, MarketKnowledgeSnapshot } from "@/lib/recommendation/marketKnowledge/marketKnowledgeTypes";
import { createEmptyMarketStatisticsMap } from "@/lib/recommendation/marketKnowledge/marketKnowledgeTypes";
import type {
  ReplayAuditEntry,
  ReplayMarketStatChange,
  ReplayReport,
  ReplayStatChange,
  ReplayStep,
  StatisticsDiff,
} from "./marketKnowledgeReplayTypes";

function changeStat(
  id: string,
  previous: { sampleSize: number; hitRate: number; roi: number } | undefined,
  next: { sampleSize: number; hitRate: number; roi: number }
): ReplayStatChange {
  return {
    id,
    previousSampleSize: previous?.sampleSize ?? 0,
    nextSampleSize: next.sampleSize,
    sampleSizeDelta: next.sampleSize - (previous?.sampleSize ?? 0),
    previousHitRate: previous?.hitRate ?? 0,
    nextHitRate: next.hitRate,
    previousRoi: previous?.roi ?? 0,
    nextRoi: next.roi,
  };
}

function leagueKey(leagueId: string, marketType: KnowledgeMarketType): string {
  return `${leagueId}:${marketType}`;
}

export function compareKnowledgeSnapshots(
  previous: MarketKnowledgeSnapshot | null,
  next: MarketKnowledgeSnapshot
): Pick<ReplayStep, "ruleChanges" | "patternChanges" | "marketChanges" | "leagueChanges"> {
  const previousRules = new Map(
    (previous?.ruleStatistics ?? []).map((item) => [item.ruleId, item])
  );
  const previousPatterns = new Map(
    (previous?.patternStatistics ?? []).map((item) => [item.patternId, item])
  );
  const previousLeagues = new Map(
    (previous?.leagueStatistics ?? []).map((item) => [
      leagueKey(item.leagueId, item.marketType),
      item,
    ])
  );
  const previousMarkets = previous?.marketStatistics ?? createEmptyMarketStatisticsMap();

  const ruleChanges = next.ruleStatistics
    .map((item) => changeStat(item.ruleId, previousRules.get(item.ruleId), item))
    .filter((item) => item.sampleSizeDelta !== 0);

  const patternChanges = next.patternStatistics
    .map((item) => changeStat(item.patternId, previousPatterns.get(item.patternId), item))
    .filter((item) => item.sampleSizeDelta !== 0);

  const marketChanges: ReplayMarketStatChange[] = (
    Object.keys(next.marketStatistics) as KnowledgeMarketType[]
  )
    .map((marketType) => {
      const previous = previousMarkets[marketType];
      const nextEntry = next.marketStatistics[marketType];
      return {
        marketType,
        previousSampleSize: previous?.sampleSize ?? 0,
        nextSampleSize: nextEntry.sampleSize,
        sampleSizeDelta: nextEntry.sampleSize - (previous?.sampleSize ?? 0),
        previousHitRate: previous?.hitRate ?? 0,
        nextHitRate: nextEntry.hitRate,
        previousRoi: previous?.roi ?? 0,
        nextRoi: nextEntry.roi,
      };
    })
    .filter((item) => item.sampleSizeDelta !== 0);

  const leagueChanges = next.leagueStatistics
    .map((item) =>
      changeStat(
        leagueKey(item.leagueId, item.marketType),
        previousLeagues.get(leagueKey(item.leagueId, item.marketType)),
        item
      )
    )
    .filter((item) => item.sampleSizeDelta !== 0);

  return {
    ruleChanges,
    patternChanges,
    marketChanges,
    leagueChanges,
  };
}

export function buildStatisticsDiff(
  first: MarketKnowledgeSnapshot | null,
  last: MarketKnowledgeSnapshot | null
): StatisticsDiff | null {
  if (!first || !last) {
    return null;
  }

  const diff = compareKnowledgeSnapshots(first, last);
  return {
    rules: diff.ruleChanges,
    patterns: diff.patternChanges,
    markets: diff.marketChanges,
    leagues: diff.leagueChanges,
  };
}

export function buildReplayAuditEntry(step: ReplayStep): ReplayAuditEntry {
  return {
    stepIndex: step.stepIndex,
    matchId: step.matchId,
    snapshotId: step.snapshotId,
    updatedRuleIds: step.ruleChanges.map((item) => item.id),
    updatedPatternIds: step.patternChanges.map((item) => item.id),
    updatedLeagueKeys: step.leagueChanges.map((item) => item.id),
    updatedMarketTypes: step.marketChanges.map((item) => item.marketType),
  };
}

export function finalizeReplayReport(partial: {
  matchesProcessed: number;
  ruleUpdates: number;
  patternUpdates: number;
  marketUpdates: number;
  leagueUpdates: number;
  snapshotCount: number;
  processingTimeMs: number;
  dryRun: boolean;
  steps: ReplayStep[];
  audit: ReplayAuditEntry[];
  snapshots: MarketKnowledgeSnapshot[];
  firstSnapshotId: string | null;
  lastSnapshotId: string | null;
  statisticsDiff: StatisticsDiff | null;
  validation: ReplayReport["validation"];
}): ReplayReport {
  return partial;
}

export function countUniqueUpdates(steps: ReplayStep[]): {
  ruleUpdates: number;
  patternUpdates: number;
  marketUpdates: number;
  leagueUpdates: number;
} {
  const rules = new Set<string>();
  const patterns = new Set<string>();
  const markets = new Set<string>();
  const leagues = new Set<string>();

  for (const step of steps) {
    for (const item of step.ruleChanges) {
      rules.add(item.id);
    }
    for (const item of step.patternChanges) {
      patterns.add(item.id);
    }
    for (const item of step.marketChanges) {
      markets.add(item.marketType);
    }
    for (const item of step.leagueChanges) {
      leagues.add(item.id);
    }
  }

  return {
    ruleUpdates: rules.size,
    patternUpdates: patterns.size,
    marketUpdates: markets.size,
    leagueUpdates: leagues.size,
  };
}
