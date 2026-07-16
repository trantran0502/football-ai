import type { MatchTeamProfilesSnapshot } from "@/lib/teamProfile/teamProfileTypes";

let activeTeamProfiles: MatchTeamProfilesSnapshot | null = null;

export function setActiveTeamProfilesForResolution(
  snapshot: MatchTeamProfilesSnapshot | null
): void {
  activeTeamProfiles = snapshot;
}

export function getActiveTeamProfilesForResolution(): MatchTeamProfilesSnapshot | null {
  return activeTeamProfiles;
}

export function clearActiveTeamProfilesForResolution(): void {
  activeTeamProfiles = null;
}
