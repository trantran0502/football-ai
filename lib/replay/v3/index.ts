export {
  evaluateDecisionV3ReplayEligibility,
  hasSettleableMarket,
  isMockValidationRecord,
  isRawOddsParseable,
  resolveEvidenceCapturedAt,
  resolveFixtureKickoffIso,
} from "@/lib/replay/v3/decisionV3ReplayValidationEligibility";
export {
  auditEvidenceLeakage,
  createEmptyLeakageAudit,
  incrementLeakageViolation,
} from "@/lib/replay/v3/decisionV3ReplayValidationLeakage";
export {
  buildAgreementMetrics,
  buildGroupedReport,
  buildHeadToHeadMetrics,
  buildPerformanceMetrics,
  resolveValidationVerdict,
} from "@/lib/replay/v3/decisionV3ReplayValidationMetrics";
export {
  assertReplayValidationRecordIdsUnique,
  assertReplayValidationSupabaseEnv,
  buildReplayValidationLoadSummary,
  countVerifiedRecords,
  formatReplayValidationConfigurationError,
  formatReplayValidationLoadError,
  formatReplayValidationLoadSummary,
  getReplayValidationSupabaseEnvStatus,
  loadHistoricalMatchRecordsForReplayValidation,
  loadNextEnvForReplayValidation,
  REPLAY_VALIDATION_PAGE_MAX_ATTEMPTS,
  REPLAY_VALIDATION_PAGE_RETRY_BACKOFF_MS,
  REPLAY_VALIDATION_PAGE_SIZE,
  ReplayValidationConfigurationError,
  ReplayValidationLoadError,
} from "@/lib/replay/v3/decisionV3ReplayValidationLoader";
export type {
  ReplayValidationLoadErrorDetails,
  ReplayValidationLoadSummary,
  ReplayValidationLoaderDependencies,
  ReplayValidationPageFetchInput,
  ReplayValidationPageLoadFailureDetails,
  ReplayValidationPageLoadSummary,
  ReplayValidationSupabaseEnvStatus,
} from "@/lib/replay/v3/decisionV3ReplayValidationLoader";
export {
  buildDecisionV3ReplayValidationMarkdown,
  sanitizeDecisionV3ReplayValidationReportForArtifact,
} from "@/lib/replay/v3/decisionV3ReplayValidationReport";
export {
  buildEvidenceCollectorContext,
  rebuildDecisionV3,
  rebuildLegacyRecommendation,
  resolveFixtureKey,
  resolveProviderConfidence,
  resolveValidationDataSource,
} from "@/lib/replay/v3/decisionV3ReplayValidationRebuild";
export {
  runDecisionV3ReplayValidation,
  stampDecisionV3ReplayValidationReport,
} from "@/lib/replay/v3/decisionV3ReplayValidationRunner";
export {
  computeMaxDrawdown,
  settleDecisionOutcome,
  settleLegacyRecommendation,
  isBetSettlement,
  isWinningBetResult,
  DECISION_V3_REPLAY_DEFAULT_STAKE,
} from "@/lib/replay/v3/decisionV3ReplayValidationSettlement";
export {
  DECISION_V3_REPLAY_VALIDATION_SCHEMA,
} from "@/lib/replay/v3/decisionV3ReplayValidationTypes";
export type {
  DecisionV3ReplayValidationReport,
  DecisionV3ReplayValidationRunResult,
  DecisionV3ReplayValidationOptions,
  DecisionV3ReplayValidationVerdict,
  DecisionV3ReplayExclusionReason,
  DecisionV3ReplayMatchResult,
  DecisionV3ReplayPerformanceMetrics,
  DecisionV3ReplayAgreementMetrics,
  DecisionV3ReplayHeadToHeadMetrics,
  DecisionV3ReplayGroupedMetrics,
  DecisionV3ReplayLeakageAudit,
  DecisionV3ReplayDatasetSummary,
  DecisionV3ReplayBetSettlement,
} from "@/lib/replay/v3/decisionV3ReplayValidationTypes";
