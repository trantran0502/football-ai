export type {
  EnsureTeamProfilesInput,
  EnsureTeamProfilesResult,
  MatchTeamProfilesSnapshot,
  RefreshTeamProfileInput,
  RefreshTeamProfileResult,
  TeamProfile,
  TeamProfileIdentity,
  TeamProfileMatchInput,
  TeamProfileSource,
  TeamProfileTeamDiagnostic,
  TeamProfileSeasonMetadata,
  TeamProfileFallbackReason,
  TeamProfileApiAttemptDiagnostic,
} from "@/lib/teamProfile/teamProfileTypes";

export {
  calculateFormScore,
  calculateMomentumScore,
  clampRate,
  clampScore,
  outcomePointsForTeam,
} from "@/lib/teamProfile/teamProfileFormScore";

export {
  calculateTeamProfile,
  calculateTeamProfileCompleteness,
} from "@/lib/teamProfile/teamProfileCalculator";

export {
  filterAwayMatches,
  filterHomeMatches,
  isFriendlyLeague,
  normalizeApiFootballFixtures,
  normalizeVerifiedMatchRecords,
  shouldExcludeMatch,
} from "@/lib/teamProfile/teamProfileNormalizer";

export { fetchTeamProfileData, mergeTeamProfileMatchesDeduped } from "@/lib/teamProfile/teamProfileDataSource";

export {
  buildTeamProfileTeamDiagnostic,
  summarizeTeamProfileDiagnostics,
} from "@/lib/teamProfile/teamProfileDiagnostics";

export {
  disableTeamProfileMemoryStoreForTests,
  enableTeamProfileMemoryStoreForTests,
  getProfilesForMatch,
  getTeamProfile,
  listMemoryTeamProfilesForTests,
  listStaleTeamProfiles,
  markProfileRefreshFailure,
  resetTeamProfileMemoryStoreForTests,
  upsertTeamProfile,
} from "@/lib/teamProfile/teamProfileRepository";
export type { UpsertTeamProfileResult } from "@/lib/teamProfile/teamProfileRepository";

export {
  attachTeamProfilesToReport,
  buildMatchTeamProfilesSnapshot,
  ensureTeamProfilesForMatch,
  getTeamProfileTtlHours,
  isTeamProfileStale,
  loadProfilesForMatch,
  refreshTeamProfile,
  resetTeamProfileRefreshDedupeForTests,
} from "@/lib/teamProfile/teamProfileService";
