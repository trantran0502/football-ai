import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  accumulateVerifiedMatchesForKnowledge,
  type MarketKnowledgeObservation,
} from "./marketKnowledgeAccumulator";
import {
  buildLeagueStatisticsFromObservations,
  buildMarketStatisticsFromObservations,
  buildPatternStatisticsFromObservations,
  buildRuleStatisticsFromObservations,
} from "./marketKnowledgeStatistics";
import {
  NOT_IMPLEMENTED_KNOWLEDGE_MESSAGE,
  type MarketKnowledgeBuilderResult,
  type MarketStatisticsMap,
  type PatternStatistics,
  type RuleStatistics,
} from "./marketKnowledgeTypes";
import type { LeagueStatistics } from "./marketKnowledgeTypes";

export interface MarketKnowledgeBuilder {
  buildRuleStatistics(): MarketKnowledgeBuilderResult<RuleStatistics[]>;
  buildPatternStatistics(): MarketKnowledgeBuilderResult<PatternStatistics[]>;
  buildLeagueStatistics(): MarketKnowledgeBuilderResult<LeagueStatistics[]>;
  buildMarketStatistics(): MarketKnowledgeBuilderResult<MarketStatisticsMap>;
}

export interface MarketKnowledgeBuilderSource {
  verifiedMatches?: HistoricalMatchRecord[];
  observations?: MarketKnowledgeObservation[];
}

let builderSource: MarketKnowledgeBuilderSource = {};

export function setMarketKnowledgeBuilderSource(
  source: MarketKnowledgeBuilderSource
): void {
  builderSource = source;
}

export function resetMarketKnowledgeBuilderSource(): void {
  builderSource = {};
}

function resolveObservations(): MarketKnowledgeObservation[] {
  if (builderSource.observations) {
    return builderSource.observations;
  }
  if (builderSource.verifiedMatches) {
    return accumulateVerifiedMatchesForKnowledge(builderSource.verifiedMatches);
  }
  return [];
}

function availableResult<T>(data: T): MarketKnowledgeBuilderResult<T> {
  return {
    status: "available",
    message: "Built from VERIFIED match observations.",
    data,
  };
}

function notImplementedResult<T>(): MarketKnowledgeBuilderResult<T> {
  return {
    status: "notImplemented",
    message: NOT_IMPLEMENTED_KNOWLEDGE_MESSAGE,
    data: null,
  };
}

export function createMarketKnowledgeBuilder(
  source: MarketKnowledgeBuilderSource = {}
): MarketKnowledgeBuilder {
  return {
    buildRuleStatistics() {
      const observations = source.observations
        ? source.observations
        : source.verifiedMatches
          ? accumulateVerifiedMatchesForKnowledge(source.verifiedMatches)
          : [];
      return availableResult(buildRuleStatisticsFromObservations(observations));
    },
    buildPatternStatistics() {
      const observations = source.observations
        ? source.observations
        : source.verifiedMatches
          ? accumulateVerifiedMatchesForKnowledge(source.verifiedMatches)
          : [];
      return availableResult(buildPatternStatisticsFromObservations(observations));
    },
    buildLeagueStatistics() {
      const observations = source.observations
        ? source.observations
        : source.verifiedMatches
          ? accumulateVerifiedMatchesForKnowledge(source.verifiedMatches)
          : [];
      return availableResult(buildLeagueStatisticsFromObservations(observations));
    },
    buildMarketStatistics() {
      const observations = source.observations
        ? source.observations
        : source.verifiedMatches
          ? accumulateVerifiedMatchesForKnowledge(source.verifiedMatches)
          : [];
      return availableResult(buildMarketStatisticsFromObservations(observations));
    },
  };
}

export function createNotImplementedMarketKnowledgeBuilder(): MarketKnowledgeBuilder {
  return {
    buildRuleStatistics() {
      return notImplementedResult<RuleStatistics[]>();
    },
    buildPatternStatistics() {
      return notImplementedResult<PatternStatistics[]>();
    },
    buildLeagueStatistics() {
      return notImplementedResult<LeagueStatistics[]>();
    },
    buildMarketStatistics() {
      return notImplementedResult<MarketStatisticsMap>();
    },
  };
}

export const marketKnowledgeBuilder = createMarketKnowledgeBuilder();

export function buildRuleStatistics(): MarketKnowledgeBuilderResult<RuleStatistics[]> {
  const observations = resolveObservations();
  if (observations.length === 0 && !builderSource.verifiedMatches && !builderSource.observations) {
    return notImplementedResult<RuleStatistics[]>();
  }
  return availableResult(buildRuleStatisticsFromObservations(observations));
}

export function buildPatternStatistics(): MarketKnowledgeBuilderResult<PatternStatistics[]> {
  const observations = resolveObservations();
  if (observations.length === 0 && !builderSource.verifiedMatches && !builderSource.observations) {
    return notImplementedResult<PatternStatistics[]>();
  }
  return availableResult(buildPatternStatisticsFromObservations(observations));
}

export function buildLeagueStatistics(): MarketKnowledgeBuilderResult<LeagueStatistics[]> {
  const observations = resolveObservations();
  if (observations.length === 0 && !builderSource.verifiedMatches && !builderSource.observations) {
    return notImplementedResult<LeagueStatistics[]>();
  }
  return availableResult(buildLeagueStatisticsFromObservations(observations));
}

export function buildMarketStatistics(): MarketKnowledgeBuilderResult<MarketStatisticsMap> {
  const observations = resolveObservations();
  if (observations.length === 0 && !builderSource.verifiedMatches && !builderSource.observations) {
    return notImplementedResult<MarketStatisticsMap>();
  }
  return availableResult(buildMarketStatisticsFromObservations(observations));
}
