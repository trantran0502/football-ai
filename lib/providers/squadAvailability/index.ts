export {
  buildSquadAvailabilityCacheKey,
  createEmptySquadAvailabilityDiagnostics,
} from "@/lib/providers/squadAvailability/squadAvailabilityTypes";
export type {
  ProductionSquadAvailabilityRequest,
  ProductionSquadAvailabilityResolution,
  SquadAvailabilityProviderDiagnostics,
} from "@/lib/providers/squadAvailability/squadAvailabilityTypes";

export {
  classifySquadPlayerStatus,
  isOfficialAnnouncementUrl,
} from "@/lib/providers/squadAvailability/squadAvailabilityOfficialSource";
export type { SquadPlayerStatus } from "@/lib/providers/squadAvailability/squadAvailabilityOfficialSource";

export {
  computeSquadAvailabilityProviderConfidence,
  isSquadAvailabilitySampleUsable,
} from "@/lib/providers/squadAvailability/squadAvailabilityConfidence";

export {
  buildEmptySquadAvailabilitySnapshot,
  buildSquadAvailabilitySnapshotFromOfficialRecords,
  normalizeOfficialGooglePlayerRecords,
} from "@/lib/providers/squadAvailability/squadAvailabilityNormalizer";
export type { OfficialSquadPlayerRecord } from "@/lib/providers/squadAvailability/squadAvailabilityNormalizer";

export { resolveSquadAvailabilityFromGoogleSearch } from "@/lib/providers/squadAvailability/squadAvailabilityGoogleSource";
export { resolveSquadAvailabilityFromMatchRecords } from "@/lib/providers/squadAvailability/squadAvailabilityMatchRecordsSource";

export {
  clearProductionSquadAvailabilityCacheForTests,
  readProductionSquadAvailabilityResolution,
  rememberProductionSquadAvailabilityResolution,
} from "@/lib/providers/squadAvailability/squadAvailabilityCache";

export {
  clearActiveProductionSquadAvailabilityContext,
  getActiveProductionSquadAvailabilityContext,
  setActiveProductionSquadAvailabilityContext,
} from "@/lib/providers/squadAvailability/squadAvailabilityProviderContext";
export type { ProductionSquadAvailabilityContext } from "@/lib/providers/squadAvailability/squadAvailabilityProviderContext";

export {
  fetchProductionSquadAvailabilitySourceData,
  getProductionSquadAvailabilityResolution,
  prefetchProductionSquadAvailability,
  prepareProductionSquadAvailabilityContext,
  readCachedProductionSquadAvailability,
  resetProductionSquadAvailabilityContext,
  usesProductionSquadAvailabilityOnlyPath,
} from "@/lib/providers/squadAvailability/productionSquadAvailabilityProvider";
