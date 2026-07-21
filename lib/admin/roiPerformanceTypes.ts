export type RoiExclusionReason =
  | "no_recommendation"
  | "missing_odds"
  | "invalid_odds"
  | "unsettled_market"
  | "push"
  | "void"
  | "missing_result"
  | "legacy_incomplete_record";

export type RoiVerificationResult =
  | "WIN"
  | "LOSE"
  | "PUSH"
  | "VOID"
  | "HALF_WIN"
  | "HALF_LOSE";

export interface RoiPerformanceFilters {
  fromDate?: string;
  toDate?: string;
  market?: string;
  league?: string;
  verificationResult?: RoiVerificationResult | "all";
  weightVersion?: string;
  onlyRoiEligible?: boolean;
  page?: number;
  pageSize?: number;
}

export interface RoiPerformanceSummary {
  verifiedCount: number;
  roiEligibleCount: number;
  winCount: number;
  lossCount: number;
  pushCount: number;
  voidCount: number;
  halfWinCount: number;
  halfLossCount: number;
  hitRate: number | null;
  totalProfit: number;
  cumulativeRoi: number | null;
  averageOdds: number | null;
  todayRoi: number | null;
  last7DaysRoi: number | null;
  last30DaysRoi: number | null;
}

export interface RoiBreakdownRow {
  key: string;
  label: string;
  sampleSize: number;
  wins: number;
  losses: number;
  hitRate: number | null;
  totalProfit: number;
  roi: number | null;
}

export interface RoiPerformanceBreakdowns {
  byMarket: RoiBreakdownRow[];
  byLeague: RoiBreakdownRow[];
  byGrade: RoiBreakdownRow[];
  byWeightVersion: RoiBreakdownRow[];
}

export interface RoiPerformanceRecord {
  matchId: string;
  matchDate: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  fixtureId: number | null;
  market: string;
  selection: string;
  odds: number | null;
  finalScore: string | null;
  verificationResult: RoiVerificationResult;
  profit: number | null;
  roi: number | null;
  recommendationGrade: string;
  weightVersion: string;
  roiEligible: boolean;
  exclusionReason: RoiExclusionReason | null;
}

export interface RoiExcludedReasonCounts {
  no_recommendation: number;
  missing_odds: number;
  invalid_odds: number;
  unsettled_market: number;
  push: number;
  void: number;
  missing_result: number;
  legacy_incomplete_record: number;
}

export interface RoiPerformancePagination {
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
}

export interface RoiPerformanceFilterOptions {
  markets: string[];
  leagues: string[];
  weightVersions: string[];
  verificationResults: RoiVerificationResult[];
}

export interface RoiPerformanceResponse {
  generatedAt: string;
  filters: Required<
    Pick<RoiPerformanceFilters, "fromDate" | "toDate" | "onlyRoiEligible" | "page" | "pageSize">
  > & {
    market: string | null;
    league: string | null;
    verificationResult: RoiVerificationResult | "all" | null;
    weightVersion: string | null;
  };
  summary: RoiPerformanceSummary;
  breakdowns: RoiPerformanceBreakdowns;
  records: RoiPerformanceRecord[];
  excludedReasonCounts: RoiExcludedReasonCounts;
  pagination: RoiPerformancePagination;
  filterOptions: RoiPerformanceFilterOptions;
}
