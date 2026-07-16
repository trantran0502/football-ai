export {
  TEAM_PROFILE_PROVIDER_KEYS,
  PRODUCTION_MOCK_BLOCKED_PROVIDER_KEYS,
  allowMockProviderFallback,
  isMockBlockedInProduction,
  isProductionRecommendationMode,
} from "@/lib/providers/teamProfile/providerMode";

export {
  buildEmptyGoalsXgSnapshot,
  buildEmptyScoringPatternSnapshot,
  isUsableTeamProfile,
  mapTeamProfilesToGoalsXg,
  mapTeamProfilesToHomeAway,
  mapTeamProfilesToRecentForm,
  mapTeamProfilesToScoringPattern,
} from "@/lib/providers/teamProfile/teamProfileProviderAdapter";

export {
  clearActiveTeamProfilesForResolution,
  getActiveTeamProfilesForResolution,
  setActiveTeamProfilesForResolution,
} from "@/lib/providers/teamProfile/teamProfileProviderContext";

export { fetchTeamProfileSourceData } from "@/lib/providers/teamProfile/teamProfileProviderSource";

export { buildUnavailableProviderData } from "@/lib/providers/teamProfile/unavailableProviderData";

export {
  annotateFeatureProviderSources,
  auditProviderResolution,
  prepareTeamProfileProviderContext,
  resolveAllProviderSnapshots,
  toReplayDataSource,
  type ProviderResolutionAudit,
  type ResolvedProviderSnapshot,
} from "@/lib/providers/teamProfile/teamProfileProviderPipeline";
