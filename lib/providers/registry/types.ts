export type FeatureProviderKey =
  | "recentForm"
  | "leagueStrength"
  | "homeAway"
  | "goalsXg"
  | "scoringPattern"
  | "h2h"
  | "squadAvailability"
  | "matchContext";

export type ProviderDataSource =
  | "cache"
  | "apiFootball"
  | "googleSearch"
  | "hybrid"
  | "mock";

export interface ProviderResponse<T> {
  data: T;
  source: ProviderDataSource;
  fetchedAt: string;
  expiresAt: string;
  confidence: number;
  warnings: string[];
}

export interface CachedProviderPayload<T> {
  data: T;
  source: Exclude<ProviderDataSource, "cache">;
  fetchedAt: string;
  expiresAt: string;
  confidence: number;
  warnings: string[];
}

export interface ProviderRegistryOptions {
  memoryTtlMs?: number;
  supabaseTtlMs?: number;
  defaultConfidence?: Partial<Record<Exclude<ProviderDataSource, "cache">, number>>;
  sourceResolvers?: Partial<
    Record<
      Exclude<ProviderDataSource, "cache">,
      (providerKey: FeatureProviderKey, request: unknown) => unknown | null
    >
  >;
}

export interface ProviderSourceAttempt<TRequest, TData> {
  source: Exclude<ProviderDataSource, "cache">;
  fetch: (request: TRequest) => ProviderResponse<TData> | null;
}

export type ProviderRequestByKey = {
  recentForm: import("@/lib/analysis/featureScore/providers/recentFormProvider").RecentFormProviderRequest;
  leagueStrength: import("@/lib/analysis/featureScore/providers/leagueStrengthProvider").LeagueStrengthProviderRequest;
  homeAway: import("@/lib/analysis/featureScore/providers/homeAwayProvider").HomeAwayProviderRequest;
  goalsXg: import("@/lib/analysis/featureScore/providers/goalsXgProvider").GoalsXgProviderRequest;
  scoringPattern: import("@/lib/analysis/featureScore/providers/scoringPatternProvider").ScoringPatternProviderRequest;
  h2h: import("@/lib/analysis/featureScore/providers/h2hProvider").H2HProviderRequest;
  squadAvailability: import("@/lib/analysis/featureScore/providers/squadAvailabilityProvider").SquadAvailabilityProviderRequest;
  matchContext: import("@/lib/analysis/featureScore/providers/matchContextProvider").MatchContextProviderRequest;
};

export type ProviderDataByKey = {
  recentForm: import("@/lib/analysis/featureScore/providers/recentFormProvider").RecentFormMatchup;
  leagueStrength: import("@/lib/analysis/featureScore/providers/leagueStrengthProvider").LeagueStrengthSnapshot;
  homeAway: import("@/lib/analysis/featureScore/providers/homeAwayProvider").HomeAwaySnapshot;
  goalsXg: import("@/lib/analysis/featureScore/providers/goalsXgProvider").GoalsXgSnapshot;
  scoringPattern: import("@/lib/analysis/featureScore/providers/scoringPatternProvider").ScoringPatternSnapshot;
  h2h: import("@/lib/analysis/featureScore/providers/h2hProvider").H2HSnapshot;
  squadAvailability: import("@/lib/analysis/featureScore/providers/squadAvailabilityProvider").SquadAvailabilitySnapshot;
  matchContext: import("@/lib/analysis/featureScore/providers/matchContextProvider").MatchContextSnapshot;
};

export const FEATURE_PROVIDER_KEYS: readonly FeatureProviderKey[] = [
  "recentForm",
  "leagueStrength",
  "homeAway",
  "goalsXg",
  "scoringPattern",
  "h2h",
  "squadAvailability",
  "matchContext",
] as const;

export const DEFAULT_SOURCE_CONFIDENCE: Record<
  Exclude<ProviderDataSource, "cache">,
  number
> = {
  apiFootball: 0.85,
  googleSearch: 0.65,
  hybrid: 0.9,
  mock: 0.45,
};

export const DEFAULT_MEMORY_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_SUPABASE_TTL_MS = 60 * 60 * 1000;
