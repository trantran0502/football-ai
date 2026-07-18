import { buildAnalysisFeatures } from "@/lib/analysis/featureBuilder";
import { NO_RULE_IMPLEMENTED } from "@/lib/analysis/constants";
import type {
  AnalysisCandidate,
  AnalysisEngineResult,
  AnalysisFeature,
  AnalysisReport,
  CombinedAnalysis,
  MarketAnalysis,
  MarketInterpretation,
  RecommendationSection,
} from "@/lib/analysis/types";
import type { BacktestEngineResult } from "@/lib/backtest/types";
import type { RuleValidationReport } from "@/lib/rules/validation/types";
import type { RecommendationValidationResult } from "@/lib/validation/validationTypes";
import type { ReplaySnapshot } from "@/lib/replay/replayTypes";
import type { MatchTeamProfilesSnapshot } from "@/lib/teamProfile/teamProfileTypes";
import type { BettingIntelligenceResult } from "@/lib/betting/intelligenceTypes";
import type { DecisionResult } from "@/lib/decision/decisionTypes";
import type { WeightConfigSnapshotMetadata } from "@/lib/recommendation/weightConfigTypes";
import { buildReplaySnapshotFromReport } from "@/lib/replay/replayBuilder";
import type { MarketSelection } from "@/types/match";
import { countTrulyPendingVerification } from "@/lib/supabase/services/matchRecordPendingPolicy";

/** 歷史比賽唯一識別 */
export type HistoricalMatchId = string;

/** 比賽紀錄狀態 */
export type MatchStatus = "PENDING" | "VERIFIED" | "FAILED" | "CANCELLED";

/** 比賽勝者 */
export type MatchWinner = "home" | "away" | "draw";

/**
 * 完整 Analysis Engine 輸出快照。
 * 保存所有分析欄位，供未來回測使用。
 */
export interface AnalysisDataCompletenessMetadata {
  analysisEnriched?: boolean;
  analysisEnrichedAt?: string;
  enrichedFrom?: string;
}

export interface AnalysisPendingPolicyMetadata {
  excluded: true;
  reason: string;
  excludedAt: string;
  source: string;
}

export interface AnalysisSnapshot {
  features: AnalysisFeature[];
  interpretations: MarketInterpretation[];
  marketAnalysis: MarketAnalysis;
  combinedAnalysis: CombinedAnalysis;
  candidates: AnalysisCandidate[];
  recommendation: RecommendationSection | null;
  replay: ReplaySnapshot | null;
  bettingIntelligence: BettingIntelligenceResult | null;
  decision: DecisionResult | null;
  teamProfiles?: MatchTeamProfilesSnapshot | null;
  weightConfig?: WeightConfigSnapshotMetadata | null;
  dataCompleteness?: AnalysisDataCompletenessMetadata;
  pendingPolicy?: AnalysisPendingPolicyMetadata;
  capturedAt: string;
}

/** 比賽賽果 */
export interface MatchResult {
  fullTimeHomeGoals: number;
  fullTimeAwayGoals: number;
  halfTimeHomeGoals: number;
  halfTimeAwayGoals: number;
  winner: MatchWinner;
  totalGoals: number;
  bothTeamsScored: boolean;
}

/**
 * 歷史比賽完整紀錄。
 * Schema 設計為可移植，未來可直接對接 SQLite / Prisma / Supabase。
 */
export interface MatchVerificationResult {
  verifiedAt: string;
  backtest: BacktestEngineResult;
  ruleValidation: RuleValidationReport;
  recommendationValidation: RecommendationValidationResult;
}

export interface HistoricalMatchRecord {
  id: HistoricalMatchId;
  /** @deprecated 使用 matchDate */
  date: string;
  matchDate: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  rawOdds: string;
  marketSelections: MarketSelection[];
  result: MatchResult | null;
  analysisSnapshot: AnalysisSnapshot | null;
  candidates: AnalysisCandidate[];
  status: MatchStatus;
  verificationResult: MatchVerificationResult | null;
  fixtureId?: number | null;
  leagueId?: number | null;
  season?: number | null;
  homeTeamId?: number | null;
  awayTeamId?: number | null;
  createdAt: string;
  updatedAt: string;
  source?: string;
}

export interface MatchHistoryStats {
  total: number;
  pending: number;
  verified: number;
  failed: number;
  cancelled: number;
}

/** 建立歷史比賽時的輸入 */
export interface SaveMatchInput {
  id?: HistoricalMatchId;
  date: string;
  matchDate?: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  rawOdds: string;
  marketSelections: MarketSelection[];
  analysis?: AnalysisEngineResult | AnalysisSnapshot | AnalysisReport | null;
  candidates?: AnalysisCandidate[];
  status?: MatchStatus;
  fixtureId?: number | null;
  leagueId?: number | null;
  season?: number | null;
  homeTeamId?: number | null;
  awayTeamId?: number | null;
}

