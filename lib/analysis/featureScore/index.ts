export type {
  FeatureCollector,
  FeatureScore,
  FeatureScoreCategory,
  FeatureScoreContext,
  FeatureScoreResult,
} from "@/lib/analysis/featureScore/types";

export {
  FEATURE_WEIGHTS,
  getFeatureWeight,
  type FeatureWeightKey,
} from "@/lib/analysis/featureScore/featureWeights";

export {
  buildFeatureScores,
  getRegisteredFeatureCollectors,
  registerFeatureCollector,
  resetFeatureCollectorsForTests,
} from "@/lib/analysis/featureScore/featureScoreEngine";

export {
  aggregateOddsFormat,
  clampConfidence,
  clampImpliedProbability,
  clampScore,
  convertRawOdds,
  convertRawOddsToImpliedProbability,
  inferSingleOddsFormat,
  impliedProbabilityFromDecimalOdds,
  type ConvertedOdds,
  type MarketOddsFormat,
  type SingleOddsFormat,
} from "@/lib/analysis/featureScore/oddsConversion";

export {
  collectMarketOddsFeature,
  isMarketOddsCollectorRegistered,
  registerMarketOddsCollector,
  resetMarketOddsCollectorRegistrationForTests,
  type MarketOddsFeatureMetadata,
} from "@/lib/analysis/featureScore/collectors/marketOddsCollector";

export {
  RECENT_FORM_FEATURE_IDS,
  collectRecentFormFeatures,
  isRecentFormCollectorRegistered,
  registerRecentFormCollector,
  resetRecentFormCollectorRegistrationForTests,
  resetRecentFormProviderForTests,
  setRecentFormProviderForTests,
  type RecentFormFeatureId,
  type RecentFormFeatureMetadata,
} from "@/lib/analysis/featureScore/collectors/recentFormCollector";

export {
  MOCK_RECENT_FORM_FIXTURES,
  createMockRecentFormProvider,
  type RecentFormMatchup,
  type RecentFormProvider,
  type RecentFormProviderRequest,
  type RecentFormTeamSnapshot,
} from "@/lib/analysis/featureScore/providers/recentFormProvider";

export {
  LEAGUE_STRENGTH_FEATURE_IDS,
  collectLeagueStrengthFeatures,
  isLeagueStrengthCollectorRegistered,
  registerLeagueStrengthCollector,
  resetLeagueStrengthCollectorRegistrationForTests,
  resetLeagueStrengthProviderForTests,
  setLeagueStrengthProviderForTests,
  type LeagueStrengthFeatureId,
  type LeagueStrengthFeatureMetadata,
} from "@/lib/analysis/featureScore/collectors/leagueStrengthCollector";

export {
  MOCK_LEAGUE_STRENGTH_FIXTURES,
  createMockLeagueStrengthProvider,
  type LeagueStrengthProvider,
  type LeagueStrengthProviderRequest,
  type LeagueStrengthSnapshot,
} from "@/lib/analysis/featureScore/providers/leagueStrengthProvider";

export {
  HOME_AWAY_FEATURE_IDS,
  collectHomeAwayFeatures,
  isHomeAwayCollectorRegistered,
  registerHomeAwayCollector,
  resetHomeAwayCollectorRegistrationForTests,
  resetHomeAwayProviderForTests,
  setHomeAwayProviderForTests,
  type HomeAwayFeatureId,
  type HomeAwayFeatureMetadata,
} from "@/lib/analysis/featureScore/collectors/homeAwayCollector";

export {
  MOCK_HOME_AWAY_FIXTURES,
  createMockHomeAwayProvider,
  type FormResult,
  type HomeAwayProvider,
  type HomeAwayProviderRequest,
  type HomeAwaySnapshot,
} from "@/lib/analysis/featureScore/providers/homeAwayProvider";

export {
  GOALS_XG_FEATURE_IDS,
  collectGoalsXgFeatures,
  isGoalsXgCollectorRegistered,
  registerGoalsXgCollector,
  resetGoalsXgCollectorRegistrationForTests,
  resetGoalsXgProviderForTests,
  setGoalsXgProviderForTests,
  type GoalsXgFeatureId,
  type GoalsXgFeatureMetadata,
} from "@/lib/analysis/featureScore/collectors/goalsXgCollector";

