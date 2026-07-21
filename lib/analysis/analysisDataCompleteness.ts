import type { AnalysisReport } from "@/lib/analysis/types";
import type {
  AnalysisDataCompletenessMetadata,
  AnalysisSnapshot,
  HistoricalMatchRecord,
} from "@/lib/database/matchSchema";
import type { ReplayDataSource, ReplayProviderSnapshot } from "@/lib/replay/replayTypes";
import type { TeamProfile, TeamProfileTeamDiagnostic } from "@/lib/teamProfile/teamProfileTypes";
import type { MatchData } from "@/types/match";

export const MIN_PROFILE_SAMPLE_SIZE = 3;
export const MIN_PROFILE_COMPLETENESS = 40;

export function isGroundingRequiredForRecommendation(): boolean {
  const raw = process.env.REQUIRE_GROUNDING_FOR_RECOMMENDATION?.trim().toLowerCase();
  if (!raw) {
    return false;
  }
  return raw === "true" || raw === "1" || raw === "yes";
}

const TRUSTED_REPLAY_SOURCES = new Set<ReplayDataSource>([
  "api",
  "api-football",
  "google",
  "cache",
  "team-profile",
  "match-records",
  "hybrid",
]);

export interface RecommendationDataCompletenessAssessment {
  eligibleForRecommendation: boolean;
  complete: boolean;
  reasons: string[];
  profileDeferred: boolean;
  profileUnavailableCount: number;
  groundingUnavailable: boolean;
  trustedExternalSourceAvailable: boolean;
  replaySnapshotPresent: boolean;
  homeProfileAvailable: boolean;
  awayProfileAvailable: boolean;
  recentFormAvailable: boolean;
  homeAwayAvailable: boolean;
  goalsMetricsAvailable: boolean;
  quotaWarnings: string[];
}

export interface BuildAnalysisDataCompletenessInput {
  report: AnalysisReport;
  matchId?: string;
  profileDiagnostics?: TeamProfileTeamDiagnostic[];
  replayProviders?: ReplayProviderSnapshot[];
  rawSources?: {
    cacheSource?: ReplayDataSource | null;
    googleGroundingRaw?: unknown;
    apiFootballRaw?: unknown;
    citations?: unknown[];
  };
}

function isProfileUsable(profile: TeamProfile | null | undefined): boolean {
  if (!profile) {
    return false;
  }
  if (profile.source === "incomplete" || profile.source === "refresh_failed") {
    return false;
  }
  if (profile.sampleSize < MIN_PROFILE_SAMPLE_SIZE) {
    return false;
  }
  if (profile.dataCompleteness < MIN_PROFILE_COMPLETENESS) {
    return false;
  }
  return true;
}

function hasRecentFormMetrics(profile: TeamProfile): boolean {
  return (
    profile.recent10AvgGoals !== null &&
    profile.recent10AvgConceded !== null &&
    profile.sampleSize >= MIN_PROFILE_SAMPLE_SIZE
  );
}

function hasHomeAwayMetrics(profile: TeamProfile): boolean {
  return (profile.home5Matches ?? 0) > 0 || (profile.away5Matches ?? 0) > 0;
}

function hasGoalsMetrics(home: TeamProfile, away: TeamProfile): boolean {
  return hasRecentFormMetrics(home) && hasRecentFormMetrics(away);
}

function collectQuotaWarnings(
  diagnostics: TeamProfileTeamDiagnostic[] | undefined,
  reportWarnings: string[] | undefined
): string[] {
  const warnings = [...(reportWarnings ?? [])];
  for (const diagnostic of diagnostics ?? []) {
    if (diagnostic.quotaExhausted) {
      warnings.push(`API quota exhausted for ${diagnostic.teamName}`);
    }
    if (diagnostic.skippedReason === "quota_exhausted") {
      warnings.push(`Team profile deferred for ${diagnostic.teamName}: quota exhausted`);
    }
  }
  return [...new Set(warnings)];
}

function hasTrustedExternalSource(input: BuildAnalysisDataCompletenessInput): boolean {
  const homeSource = input.report.teamProfiles?.home?.source;
  const awaySource = input.report.teamProfiles?.away?.source;
  if (homeSource === "api-football" || awaySource === "api-football") {
    return true;
  }

  if (input.rawSources?.googleGroundingRaw) {
    return true;
  }
  if ((input.rawSources?.citations?.length ?? 0) > 0) {
    return true;
  }
  if (input.rawSources?.apiFootballRaw) {
    return true;
  }

  return (input.replayProviders ?? []).some((provider) =>
    TRUSTED_REPLAY_SOURCES.has(provider.source)
  );
}

