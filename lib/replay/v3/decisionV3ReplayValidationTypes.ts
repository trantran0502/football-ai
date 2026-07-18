import type { BetResult } from "@/lib/backtest/types";
import type { DecisionOutcome, DecisionV3Level, DecisionV3Confidence } from "@/lib/decision/v3/decisionTypes";
import type { HistoricalMatchId } from "@/lib/database/matchSchema";
import type { RecommendationComparison } from "@/lib/recommendation/v3/recommendationComparisonTypes";
import type { RecommendationEngineResult } from "@/lib/recommendation/recommendationTypes";
import type { MarketType } from "@/types/match";

export const DECISION_V3_REPLAY_VALIDATION_SCHEMA = "decision-v3-replay-validation-v1" as const;

export type DecisionV3ReplayValidationVerdict =
  | "INSUFFICIENT_DATA"
  | "PRELIMINARY"
  | "DECISION_CANDIDATE"
  | "LEGACY_REMAINS_PRIMARY";

export type DecisionV3ReplayExclusionReason =
  | "NOT_VERIFIED"
  | "NO_RESULT"
  | "VOID_OR_CANCELLED"
  | "RAW_ODDS_UNPARSEABLE"
  | "NO_SETTLEABLE_MARKET"
  | "MISSING_SETTLEMENT"
  | "LEGACY_UNAVAILABLE"
  | "DECISION_COMPUTE_FAILED"
  | "EVIDENCE_CAPTURED_AFTER_KICKOFF"
  | "LEAKAGE_VIOLATION"
  | "CANNOT_PROVE_PRE_KICKOFF"
  | "MOCK_DATA_EXCLUDED";

export interface DecisionV3ReplayValidationOptions {
  includeMockFixtures?: boolean;
  flatStake?: number;
  assumedKickoffHourUtc?: number;
}

export interface DecisionV3ReplayBetSettlement {
  betResult: BetResult | "PASS";
  profit: number;
  odds: number | null;
  stake: number;
  marketType: MarketType | null;
}

export interface DecisionV3ReplayMatchResult {
  matchId: HistoricalMatchId;
  fixtureKey: string;
  league: string;
  matchDate: string;
  legacyRecommendation: RecommendationEngineResult | null;
  decisionOutcome: DecisionOutcome;
  comparison: RecommendationComparison;
  legacySettlement: DecisionV3ReplayBetSettlement;
  decisionSettlement: DecisionV3ReplayBetSettlement;
  evidenceCollectedCount: number;
  evidenceMissingCount: number;
  providerConfidence: number | null;
  runtimeWeightSource: string;
  dataSource: "production" | "mock" | "unknown";
}

export interface DecisionV3ReplayPerformanceMetrics {
  bets: number;
  passes: number;
  wins: number;
  halfWins: number;
  pushes: number;
  halfLosses: number;
  losses: number;
  hitRate: number;
  roi: number;
  netUnits: number;
  averageOdds: number;
  maxDrawdown: number;
}

export interface DecisionV3ReplayAgreementMetrics {
  directionAgreementRate: number;
  marketAgreementRate: number;
  confidenceAgreementRate: number;
  candidateChangedRate: number;
  overallAgreementRate: number;
  legacyOnlyBetCount: number;
  decisionOnlyBetCount: number;
  bothBetCount: number;
  bothPassCount: number;
}

export interface DecisionV3ReplayHeadToHeadMetrics {
  bothBetLegacyWonDecisionLost: number;
  bothBetDecisionWonLegacyLost: number;
  bothWon: number;
  bothLost: number;
  scoreDiffDistribution: Record<string, number>;
}

export interface DecisionV3ReplayGroupedMetrics {
  sampleSize: number;
  hitRate: number;
  roi: number;
  netUnits: number;
  status: "ok" | "insufficient_sample";
}

export interface DecisionV3ReplayLeakageAudit {
  checked: number;
  passed: number;
  excluded: number;
  violationsByReason: Partial<Record<DecisionV3ReplayExclusionReason, number>>;
}

export interface DecisionV3ReplayDatasetSummary {
  totalRecords: number;
  eligibleRecords: number;
  excludedRecords: number;
  exclusionReasons: Partial<Record<DecisionV3ReplayExclusionReason, number>>;
}

export interface DecisionV3ReplayValidationReport {
  schemaVersion: typeof DECISION_V3_REPLAY_VALIDATION_SCHEMA;
  generatedAt: string;
  dataset: DecisionV3ReplayDatasetSummary;
  legacy: DecisionV3ReplayPerformanceMetrics;
  decisionV3: DecisionV3ReplayPerformanceMetrics;
  agreement: DecisionV3ReplayAgreementMetrics;
  headToHead: DecisionV3ReplayHeadToHeadMetrics;
  grouped: {
    byMarketType: Record<string, DecisionV3ReplayGroupedMetrics>;
    byLeague: Record<string, DecisionV3ReplayGroupedMetrics>;
    byDecisionLevel: Record<DecisionV3Level | "pass", DecisionV3ReplayGroupedMetrics>;
    byConfidence: Record<DecisionV3Confidence | "pass", DecisionV3ReplayGroupedMetrics>;
    byEvidenceCompleteness: Record<string, DecisionV3ReplayGroupedMetrics>;
    byProviderConfidence: Record<string, DecisionV3ReplayGroupedMetrics>;
    byRuntimeWeightSource: Record<string, DecisionV3ReplayGroupedMetrics>;
    byDataSource: Record<string, DecisionV3ReplayGroupedMetrics>;
  };
  leakageAudit: DecisionV3ReplayLeakageAudit;
  verdict: DecisionV3ReplayValidationVerdict;
  verdictNotes: string[];
  options: Required<DecisionV3ReplayValidationOptions>;
}

export interface DecisionV3ReplayValidationRunResult {
  report: DecisionV3ReplayValidationReport;
  matchResults: DecisionV3ReplayMatchResult[];
}
