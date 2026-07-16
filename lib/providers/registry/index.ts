export type {
  CachedProviderPayload,
  FeatureProviderKey,
  ProviderDataByKey,
  ProviderDataSource,
  ProviderRegistryOptions,
  ProviderRequestByKey,
  ProviderResponse,
  ProviderSourceAttempt,
} from "@/lib/providers/registry/types";

export {
  DEFAULT_MEMORY_TTL_MS,
  DEFAULT_SOURCE_CONFIDENCE,
  DEFAULT_SUPABASE_TTL_MS,
  FEATURE_PROVIDER_KEYS,
  resolveEffectiveProviderSource,
} from "@/lib/providers/registry/types";

export {
  buildProviderCacheKey,
  createTimestamps,
  isExpired,
  stableSerialize,
} from "@/lib/providers/registry/cacheKey";

export { MemoryProviderCache } from "@/lib/providers/registry/cache/memoryProviderCache";
export {
  SupabaseProviderCache,
  createSupabaseProviderCache,
} from "@/lib/providers/registry/cache/supabaseProviderCache";
export {
  ProviderCacheManager,
  createProviderCacheManager,
} from "@/lib/providers/registry/cache/providerCacheManager";

export { fetchMockSourceData, MOCK_SOURCE_HANDLERS } from "@/lib/providers/registry/sources/mockSourceHandlers";
export { fetchApiFootballSourceData } from "@/lib/providers/registry/sources/apiFootballSource";
export { fetchGoogleSearchSourceData } from "@/lib/providers/registry/sources/googleSearchSource";

export {
  FeatureProviderRegistry,
  createFeatureProviderRegistry,
  getFeatureProviderRegistry,
  resetFeatureProviderRegistryForTests,
  setFeatureProviderRegistryForTests,
} from "@/lib/providers/registry/providerRegistry";

export {
  createRegistryGoalsXgProvider,
  createRegistryH2HProvider,
  createRegistryHomeAwayProvider,
  createRegistryLeagueStrengthProvider,
  createRegistryMatchContextProvider,
  createRegistryRecentFormProvider,
  createRegistryScoringPatternProvider,
  createRegistrySquadAvailabilityProvider,
} from "@/lib/providers/registry/createRegistryProviders";