function countUnavailableProfiles(report: AnalysisReport): number {
  let count = 0;
  if (!isProfileUsable(report.teamProfiles?.home)) {
    count += 1;
  }
  if (!isProfileUsable(report.teamProfiles?.away)) {
    count += 1;
  }
  return count;
}

export function assessRecommendationDataCompleteness(
  input: BuildAnalysisDataCompletenessInput
): RecommendationDataCompletenessAssessment {
  const home = input.report.teamProfiles?.home ?? null;
  const away = input.report.teamProfiles?.away ?? null;
  const reasons: string[] = [];
  const quotaWarnings = collectQuotaWarnings(
    input.profileDiagnostics ?? input.report.analysisContext?.profileDiagnostics,
    input.report.teamProfiles?.warnings
  );

  const profileDeferred = (
    input.profileDiagnostics ??
    input.report.analysisContext?.profileDiagnostics ??
    []
  ).some(
    (diagnostic) =>
      diagnostic.skippedReason === "quota_exhausted" || diagnostic.quotaExhausted === true
  );
  const homeProfileAvailable = isProfileUsable(home);
  const awayProfileAvailable = isProfileUsable(away);
  const recentFormAvailable =
    home !== null &&
    away !== null &&
    hasRecentFormMetrics(home) &&
    hasRecentFormMetrics(away);
  const homeAwayAvailable =
    home !== null && away !== null && hasHomeAwayMetrics(home) && hasHomeAwayMetrics(away);
  const goalsMetricsAvailable =
    home !== null && away !== null && hasGoalsMetrics(home, away);
  const trustedExternalSourceAvailable = hasTrustedExternalSource(input);
  const replaySnapshotPresent = Boolean(input.matchId);
  const groundingUnavailable =
    !input.rawSources?.googleGroundingRaw &&
    (input.rawSources?.citations?.length ?? 0) === 0 &&
    !(input.replayProviders ?? []).some((provider) =>
      ["google", "cache", "hybrid"].includes(provider.source)
    );

  if (!homeProfileAvailable) {
    reasons.push("home_team_profile_unavailable");
  }
  if (!awayProfileAvailable) {
    reasons.push("away_team_profile_unavailable");
  }
  if (!recentFormAvailable) {
    reasons.push("recent_form_unavailable");
  }
  if (!homeAwayAvailable) {
    reasons.push("home_away_metrics_unavailable");
  }
  if (!goalsMetricsAvailable) {
    reasons.push("goals_metrics_unavailable");
  }
  if (!trustedExternalSourceAvailable) {
    reasons.push("trusted_external_source_missing");
  }
  if (!replaySnapshotPresent) {
    reasons.push("replay_snapshot_missing");
  }
  if (profileDeferred) {
    reasons.push("team_profile_deferred");
  }

  const eligibleForRecommendation = reasons.length === 0;

  return {
    eligibleForRecommendation,
    complete: eligibleForRecommendation,
    reasons,
    profileDeferred,
    profileUnavailableCount: countUnavailableProfiles(input.report),
    groundingUnavailable,
    trustedExternalSourceAvailable,
    replaySnapshotPresent,
    homeProfileAvailable,
    awayProfileAvailable,
    recentFormAvailable,
    homeAwayAvailable,
    goalsMetricsAvailable,
    quotaWarnings,
  };
}

export function buildAnalysisDataCompletenessMetadata(
  assessment: RecommendationDataCompletenessAssessment,
  capturedAt: string = new Date().toISOString()
): AnalysisDataCompletenessMetadata {
  return {
    status: assessment.eligibleForRecommendation ? "complete" : "incomplete",
    eligibleForRecommendation: assessment.eligibleForRecommendation,
    completenessReasons: assessment.reasons,
    profileDeferred: assessment.profileDeferred,
    profileUnavailableCount: assessment.profileUnavailableCount,
    groundingUnavailable: assessment.groundingUnavailable,
    trustedExternalSourceAvailable: assessment.trustedExternalSourceAvailable,
    snapshotPersisted: assessment.replaySnapshotPresent,
    quotaWarnings: assessment.quotaWarnings,
    assessedAt: capturedAt,
  };
}

