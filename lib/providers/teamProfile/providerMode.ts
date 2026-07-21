import type { FeatureProviderKey } from "@/lib/providers/registry/types";

export const TEAM_PROFILE_PROVIDER_KEYS = new Set<FeatureProviderKey>([
  "recentForm",
  "homeAway",
  "goalsXg",
  "scoringPattern",
]);

export const PRODUCTION_MOCK_BLOCKED_PROVIDER_KEYS = new Set<FeatureProviderKey>([
  "leagueStrength",
  "h2h",
  "squadAvailability",
  "matchContext",
]);

export function isProductionRecommendationMode(): boolean {
  if (process.env.FOOTBALL_RECOMMENDATION_MODE === "production") {
    return true;
  }
  if (process.env.FOOTBALL_RECOMMENDATION_MODE === "development") {
    return false;
  }
  return process.env.NODE_ENV === "production";
}

/** Production never invokes live Google Gemini Grounding; dev/test may still use it. */
export function isGoogleGroundingEnabled(): boolean {
  return !isProductionRecommendationMode();
}

export function allowMockProviderFallback(): boolean {
  if (process.env.ALLOW_MOCK_PROVIDERS === "true") {
    return true;
  }
  if (process.env.ALLOW_MOCK_PROVIDERS === "false") {
    return false;
  }
  if (process.env.NODE_ENV === "test") {
    return true;
  }
  return !isProductionRecommendationMode();
}

export function isMockBlockedInProduction(providerKey: FeatureProviderKey): boolean {
  return (
    isProductionRecommendationMode() &&
    PRODUCTION_MOCK_BLOCKED_PROVIDER_KEYS.has(providerKey)
  );
}
