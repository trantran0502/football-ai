import type {
  FeatureProviderKey,
  ProviderDataByKey,
  ProviderRequestByKey,
} from "@/lib/providers/registry/types";
import { TEAM_PROFILE_PROVIDER_KEYS } from "@/lib/providers/teamProfile/providerMode";
import {
  isUsableTeamProfile,
  mapTeamProfilesToGoalsXg,
  mapTeamProfilesToHomeAway,
  mapTeamProfilesToRecentForm,
  mapTeamProfilesToScoringPattern,
} from "@/lib/providers/teamProfile/teamProfileProviderAdapter";
import { getActiveTeamProfilesForResolution } from "@/lib/providers/teamProfile/teamProfileProviderContext";

function normalizeTeamName(value: string): string {
  return value.trim().toLowerCase();
}

function resolveSideProfile(
  snapshot: NonNullable<ReturnType<typeof getActiveTeamProfilesForResolution>>,
  teamName: string
): "home" | "away" | null {
  const normalized = normalizeTeamName(teamName);
  if (snapshot.home && normalizeTeamName(snapshot.home.teamName) === normalized) {
    return "home";
  }
  if (snapshot.away && normalizeTeamName(snapshot.away.teamName) === normalized) {
    return "away";
  }
  return null;
}

export function fetchTeamProfileSourceData<K extends FeatureProviderKey>(
  providerKey: K,
  request: ProviderRequestByKey[K]
): ProviderDataByKey[K] | null {
  if (!TEAM_PROFILE_PROVIDER_KEYS.has(providerKey)) {
    return null;
  }

  const snapshot = getActiveTeamProfilesForResolution();
  if (!snapshot) {
    return null;
  }

  if (!isUsableTeamProfile(snapshot.home) || !isUsableTeamProfile(snapshot.away)) {
    return null;
  }

  const home = snapshot.home!;
  const away = snapshot.away!;

  if (providerKey === "leagueStrength") {
    return null;
  }

  const teamRequest = request as ProviderRequestByKey["recentForm"];
  const homeSide = resolveSideProfile(snapshot, teamRequest.homeTeam);
  const awaySide = resolveSideProfile(snapshot, teamRequest.awayTeam);
  if (homeSide === null || awaySide === null) {
    return null;
  }

  const resolvedHome = homeSide === "home" ? home : away;
  const resolvedAway = awaySide === "away" ? away : home;

  switch (providerKey) {
    case "recentForm":
      return mapTeamProfilesToRecentForm(resolvedHome, resolvedAway) as ProviderDataByKey[K];
    case "homeAway":
      return mapTeamProfilesToHomeAway(resolvedHome, resolvedAway) as ProviderDataByKey[K];
    case "goalsXg":
      return mapTeamProfilesToGoalsXg(resolvedHome, resolvedAway) as ProviderDataByKey[K];
    case "scoringPattern":
      return mapTeamProfilesToScoringPattern(resolvedHome, resolvedAway) as ProviderDataByKey[K];
    default:
      return null;
  }
}
