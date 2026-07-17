export { runMarketPatternEngine } from "./patternEngine";
export {
  AwayHighWaterValue,
  BalancedFavorite,
  BalancedUnderdog,
  evaluatePatternMatch,
  ExtremeFavorite,
  ExtremeUnderdog,
  getPatternDefinitionById,
  HighOverroundRisk,
  HomeLowWaterBalanced,
  HomeLowWaterFavorite,
  listPatternIds,
  LowOverroundBalanced,
  MARKET_PATTERN_DEFINITIONS,
  MARKET_PATTERN_REGISTRY,
  TrapCandidate,
} from "./patternRegistry";
export {
  collectMatchedRules,
  findFavoriteSide,
  findUnderdogSide,
  getTriggeredRuleIds,
  hasHighWaterOnSide,
  hasLowWaterOnSide,
  isRuleTriggered,
  requiredRulesTriggered,
} from "./patternHelpers";
export type {
  MarketPatternDefinition,
  MarketPatternMatch,
  PatternAuditEntry,
  PatternEngineResult,
  PatternHistoricalQuery,
  PatternHistoricalResult,
  PatternHistoryProvider,
  PatternMatchContext,
} from "./patternTypes";
export {
  NOT_IMPLEMENTED_PATTERN_HISTORICAL,
} from "./patternTypes";
