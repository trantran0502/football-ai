export {
  buildH2HApiRequestUrl,
  buildH2HCacheKey,
  createEmptyH2HDiagnostics,
} from "@/lib/providers/h2h/h2hTypes";
export type {
  H2HProviderDiagnostics,
  ProductionH2HRequest,
  ProductionH2HResolution,
} from "@/lib/providers/h2h/h2hTypes";

export {
  COMPLETED_FIXTURE_STATUSES,
  EXCLUDED_FIXTURE_STATUSES,
  apiFixtureToH2HMatch,
  buildH2HSnapshotFromMatches,
  findH2HMatchRecordsFromHistory,
  historicalRecordToH2HMatch,
  isFormalCompletedFixture,
  isFriendlyCompetition,
  normalizeApiH2HFixtures,
} from "@/lib/providers/h2h/h2hNormalizer";

export { computeH2HProviderConfidence } from "@/lib/providers/h2h/h2hConfidence";

export {
  clearProductionH2HCacheForTests,
  productionH2HCacheSize,
  readProductionH2HResolution,
  rememberProductionH2HResolution,
} from "@/lib/providers/h2h/h2hCache";

export {
  clearActiveProductionH2HContext,
  getActiveProductionH2HContext,
  setActiveProductionH2HContext,
} from "@/lib/providers/h2h/h2hProviderContext";
export type { ProductionH2HContext } from "@/lib/providers/h2h/h2hProviderContext";

export {
  fetchApiFootballH2HFixtures,
  resolveH2HFromApiFootball,
} from "@/lib/providers/h2h/h2hApiFootballSource";

export {
  fetchMatchRecordsH2HSourceData,
  loadMatchRecordsForH2H,
  resolveH2HFromMatchRecords,
} from "@/lib/providers/h2h/h2hMatchRecordsSource";

export {
  buildUnavailableH2HResolution,
  fetchProductionH2HSourceData,
  getProductionH2HResolution,
  loadProductionH2HMatchRecords,
  prefetchProductionH2H,
  prepareProductionH2HContext,
  readCachedProductionH2H,
  resetProductionH2HContext,
} from "@/lib/providers/h2h/productionH2HProvider";