export {
  MOCK_GOALS_XG_FIXTURES,
  EMPTY_GOALS_XG_METRICS,
  buildPartialGoalsXgSnapshot,
  createMockGoalsXgProvider,
  type GoalsXgProvider,
  type GoalsXgProviderRequest,
  type GoalsXgSnapshot,
  type TeamGoalsXgMetrics,
} from "@/lib/analysis/featureScore/providers/goalsXgProvider";

export {
  SCORING_PATTERN_FEATURE_IDS,
  collectScoringPatternFeatures,
  isScoringPatternCollectorRegistered,
  registerScoringPatternCollector,
  resetScoringPatternCollectorRegistrationForTests,
  resetScoringPatternProviderForTests,
  setScoringPatternProviderForTests,
  type ScoringPatternFeatureId,
  type ScoringPatternFeatureMetadata,
} from "@/lib/analysis/featureScore/collectors/scoringPatternCollector";

export {
  MOCK_SCORING_PATTERN_FIXTURES,
  EMPTY_SCORING_PATTERN_METRICS,
  buildPartialScoringPatternSnapshot,
  createMockScoringPatternProvider,
  type ScoringPatternProvider,
  type ScoringPatternProviderRequest,
  type ScoringPatternSnapshot,
  type TeamScoringPatternMetrics,
} from "@/lib/analysis/featureScore/providers/scoringPatternProvider";

export {
  H2H_FEATURE_IDS,
  collectH2HFeatures,
  isH2HCollectorRegistered,
  registerH2HCollector,
  resetH2HCollectorRegistrationForTests,
  resetH2HProviderForTests,
  setH2HProviderForTests,
  type H2HFeatureId,
  type H2HFeatureMetadata,
} from "@/lib/analysis/featureScore/collectors/h2hCollector";

export {
  MOCK_H2H_FIXTURES,
  buildPartialH2HSnapshot,
  createMockH2HProvider,
  type H2HMatchRecord,
  type H2HProvider,
  type H2HProviderRequest,
  type H2HSnapshot,
} from "@/lib/analysis/featureScore/providers/h2hProvider";

export {
  SQUAD_AVAILABILITY_FEATURE_IDS,
  collectSquadAvailabilityFeatures,
  isSquadAvailabilityCollectorRegistered,
  registerSquadAvailabilityCollector,
  resetSquadAvailabilityCollectorRegistrationForTests,
  resetSquadAvailabilityProviderForTests,
  setSquadAvailabilityProviderForTests,
  type SquadAvailabilityFeatureId,
  type SquadAvailabilityFeatureMetadata,
} from "@/lib/analysis/featureScore/collectors/squadAvailabilityCollector";

export {
  MOCK_SQUAD_AVAILABILITY_FIXTURES,
  EMPTY_SQUAD_AVAILABILITY,
  buildPartialSquadAvailabilitySnapshot,
  createMockSquadAvailabilityProvider,
  type SquadAvailabilityProvider,
  type SquadAvailabilityProviderRequest,
  type SquadAvailabilitySnapshot,
  type TeamSquadAvailability,
} from "@/lib/analysis/featureScore/providers/squadAvailabilityProvider";

export {
  MATCH_CONTEXT_FEATURE_IDS,
  collectMatchContextFeatures,
  isMatchContextCollectorRegistered,
  registerMatchContextCollector,
  resetMatchContextCollectorRegistrationForTests,
  resetMatchContextProviderForTests,
  setMatchContextProviderForTests,
  type MatchContextFeatureId,
  type MatchContextFeatureMetadata,
} from "@/lib/analysis/featureScore/collectors/matchContextCollector";

export {
  MOCK_MATCH_CONTEXT_FIXTURES,
  buildPartialMatchContextSnapshot,
  createMockMatchContextProvider,
  type MatchContextProvider,
  type MatchContextProviderRequest,
  type MatchContextSnapshot,
  type TeamMatchContextMetrics,
} from "@/lib/analysis/featureScore/providers/matchContextProvider";

export {
  FUSION_SOURCE_CATEGORIES,
  type FeatureFusionOptions,
  type FeatureFusionResult,
  type FusionCategoryDefinition,
  type FusionCategoryScore,
  type FusionFactorSummary,
  type FusionSourceCategory,
  type FusionWarning,
  type FusionWarningCode,
} from "@/lib/analysis/featureScore/fusion/fusionTypes";

export {
  FeatureFusionEngine,
  fuseFeatureScores,
  resolveFusionSourceCategory,
} from "@/lib/analysis/featureScore/fusion/featureFusionEngine";
