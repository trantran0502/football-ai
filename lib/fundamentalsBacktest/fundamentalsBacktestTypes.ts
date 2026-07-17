import type { EvidenceReport } from "@/lib/evidence/evidenceTypes";
import type { MatchResult, MatchWinner } from "@/lib/database/matchSchema";
import type { MarketSelection } from "@/types/match";

export type FundamentalsDataMode = "historical_fundamentals" | "live_market_snapshot";

export type FundamentalsValidationStatus = "VALID" | "INVALID";

export interface HistoricalFixtureInput {
  fixtureId: number;
  fixtureDate: string;
  leagueId: number;
  leagueName: string;
  season: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId?: number;
  awayTeamId?: number;
}

export interface HistoricalMatchOutcomeInput {
  fixtureId: number;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId?: number;
  awayTeamId?: number;
  homeGoals: number;
  awayGoals: number;
  xGHome?: number | null;
  xGAway?: number | null;
  shotsHome?: number | null;
  shotsAway?: number | null;
  shotsOnTargetHome?: number | null;
  shotsOnTargetAway?: number | null;
  possessionHome?: number | null;
  possessionAway?: number | null;
}

export interface HistoricalStandingsEntry {
  teamId: number;
  teamName: string;
  position: number;
  points: number;
  played: number;
  snapshotDate: string;
  isFinalSeasonRanking?: boolean;
}

export interface HistoricalH2HInput {
  homeTeam: string;
  awayTeam: string;
  homeWins: number;
  awayWins: number;
  draws: number;
  latestIncludedMatchDate: string;
}

export interface HistoricalSquadAvailabilityInput {
  homeAvailable: number;
  awayAvailable: number;
  homeUnavailable: number;
  awayUnavailable: number;
  snapshotDate: string;
}

export interface HistoricalScheduleContextInput {
  homeDaysSinceLastMatch: number;
  awayDaysSinceLastMatch: number;
  isDerby: boolean;
  matchImportance: string;
  snapshotDate: string;
}

export interface TeamFormSummary {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  latestIncludedMatchDate: string | null;
}

export interface PreMatchSnapshot {
  fixtureId: number;
  fixtureDate: string;
  leagueId: number;
  leagueName: string;
  season: number;
  homeTeam: string;
  awayTeam: string;
  recent10BeforeMatch: { home: TeamFormSummary; away: TeamFormSummary };
  homeFormBeforeMatch: TeamFormSummary;
  awayFormBeforeMatch: TeamFormSummary;
  averageGoalsForBeforeMatch: { home: number; away: number };
  averageGoalsAgainstBeforeMatch: { home: number; away: number };
  xGBeforeMatch: { home: number | null; away: number | null };
  xGABeforeMatch: { home: number | null; away: number | null };
  shotsBeforeMatch: { home: number | null; away: number | null };
  shotsOnTargetBeforeMatch: { home: number | null; away: number | null };
  possessionBeforeMatch: { home: number | null; away: number | null };
  overUnderRateBeforeMatch: { home: number; away: number };
  bttsRateBeforeMatch: { home: number; away: number };
  cleanSheetRateBeforeMatch: { home: number; away: number };
  failedToScoreRateBeforeMatch: { home: number; away: number };
  h2hBeforeMatch: HistoricalH2HInput | null;
  standingsBeforeMatch: HistoricalStandingsEntry[];
  squadAvailabilityBeforeMatch: HistoricalSquadAvailabilityInput | null;
  scheduleContextBeforeMatch: HistoricalScheduleContextInput | null;
  matchImportanceBeforeMatch: string | null;
  actualResult: MatchResult | null;
  storedMarketSnapshot: MarketSelection[] | null;
  sourceTimestamp: string;
  dataMode: FundamentalsDataMode;
}

export interface LeakageValidationMetadata {
  sourceTimestamp: string;
  fixtureDate: string;
  latestIncludedMatchDate: string | null;
  standingsSnapshotDate: string | null;
  squadSnapshotDate: string | null;
  contextSnapshotDate: string | null;
}

export interface LeakageValidationResult {
  leakageDetected: boolean;
  leakageFields: string[];
  validationStatus: FundamentalsValidationStatus;
  validationReason: string | null;
}

export interface FundamentalsPrediction {
  predictedWinner: MatchWinner;
  homeWinDirection: boolean;
  drawDirection: boolean;
  awayWinDirection: boolean;
  homeScoringProbability: number;
  awayScoringProbability: number;
  totalGoalsTrend: "over" | "under" | "neutral";
  overUnderClassification: "over" | "under";
  bttsClassification: "yes" | "no";
  cleanSheetPrediction: "home" | "away" | "neither";
}

export interface HistoricalFundamentalsDatasetEntry {
  snapshot: PreMatchSnapshot;
  providerEvidence: EvidenceReport;
  prediction: FundamentalsPrediction;
  actualResult: MatchResult;
  validationStatus: FundamentalsValidationStatus;
  validationReason: string | null;
  dataMode: FundamentalsDataMode;
  createdAt: string;
}

export interface EvidenceProviderBacktestStats {
  category: string;
  usageCount: number;
  hitCount: number;
  hitRate: number;
  averageConfidence: number;
  confidenceCalibrationGap: number;
}

export interface LeagueBacktestStats {
  leagueName: string;
  sampleSize: number;
  directionAccuracy: number;
  bttsAccuracy: number;
  overUnderAccuracy: number;
}

export interface FundamentalsBacktestReport {
  generatedAt: string;
  dataMode: FundamentalsDataMode;
  totalHistoricalFixtures: number;
  validSnapshots: number;
  invalidSnapshots: number;
  leakageDetectedCount: number;
  directionAccuracy: number;
  bttsAccuracy: number;
  overUnderAccuracy: number;
  homeScoringCalibrationGap: number;
  awayScoringCalibrationGap: number;
  cleanSheetAccuracy: number;
  sampleSize: number;
  missingDataRate: number;
  leagueRanking: LeagueBacktestStats[];
  evidenceProviderRanking: EvidenceProviderBacktestStats[];
  datasetEntries: HistoricalFundamentalsDatasetEntry[];
}

export interface FundamentalsBacktestEngineInput {
  fixtures: HistoricalFixtureInput[];
  matchOutcomes: HistoricalMatchOutcomeInput[];
  standings?: HistoricalStandingsEntry[];
  squadAvailability?: Array<HistoricalSquadAvailabilityInput & { fixtureId: number }>;
  scheduleContext?: Array<HistoricalScheduleContextInput & { fixtureId: number }>;
  storedMarketSnapshots?: Array<{ fixtureId: number; marketSelections: MarketSelection[] }>;
  overUnderLine?: number;
}

export const FUNDAMENTALS_OVER_UNDER_LINE_DEFAULT = 2.5;
