import type {
  AnalysisCandidate,
  CrossMarketValidation,
} from "@/lib/analysis/types";
import type { MatchWinner } from "@/lib/database/matchSchema";

/** 單場比賽最終賽果（人工標註）。 */
export interface GoldenMatchResult {
  fullTimeHomeGoals: number;
  fullTimeAwayGoals: number;
  halfTimeHomeGoals: number;
  halfTimeAwayGoals: number;
  winner: MatchWinner;
  totalGoals: number;
  bothTeamsScored: boolean;
}

/** Parser 預期輸出快照（normalize 後 marketSelections）。 */
export interface GoldenMarketSnapshot {
  marketType: string;
  marketFamily: string;
  title: string;
  period: string;
  side: string;
  rawLine: string | null;
  line: number | null;
  modifier: string | null;
  odds: number;
  handicap: number | null;
  label: string | null;
  impliedProbability: number | null;
}

export interface GoldenExpectedParser {
  league: string;
  homeTeam: string;
  awayTeam: string;
  marketCount: number;
  unknownMarketCount: number;
  markets: GoldenMarketSnapshot[];
}

export interface GoldenInterpretationSnapshot {
  kind: string;
  marketId: string;
  marketType: string;
  title: string;
  period: string;
}

/** Analysis 預期輸出快照。 */
export interface GoldenExpectedAnalysis {
  interpretationCount: number;
  interpretations: GoldenInterpretationSnapshot[];
  crossMarketValidation: CrossMarketValidation;
}

export type GoldenExpectedCandidates = AnalysisCandidate[];

/**
 * 完整 Golden Match（matches + expected 合併後的執行單位）。
 */
export interface GoldenMatch {
  id: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  rawOdds: string;
  expectedParser: GoldenExpectedParser;
  expectedAnalysis: GoldenExpectedAnalysis;
  expectedCandidates: GoldenExpectedCandidates;
  actualResult: GoldenMatchResult;
}

/** goldenMatches.json 單筆輸入。 */
export interface GoldenMatchInput {
  id: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  rawOdds: string;
  actualResult: GoldenMatchResult;
}

/** goldenExpected.json 單筆預期。 */
export interface GoldenMatchExpectation {
  expectedParser: GoldenExpectedParser;
  expectedAnalysis: GoldenExpectedAnalysis;
  expectedCandidates: GoldenExpectedCandidates;
}

export interface GoldenDiff {
  path: string;
  expected: unknown;
  actual: unknown;
}

export type GoldenStageStatus = "PASS" | "FAIL";

export interface GoldenStageResult {
  status: GoldenStageStatus;
  diffs: GoldenDiff[];
}

export interface GoldenMatchRunResult {
  id: string;
  homeTeam: string;
  awayTeam: string;
  status: GoldenStageStatus;
  parser: GoldenStageResult;
  analysis: GoldenStageResult;
  candidates: GoldenStageResult;
}

export interface GoldenReport {
  totalMatches: number;
  parserPassed: number;
  parserFailed: number;
  parserAccuracy: number;
  analysisPassed: number;
  analysisFailed: number;
  analysisAccuracy: number;
  candidatePassed: number;
  candidateFailed: number;
  candidateAccuracy: number;
  allPassed: boolean;
  results: GoldenMatchRunResult[];
}
