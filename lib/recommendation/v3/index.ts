export {
  buildRecommendationComparison,
  buildRecommendationComparisonObservability,
  buildRecommendationComparisonReplaySnapshot,
} from "@/lib/recommendation/v3/recommendationComparisonEngine";
export {
  adaptDecisionRecommendation,
  adaptLegacyRecommendation,
  pickLegacyTopCandidate,
} from "@/lib/recommendation/v3/recommendationDecisionAdapter";
export { isRecommendationDualWriteEnabled } from "@/lib/recommendation/v3/recommendationDualWriteConfig";
export { runRecommendationDualWriteIfEnabled } from "@/lib/recommendation/v3/recommendationDualWrite";
export {
  RECOMMENDATION_COMPARISON_REPLAY_SCHEMA,
} from "@/lib/recommendation/v3/recommendationComparisonTypes";
export type {
  ComparableDirection,
  ComparableRecommendation,
  RecommendationComparison,
  RecommendationComparisonAgreement,
  RecommendationComparisonObservability,
  RecommendationComparisonReplaySnapshot,
  RecommendationComparisonShadowContext,
} from "@/lib/recommendation/v3/recommendationComparisonTypes";