export type SaveMatchOutcome =
  | { status: "created"; record: HistoricalMatchRecord }
  | { status: "duplicate"; record: HistoricalMatchRecord }
  | { status: "enriched"; record: HistoricalMatchRecord }
  | {
      status: "incomplete_analysis_rejected";
      record: HistoricalMatchRecord | null;
      reason: "oddsMissing" | "settleableMarketMissing" | "analysisSnapshotMissing";
    }
  | {
      status: "conflicting_record";
      record: HistoricalMatchRecord;
      reason: string;
    };

/** 更新賽果時的輸入（進球數為原始資料，其餘欄位由 repository 衍生） */
export interface UpdateMatchResultInput {
  fullTimeHomeGoals: number;
  fullTimeAwayGoals: number;
  halfTimeHomeGoals: number;
  halfTimeAwayGoals: number;
}

export function createAnalysisSnapshot(
  analysis: AnalysisEngineResult,
  capturedAt: string = new Date().toISOString()
): AnalysisSnapshot {
  return {
    features: analysis.features,
    interpretations: analysis.interpretations,
    marketAnalysis: analysis.marketAnalysis,
    combinedAnalysis: analysis.combinedAnalysis,
    candidates: analysis.candidates,
    recommendation: null,
    replay: null,
    bettingIntelligence: null,
    decision: null,
    capturedAt,
  };
}

export function createAnalysisSnapshotFromReport(
  report: AnalysisReport,
  capturedAt: string = new Date().toISOString(),
  matchId?: string,
  matchDate?: string
): AnalysisSnapshot {
  const base: AnalysisSnapshot = {
    features: buildAnalysisFeatures(report.markets),
    interpretations: report.interpretations,
    marketAnalysis: {
      status: "notImplemented",
      reason: NO_RULE_IMPLEMENTED,
    },
    combinedAnalysis: {
      status: "notImplemented",
      reason: NO_RULE_IMPLEMENTED,
    },
    candidates: report.candidates,
    recommendation: report.recommendation,
    replay: null,
    bettingIntelligence: report.bettingIntelligence ?? null,
    decision: report.decision ?? null,
    teamProfiles: report.teamProfiles ?? null,
    weightConfig: report.weightConfig ?? report.recommendation?.result?.weightConfig ?? null,
    capturedAt,
  };

  if (!matchId) {
    return base;
  }

  return {
    ...base,
    replay: buildReplaySnapshotFromReport(report, {
      matchId,
      capturedAt,
      matchDate,
    }),
  };
}

export function normalizeHistoricalMatchRecord(
  record: HistoricalMatchRecord
): HistoricalMatchRecord {
  const matchDate = record.matchDate ?? record.date;
  return {
    ...record,
    date: matchDate,
    matchDate,
    rawOdds: record.rawOdds ?? "",
    candidates:
      record.candidates ?? record.analysisSnapshot?.candidates ?? [],
    analysisSnapshot: record.analysisSnapshot
      ? {
          ...record.analysisSnapshot,
          recommendation: record.analysisSnapshot.recommendation ?? null,
          replay: record.analysisSnapshot.replay ?? null,
          bettingIntelligence: record.analysisSnapshot.bettingIntelligence ?? null,
          decision: record.analysisSnapshot.decision ?? null,
        }
      : null,
    status: record.status ?? (record.result ? "VERIFIED" : "PENDING"),
    verificationResult: record.verificationResult ?? null,
  };
}

export function buildMatchHistoryStats(
  records: HistoricalMatchRecord[]
): MatchHistoryStats {
  const stats: MatchHistoryStats = {
    total: records.length,
    pending: countTrulyPendingVerification(records),
    verified: 0,
    failed: 0,
    cancelled: 0,
  };

  for (const record of records) {
    switch (record.status) {
      case "VERIFIED":
        stats.verified += 1;
        break;
      case "FAILED":
        stats.failed += 1;
        break;
      case "CANCELLED":
        stats.cancelled += 1;
        break;
    }
  }

  return stats;
}

export function isAnalysisSnapshot(
  value: AnalysisEngineResult | AnalysisSnapshot
): value is AnalysisSnapshot {
  return "capturedAt" in value;
}

export function resolveWinner(
  fullTimeHomeGoals: number,
  fullTimeAwayGoals: number
): MatchWinner {
  if (fullTimeHomeGoals > fullTimeAwayGoals) {
    return "home";
  }
  if (fullTimeHomeGoals < fullTimeAwayGoals) {
    return "away";
  }
  return "draw";
}

export function buildMatchResult(input: UpdateMatchResultInput): MatchResult {
  const totalGoals = input.fullTimeHomeGoals + input.fullTimeAwayGoals;

  return {
    fullTimeHomeGoals: input.fullTimeHomeGoals,
    fullTimeAwayGoals: input.fullTimeAwayGoals,
    halfTimeHomeGoals: input.halfTimeHomeGoals,
    halfTimeAwayGoals: input.halfTimeAwayGoals,
    winner: resolveWinner(input.fullTimeHomeGoals, input.fullTimeAwayGoals),
    totalGoals,
    bothTeamsScored: input.fullTimeHomeGoals > 0 && input.fullTimeAwayGoals > 0,
  };
}

export function generateHistoricalMatchId(): HistoricalMatchId {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
