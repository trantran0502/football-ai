import type { KnowledgeMarketType } from "../marketKnowledgeTypes";

export interface IncrementalRuleUpdate {
  ruleId: string;
  previousSampleSize: number;
  nextSampleSize: number;
}

export interface IncrementalPatternUpdate {
  patternId: string;
  previousSampleSize: number;
  nextSampleSize: number;
}

export interface IncrementalMarketUpdate {
  marketType: KnowledgeMarketType;
  previousSampleSize: number;
  nextSampleSize: number;
}

export interface IncrementalLeagueUpdate {
  leagueKey: string;
  previousSampleSize: number;
  nextSampleSize: number;
}

export interface MarketKnowledgeIncrementalReport {
  updatedRules: IncrementalRuleUpdate[];
  updatedPatterns: IncrementalPatternUpdate[];
  updatedMarkets: IncrementalMarketUpdate[];
  updatedLeagues: IncrementalLeagueUpdate[];
  processingTimeMs: number;
  newSnapshotId: string;
  parentSnapshotId: string | null;
}

export function buildIncrementalReport(input: {
  previousSnapshot: import("../marketKnowledgeTypes").MarketKnowledgeSnapshot | null;
  nextSnapshot: import("../marketKnowledgeTypes").MarketKnowledgeSnapshot;
  processingTimeMs: number;
}): MarketKnowledgeIncrementalReport {
  const previous = input.previousSnapshot;
  const next = input.nextSnapshot;

  const previousRules = new Map(
    (previous?.ruleStatistics ?? []).map((rule) => [rule.ruleId, rule.sampleSize])
  );
  const previousPatterns = new Map(
    (previous?.patternStatistics ?? []).map((pattern) => [
      pattern.patternId,
      pattern.sampleSize,
    ])
  );
  const previousMarkets = new Map(
    previous
      ? (Object.keys(previous.marketStatistics) as KnowledgeMarketType[]).map((marketType) => [
          marketType,
          previous.marketStatistics[marketType].sampleSize,
        ])
      : []
  );
  const previousLeagues = new Map(
    (previous?.leagueStatistics ?? []).map((league) => [
      `${league.leagueId}|${league.marketType}`,
      league.sampleSize,
    ])
  );

  const updatedRules = next.ruleStatistics
    .filter((rule) => rule.sampleSize > (previousRules.get(rule.ruleId) ?? 0))
    .map((rule) => ({
      ruleId: rule.ruleId,
      previousSampleSize: previousRules.get(rule.ruleId) ?? 0,
      nextSampleSize: rule.sampleSize,
    }))
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId));

  const updatedPatterns = next.patternStatistics
    .filter((pattern) => pattern.sampleSize > (previousPatterns.get(pattern.patternId) ?? 0))
    .map((pattern) => ({
      patternId: pattern.patternId,
      previousSampleSize: previousPatterns.get(pattern.patternId) ?? 0,
      nextSampleSize: pattern.sampleSize,
    }))
    .sort((left, right) => left.patternId.localeCompare(right.patternId));

  const updatedMarkets = (Object.keys(next.marketStatistics) as KnowledgeMarketType[])
    .filter(
      (marketType) =>
        next.marketStatistics[marketType].sampleSize >
        (previousMarkets.get(marketType) ?? 0)
    )
    .map((marketType) => ({
      marketType,
      previousSampleSize: previousMarkets.get(marketType) ?? 0,
      nextSampleSize: next.marketStatistics[marketType].sampleSize,
    }))
    .sort((left, right) => left.marketType.localeCompare(right.marketType));

  const updatedLeagues = next.leagueStatistics
    .filter((league) => {
      const key = `${league.leagueId}|${league.marketType}`;
      return league.sampleSize > (previousLeagues.get(key) ?? 0);
    })
    .map((league) => {
      const key = `${league.leagueId}|${league.marketType}`;
      return {
        leagueKey: key,
        previousSampleSize: previousLeagues.get(key) ?? 0,
        nextSampleSize: league.sampleSize,
      };
    })
    .sort((left, right) => left.leagueKey.localeCompare(right.leagueKey));

  return {
    updatedRules,
    updatedPatterns,
    updatedMarkets,
    updatedLeagues,
    processingTimeMs: input.processingTimeMs,
    newSnapshotId: next.id,
    parentSnapshotId: previous?.id ?? null,
  };
}
