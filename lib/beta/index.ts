export type {
  BetaCandidate,
  BetaConfidenceLevel,
  BetaDashboardStats,
  BetaGenerationResult,
  BetaRecommendationRecord,
  BetaRecommendationStatus,
  RollingEvaluationReport,
} from "@/lib/beta/types";

export {
  BETA_DISCLAIMER,
  BETA_EMPTY_MESSAGE,
  BETA_ROLLING_REPORT_KEY,
  BETA_STORAGE_KEY,
  CURRENT_MODEL_VERSION,
  ROLLING_WINDOW_SIZE,
  isBetaRecommendationModeEnabled,
} from "@/lib/beta/config";

export {
  getSampleWarning,
  getSampleWarningLevel,
  type SampleWarningLevel,
} from "@/lib/beta/sampleWarning";

export {
  buildMarketEvidenceContext,
  getBttsLeanSide,
  getFavoriteSide,
  getHandicapSupportedSide,
  getTotalLeanSide,
} from "@/lib/beta/evidenceBuilder";

export {
  betaCandidateToAnalysisCandidate,
  generateBetaCandidates,
} from "@/lib/beta/betaCandidateGenerator";

export {
  clearAllBetaRecommendations,
  getAllBetaRecommendations,
  getBetaRecommendationsByMatch,
  getBetaRecommendationsByVersion,
  getLatestRollingReport,
  getRollingReports,
  saveBetaRecommendations,
  saveRollingReport,
  updateBetaRecommendation,
} from "@/lib/beta/betaStorage";

export { settleBetaRecommendationsForMatch } from "@/lib/beta/betaValidation";

export { computeBetaDashboardStats } from "@/lib/beta/betaStatistics";

export {
  buildRollingEvaluationReport,
  maybeGenerateRollingReport,
} from "@/lib/beta/rollingEvaluation";
