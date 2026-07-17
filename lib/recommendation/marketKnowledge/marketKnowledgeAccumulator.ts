import { calculateProfit } from "@/lib/backtest/betEvaluator";
import { settleBet } from "@/lib/backtest/settlement";
import type { BetResult } from "@/lib/backtest/types";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { runMarketEngine } from "@/lib/recommendation/marketEngine/marketEngine";
import type { MarketAnalysis } from "@/lib/recommendation/marketEngine/marketEngineTypes";
import {
  classifyWaterLevel,
  evaluateMarketOddsRules,
  type WaterLevel,
} from "@/lib/recommendation/marketEngine/marketOddsRules";
import { convertRawOdds } from "@/lib/analysis/featureScore/oddsConversion";
import type { MarketSelection } from "@/types/match";
import type { KnowledgeMarketType } from "./marketKnowledgeTypes";

export type KnowledgeOutcome = BetResult;

export interface MarketKnowledgeObservation {
  matchRecordId: string;
  matchDate: string;
  verifiedAt: string;
  leagueId: string | null;
  leagueName: string;
  marketType: KnowledgeMarketType;
  ruleId: string | null;
  patternId: string | null;
  triggeredRuleIds: string[];
  matchedPatternIds: string[];
  outcome: KnowledgeOutcome;
  hit: boolean;
  profit: number;
  stake: number;
  odds: number;
  waterLevel: WaterLevel;
  confidence: number;
  marketScore: number;
}

export interface VerifiedMarketKnowledgeEvaluation {
  matchRecordId: string;
  triggeredRuleIds: string[];
  matchedPatternIds: string[];
  observations: MarketKnowledgeObservation[];
  skippedReason?: string;
}

const DEFAULT_STAKE = 1;

function isHit(result: BetResult): boolean {
  return result === "WIN" || result === "HALF_WIN";
}

function isPush(result: BetResult): boolean {
  return result === "PUSH";
}

function filterSelectionsForMarketType(
  marketType: KnowledgeMarketType,
  selections: MarketSelection[]
): MarketSelection[] {
  switch (marketType) {
    case "1X2":
      return selections.filter((selection) => selection.marketType === "moneyline");
    case "AH":
      return selections.filter(
        (selection) =>
          selection.marketType === "handicap" &&
          selection.marketFamily === "asianHandicap"
      );
    case "O/U":
      return selections.filter(
        (selection) =>
          selection.marketType === "totalGoals" &&
          selection.marketFamily === "asianOverUnder"
      );
    case "BTTS":
      return selections.filter((selection) => selection.marketType === "btts");
  }
}

function findLeanSelection(
  analysis: MarketAnalysis,
  selections: MarketSelection[]
): MarketSelection | undefined {
  if (analysis.recommendation.action !== "lean" || !analysis.recommendation.side) {
    return undefined;
  }

  const marketSelections = filterSelectionsForMarketType(analysis.marketType, selections);
  return marketSelections.find(
    (selection) =>
      selection.side === analysis.recommendation.side &&
      (analysis.line === null || selection.line === analysis.line) &&
      selection.period === analysis.period
  );
}

function resolveWaterLevel(selection: MarketSelection): WaterLevel {
  const converted = convertRawOdds(selection.odds);
  if (!converted) {
    return "unknown";
  }
  return classifyWaterLevel(converted.rawOdds, converted.format);
}

function resolveOddsRange(odds: number): string {
  if (odds < 0.85) {
    return "<0.85";
  }
  if (odds <= 0.98) {
    return "0.85-0.98";
  }
  if (odds < 2.2) {
    return "0.99-2.19";
  }
  return ">=2.2";
}

export function evaluateVerifiedMatchForKnowledge(
  record: HistoricalMatchRecord
): VerifiedMarketKnowledgeEvaluation {
  if (record.status !== "VERIFIED" || !record.result) {
    return {
      matchRecordId: record.id,
      triggeredRuleIds: [],
      matchedPatternIds: [],
      observations: [],
      skippedReason: "Match is not VERIFIED or missing result.",
    };
  }

  if (record.marketSelections.length === 0) {
    return {
      matchRecordId: record.id,
      triggeredRuleIds: [],
      matchedPatternIds: [],
      observations: [],
      skippedReason: "Missing market selections.",
    };
  }

  const engineSnapshot = runMarketEngine(record.marketSelections);
  const verifiedAt =
    record.verificationResult?.verifiedAt ?? record.updatedAt ?? record.createdAt;
  const observations: MarketKnowledgeObservation[] = [];
  const triggeredRuleIds = new Set<string>();
  const matchedPatternIds = new Set<string>();

  for (const analysis of engineSnapshot.markets) {
    const leanSelection = findLeanSelection(analysis, record.marketSelections);
    if (!leanSelection) {
      continue;
    }

    const settlement = settleBet(leanSelection, record.result);
    const profit = calculateProfit(settlement, leanSelection.odds, DEFAULT_STAKE);
    const hit = isHit(settlement);
    const waterLevel = resolveWaterLevel(leanSelection);
    const marketGroup = filterSelectionsForMarketType(
      analysis.marketType,
      record.marketSelections
    );
    evaluateMarketOddsRules(marketGroup);

    const baseObservation = {
      matchRecordId: record.id,
      matchDate: record.matchDate,
      verifiedAt,
      leagueId: record.leagueId != null ? String(record.leagueId) : null,
      leagueName: record.league,
      marketType: analysis.marketType,
      triggeredRuleIds: analysis.ruleResults
        .filter((rule) => rule.triggered)
        .map((rule) => rule.id),
      matchedPatternIds: analysis.matchedPatterns.map((pattern) => pattern.id),
      outcome: settlement,
      hit,
      profit,
      stake: DEFAULT_STAKE,
      odds: leanSelection.odds,
      waterLevel,
      confidence: analysis.confidence,
      marketScore: analysis.finalScore,
    };

    for (const rule of analysis.ruleResults) {
      if (!rule.triggered) {
        continue;
      }
      triggeredRuleIds.add(rule.id);
      observations.push({
        ...baseObservation,
        ruleId: rule.id,
        patternId: null,
      });
    }

    for (const pattern of analysis.matchedPatterns) {
      matchedPatternIds.add(pattern.id);
      observations.push({
        ...baseObservation,
        ruleId: null,
        patternId: pattern.id,
      });
    }

    observations.push({
      ...baseObservation,
      ruleId: null,
      patternId: null,
    });
  }

  return {
    matchRecordId: record.id,
    triggeredRuleIds: [...triggeredRuleIds],
    matchedPatternIds: [...matchedPatternIds],
    observations,
  };
}

export function accumulateVerifiedMatchesForKnowledge(
  records: HistoricalMatchRecord[]
): MarketKnowledgeObservation[] {
  const observations: MarketKnowledgeObservation[] = [];

  for (const record of records) {
    const evaluation = evaluateVerifiedMatchForKnowledge(record);
    observations.push(...evaluation.observations);
  }

  return observations;
}

export { isHit, isPush, resolveOddsRange };