export function assessSnapshotRecommendationEligibility(
  snapshot: AnalysisSnapshot | null | undefined
): RecommendationDataCompletenessAssessment {
  if (!snapshot) {
    return {
      eligibleForRecommendation: false,
      complete: false,
      reasons: ["analysis_snapshot_missing"],
      profileDeferred: false,
      profileUnavailableCount: 2,
      groundingUnavailable: true,
      trustedExternalSourceAvailable: false,
      replaySnapshotPresent: false,
      homeProfileAvailable: false,
      awayProfileAvailable: false,
      recentFormAvailable: false,
      homeAwayAvailable: false,
      goalsMetricsAvailable: false,
      quotaWarnings: [],
    };
  }

  if (snapshot.dataCompleteness?.eligibleForRecommendation !== undefined) {
    return {
      eligibleForRecommendation: snapshot.dataCompleteness.eligibleForRecommendation !== false,
      complete: snapshot.dataCompleteness.eligibleForRecommendation !== false,
      reasons: snapshot.dataCompleteness.completenessReasons ?? [],
      profileDeferred: snapshot.dataCompleteness.profileDeferred ?? false,
      profileUnavailableCount: snapshot.dataCompleteness.profileUnavailableCount ?? 0,
      groundingUnavailable: snapshot.dataCompleteness.groundingUnavailable ?? true,
      trustedExternalSourceAvailable:
        snapshot.dataCompleteness.trustedExternalSourceAvailable ?? false,
      replaySnapshotPresent: Boolean(snapshot.replay),
      homeProfileAvailable: isProfileUsable(snapshot.teamProfiles?.home),
      awayProfileAvailable: isProfileUsable(snapshot.teamProfiles?.away),
      recentFormAvailable:
        snapshot.teamProfiles?.home !== undefined &&
        snapshot.teamProfiles?.home !== null &&
        snapshot.teamProfiles?.away !== undefined &&
        snapshot.teamProfiles?.away !== null &&
        hasRecentFormMetrics(snapshot.teamProfiles.home) &&
        hasRecentFormMetrics(snapshot.teamProfiles.away),
      homeAwayAvailable:
        snapshot.teamProfiles?.home !== undefined &&
        snapshot.teamProfiles?.home !== null &&
        snapshot.teamProfiles?.away !== undefined &&
        snapshot.teamProfiles?.away !== null &&
        hasHomeAwayMetrics(snapshot.teamProfiles.home) &&
        hasHomeAwayMetrics(snapshot.teamProfiles.away),
      goalsMetricsAvailable:
        snapshot.teamProfiles?.home !== undefined &&
        snapshot.teamProfiles?.home !== null &&
        snapshot.teamProfiles?.away !== undefined &&
        snapshot.teamProfiles?.away !== null &&
        hasGoalsMetrics(snapshot.teamProfiles.home, snapshot.teamProfiles.away),
      quotaWarnings: snapshot.dataCompleteness.quotaWarnings ?? [],
    };
  }

  return assessRecommendationDataCompleteness({
    report: {
      match: {
        homeTeam: snapshot.replay?.match.homeTeam ?? "",
        awayTeam: snapshot.replay?.match.awayTeam ?? "",
        league: snapshot.replay?.match.league ?? "",
        marketSelections: [],
        selections: [],
        unknownMarkets: [],
        moneyline: [],
        handicap: [],
        overUnder: [],
        btts: [],
        oddEven: [],
        otherMarkets: [],
      },
      markets: [],
      interpretations: [],
      crossMarketValidation: {
        status: "INSUFFICIENT",
        availableMarkets: 0,
        executedRules: 0,
        skippedRules: 0,
        coverageLabel: "legacy",
        moneylineHandicap: { status: "notImplemented", reason: "legacy" },
        handicapTotalGoals: { status: "notImplemented", reason: "legacy" },
        totalGoalsBtts: { status: "notImplemented", reason: "legacy" },
      },
      candidates: [],
      betaRecommendation: { enabled: false, message: "" },
      recommendation: snapshot.recommendation ?? {
        enabled: false,
        message: "",
      },
      bettingIntelligence: snapshot.bettingIntelligence,
      decision: snapshot.decision,
      teamProfiles: snapshot.teamProfiles ?? null,
    } as unknown as AnalysisReport,
    matchId: snapshot.replay?.match.matchId,
    replayProviders: snapshot.replay?.providers,
    rawSources: snapshot.replay?.raw,
  });
}

export function isEligibleForDailyRecommendation(record: HistoricalMatchRecord): boolean {
  if (record.analysisSnapshot?.pendingPolicy?.excluded) {
    return false;
  }
  return assessSnapshotRecommendationEligibility(record.analysisSnapshot)
    .eligibleForRecommendation;
}

export type ExtendedIncompleteAnalysisReason =
  | "oddsMissing"
  | "settleableMarketMissing"
  | "analysisSnapshotMissing"
  | "dataCompletenessInsufficient"
  | "profileDeferred"
  | "profileUnavailable"
  | "groundingUnavailable";

export function mapCompletenessToIncompleteReason(
  assessment: RecommendationDataCompletenessAssessment
): ExtendedIncompleteAnalysisReason {
  if (assessment.profileDeferred) {
    return "profileDeferred";
  }
  if (assessment.profileUnavailableCount > 0) {
    return "profileUnavailable";
  }
  return "dataCompletenessInsufficient";
}
