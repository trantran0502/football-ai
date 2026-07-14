import type { FeatureFusionResult } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import type {
  MarketPeriod,
  MarketSelection,
  MarketSide,
  MarketType,
} from "@/types/match";
import type { SingleOddsFormat } from "@/lib/analysis/featureScore/oddsConversion";

/** Extensible bookmaker identifier — not limited to known brands. */
export type BookmakerId = string;

export const SUPPORTED_BOOKMAKER_IDS = [
  "pinnacle",
  "bet365",
  "188bet",
  "sbobet",
  "1xbet",
] as const;

export type KnownBookmakerId = (typeof SUPPORTED_BOOKMAKER_IDS)[number];

export type OddsMovementDirection = "up" | "down" | "stable" | "unknown";

export type ValueRating = "none" | "low" | "medium" | "high" | "strong";

export type MarketConsensusStatus =
  | "aligned"
  | "divergent"
  | "insufficient"
  | "anomaly";

export type MarketAnomalyFlag =
  | "trap_suspected"
  | "overheated"
  | "cold_longshot"
  | "steam_move"
  | "reverse_line_movement"
  | "none";

export interface OddsHistoryPoint {
  timestamp: string;
  source: BookmakerId | "opening" | "current" | "closing" | "unknown";
  odds: number;
  decimalOdds: number;
  impliedProbability: number | null;
  movement: OddsMovementDirection;
}

export interface OddsHistoryTimeline {
  marketKey: string;
  marketType: MarketType;
  period: MarketPeriod;
  side: MarketSide;
  title: string;
  line: number | null;
  points: OddsHistoryPoint[];
}

export interface OddsHistoryInput {
  timelines: OddsHistoryTimeline[];
  capturedAt?: string;
}

export interface BookmakerSelectionQuote {
  bookmakerId: BookmakerId;
  odds: number;
  decimalOdds: number;
  impliedProbability: number;
  format: SingleOddsFormat;
  timestamp: string;
}

export interface BookmakerMarketQuotes {
  marketKey: string;
  selections: BookmakerSelectionQuote[];
}

export interface MultiBookmakerInput {
  markets: BookmakerMarketQuotes[];
}

export interface MarketOddsSnapshot {
  rawOdds: number;
  decimalOdds: number;
  impliedProbability: number;
  format: SingleOddsFormat;
}

export interface LineMovementAnalysis {
  direction: OddsMovementDirection;
  openingLine: number | null;
  currentLine: number | null;
  closingLine: number | null;
  lineDelta: number | null;
  priceDelta: number | null;
  movementCount: number;
}

export interface OverroundAnalysis {
  marketKey: string;
  impliedSum: number;
  overround: number;
  marginPercent: number;
  fairProbabilities: Record<string, number>;
}

export interface ValueBetMetrics {
  expectedValue: number;
  expectedValuePercent: number;
  fairOdds: number;
  edge: number;
  valueRating: ValueRating;
  confidence: number;
  kellyFraction: number;
  closingLineValue: number | null;
}

export interface SteamMoveAnalysis {
  detected: boolean;
  direction: OddsMovementDirection;
  magnitude: number;
  affectedSelections: string[];
  explanation: string;
}

export interface ReverseLineMovementAnalysis {
  detected: boolean;
  lineDirection: OddsMovementDirection;
  priceDirection: OddsMovementDirection;
  explanation: string;
}

export interface MarketConsensusAnalysis {
  status: MarketConsensusStatus;
  spread: number;
  averageImpliedProbability: number;
  minBookmaker: BookmakerId | null;
  maxBookmaker: BookmakerId | null;
  anomalyFlags: MarketAnomalyFlag[];
  explanation: string;
}

export interface SelectionIntelligence {
  marketKey: string;
  marketType: MarketType;
  period: MarketPeriod;
  side: MarketSide;
  title: string;
  label: string | null;
  line: number | null;
  opening: MarketOddsSnapshot | null;
  current: MarketOddsSnapshot | null;
  closing: MarketOddsSnapshot | null;
  lineMovement: LineMovementAnalysis;
  historyTimeline: OddsHistoryPoint[];
  overround: OverroundAnalysis | null;
  valueBet: ValueBetMetrics | null;
  bookmakerQuotes: BookmakerSelectionQuote[];
  consensus: MarketConsensusAnalysis | null;
}

export interface MarketTypeIntelligence {
  marketType: MarketType;
  label: string;
  selectionCount: number;
  averageOverround: number | null;
  bestValueSelection: string | null;
  selections: SelectionIntelligence[];
}

export type BettingIntelligenceSignalId =
  | "market_strength"
  | "market_stability"
  | "steam_signal"
  | "value_signal"
  | "consensus_signal"
  | "line_movement"
  | "price_movement"
  | "clv_projection"
  | "kelly_signal";

export interface BettingIntelligenceSignal {
  id: BettingIntelligenceSignalId;
  score: number;
  confidence: number;
  weight: number;
  explanation: string;
}

export interface BettingIntelligenceSummary {
  totalSelections: number;
  valueBetCount: number;
  averageExpectedValue: number;
  averageClosingLineValue: number | null;
  bestMarketType: MarketType | null;
  bestBookmaker: BookmakerId | null;
  consensusAlignedCount: number;
  consensusDivergentCount: number;
  steamMoveCount: number;
  reverseLineMovementCount: number;
}

export interface BettingIntelligenceResult {
  generatedAt: string;
  marketTypes: MarketTypeIntelligence[];
  selections: SelectionIntelligence[];
  signals: BettingIntelligenceSignal[];
  steamMove: SteamMoveAnalysis;
  reverseLineMovement: ReverseLineMovementAnalysis;
  summary: BettingIntelligenceSummary;
  fusionReference: Pick<
    FeatureFusionResult,
    "overallScore" | "overallConfidence"
  > | null;
}

export interface BuildBettingIntelligenceInput {
  marketSelections: MarketSelection[];
  oddsHistory?: OddsHistoryInput | null;
  multiBookmaker?: MultiBookmakerInput | null;
  fusion?: FeatureFusionResult | null;
  capturedAt?: string;
}

export type { MarketSelection, FeatureFusionResult };
