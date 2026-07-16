export {
  buildLeagueStrengthCacheKey,
  createEmptyLeagueStrengthDiagnostics,
} from "@/lib/providers/leagueStrength/leagueStrengthTypes";
export type {
  LeagueStrengthProviderDiagnostics,
  ProductionLeagueStrengthRequest,
  ProductionLeagueStrengthResolution,
} from "@/lib/providers/leagueStrength/leagueStrengthTypes";

export {
  buildLeagueStrengthSnapshotFromMatches,
  findLeagueMatchRecordsFromHistory,
  historicalRecordToLeagueMatch,
  leagueNamesMatch,
  normalizeLeagueName,
} from "@/lib/providers/leagueStrength/leagueStrengthNormalizer";
export type {
  LeagueStrengthMatchRecord,
  LeagueStrengthNormalizationStats,
} from "@/lib/providers/leagueStrength/leagueStrengthNormalizer";

export {
  computeLeagueStrengthProviderConfidence,
  isLeagueStrengthSampleUsable,
} from "@/lib/providers/leagueStrength/leagueStrengthConfidence";

export {
  clearProductionLeagueStrengthCacheForTests,
  productionLeagueStrengthCacheSize,
  readProductionLeagueStrengthResolution,
  rememberProductionLeagueStrengthResolution,
} from "@/lib/providers/leagueStrength/leagueStrengthCache";

export {
  clearActiveProductionLeagueStrengthContext,
  getActiveProductionLeagueStrengthContext,
  setActiveProductionLeagueStrengthContext,
} from "@/lib/providers/leagueStrength/leagueStrengthProviderContext";
export type { ProductionLeagueStrengthContext } from "@/lib/providers/leagueStrength/leagueStrengthProviderContext";

export {
  loadMatchRecordsForLeagueStrength,
  resolveLeagueStrengthFromMatchRecords,
} from "@/lib/providers/leagueStrength/leagueStrengthMatchRecordsSource";

export {
  buildUnavailableLeagueStrengthResolution,
  fetchProductionLeagueStrengthSourceData,
  getProductionLeagueStrengthResolution,
  loadProductionLeagueStrengthMatchRecords,
  prefetchProductionLeagueStrength,
  prepareProductionLeagueStrengthContext,
  readCachedProductionLeagueStrength,
  resetProductionLeagueStrengthContext,
} from "@/lib/providers/leagueStrength/productionLeagueStrengthProvider";
