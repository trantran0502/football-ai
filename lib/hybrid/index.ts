export type {
  HybridCitation,
  HybridConflict,
  HybridField,
  HybridFormLabel,
  HybridFormSample,
  HybridMatchRecord,
  HybridMatchStatusContext,
  HybridOriginSource,
  HybridResolveRequest,
  HybridResolveResult,
  HybridSourcePayload,
  HybridSourceValue,
  HybridStandingRecord,
  HybridTeamMetrics,
  NormalizedTeamContext,
} from "@/lib/hybrid/hybridTypes";

export {
  areSameFixture,
  buildMatchFingerprint,
  dedupeMatchRecords,
  filterOfficialMatches,
  filterVenueMatches,
  hasHomeAwayDirectionConflict,
  hasScoreConflict,
  inferCompetitionType,
  normalizeTeamName,
  sortMatchesDesc,
  takeRecentMatches,
} from "@/lib/hybrid/matchComparison";

export {
  createSourceValue,
  mergeHybridField,
  mergeMatchRecordLists,
} from "@/lib/hybrid/conflictResolver";

export { extractApiFootballHybridPayload } from "@/lib/hybrid/extractApiFootballPayload";
export { extractProviderDataFromContext } from "@/lib/hybrid/normalizeTeamContext";

export {
  buildHybridCacheKey,
  getCachedHybridContext,
  rememberHybridContext,
  resetHybridCacheForTests,
} from "@/lib/hybrid/hybridCache";

export {
  resolveHybridData,
  resolveHybridTeamContext,
} from "@/lib/hybrid/hybridDataResolver";
