import type { FeatureFusionResult } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import type { FeatureScore } from "@/lib/analysis/featureScore/types";
import type { RecommendationSection } from "@/lib/analysis/types";
import type { HybridCitation } from "@/lib/hybrid/hybridTypes";
import type { BettingIntelligenceResult } from "@/lib/betting/intelligenceTypes";
import type { ReplayDecisionSnapshot } from "@/lib/decision/decisionTypes";
import type { RecommendationValidationEntry } from "@/lib/validation/validationTypes";
import type { BetResult } from "@/lib/backtest/types";
import type { MatchResult } from "@/lib/database/matchSchema";

export type ReplayDataSource =
  | "api"
  | "google"
  | "cache"
  | "mock"
  | "hybrid"
  | "unknown";

export const REPLAY_SNAPSHOT_VERSION = "3" as const;

export interface ReplayMatchInfo {
  matchId: string;
  fixtureId: number | null;
  league: string;
  season: number | null;
  matchTime: string;
  homeTeam: string;
  awayTeam: string;
}

export interface ReplayRawSources {
  apiFootballRaw: unknown | null;
  googleGroundingRaw: unknown | null;
  citations: HybridCitation[];
  cacheSource: ReplayDataSource | null;
}

export type ReplayProviderKey =
  | "recentForm"
  | "leagueStrength"
  | "homeAway"
  | "goalsXg"
  | "scoringPattern"
  | "h2h"
  | "squadAvailability"
  | "matchContext";

export interface ReplayProviderSnapshot {
  key: ReplayProviderKey;
  label: string;
  source: ReplayDataSource;
  fetchedAt: string | null;
  confidence: number | null;
  data: unknown;
  citations: HybridCitation[];
}

export interface ReplayFeatureSnapshot {
  id: string;
  category: string;
  score: number;
  confidence: number;
  weight: number;
  explanation: string;
  source: ReplayDataSource;
  metadata: Record<string, unknown> | null;
}

export interface ReplayRecommendationFeatureView {
  featureId: string;
  label: string;
  score: number;
  role: "supporting" | "opposing" | "neutral";
}

export interface ReplayCandidateSnapshot {
  marketType: string;
  selectionLabel: string;
  confidence: string;
  expectedValue: number;
  score: number;
  reasons: string[];
  warnings: string[];
  supportingFeatures: ReplayRecommendationFeatureView[];
  opposingFeatures: ReplayRecommendationFeatureView[];
}

export interface ReplayRecommendationSnapshot {
  globalPass: boolean;
  passReason: string | null;
  message: string;
  candidates: ReplayCandidateSnapshot[];
}

export interface ReplayValidationSnapshot {
  finalScore: MatchResult | null;
  entries: RecommendationValidationEntry[];
  settlementSummary: {
    wins: number;
    losses: number;
    pushes: number;
    halfWins: number;
    halfLoses: number;
  };
  roi: number;
  hitRate: number;
}

export interface ReplayFeatureRemovalSimulation {
  featureId: string;
  originalOverallScore: number;
  simulatedOverallScore: number;
  delta: number;
}

export interface ReplayMarketMovementPoint {
  timestamp: string;
  source: string;
  odds: number;
  decimalOdds: number;
  movement: string;
  expectedValue: number | null;
}

export interface ReplayMarketSelectionSnapshot {
  marketKey: string;
  label: string;
  marketType: string;
  timeline: ReplayMarketMovementPoint[];
  openingOdds: number | null;
  currentOdds: number | null;
  closingOdds: number | null;
  latestExpectedValue: number | null;
}

export interface ReplayMarketSnapshot {
  selections: ReplayMarketSelectionSnapshot[];
  bettingIntelligence: BettingIntelligenceResult | null;
}

export interface ReplaySnapshot {
  version: typeof REPLAY_SNAPSHOT_VERSION;
  capturedAt: string;
  match: ReplayMatchInfo;
  raw: ReplayRawSources;
  providers: ReplayProviderSnapshot[];
  features: ReplayFeatureSnapshot[];
  fusion: FeatureFusionResult | null;
  recommendation: ReplayRecommendationSnapshot | null;
  marketReplay: ReplayMarketSnapshot | null;
  decisionReplay: ReplayDecisionSnapshot | null;
  validation: ReplayValidationSnapshot | null;
}

export interface ReplayStep<T> {
  step: number;
  key: string;
  title: string;
  data: T;
}

export interface ReplayResponse {
  matchId: string;
  generatedAt: string;
  snapshot: ReplaySnapshot;
  steps: Array<
    | ReplayStep<ReplayRawSources>
    | ReplayStep<ReplayProviderSnapshot[]>
    | ReplayStep<ReplayFeatureSnapshot[]>
    | ReplayStep<FeatureFusionResult | null>
    | ReplayStep<ReplayRecommendationSnapshot | null>
    | ReplayStep<ReplayMarketSnapshot | null>
    | ReplayStep<ReplayDecisionSnapshot | null>
    | ReplayStep<ReplayValidationSnapshot | null>
  >;
  featureRemovalSimulations: ReplayFeatureRemovalSimulation[];
  readOnly: true;
}

export type { FeatureScore, BetResult };
