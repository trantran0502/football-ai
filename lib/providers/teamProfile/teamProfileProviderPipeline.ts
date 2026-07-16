import type { FeatureScore } from "@/lib/analysis/featureScore/types";
import type {
  FeatureProviderKey,
  ProviderDataSource,
  ProviderRequestByKey,
} from "@/lib/providers/registry/types";
import {
  FEATURE_PROVIDER_KEYS,
  getFeatureProviderRegistry,
  resolveEffectiveProviderSource,
} from "@/lib/providers/registry";
import type { ReplayDataSource } from "@/lib/replay/replayTypes";
import type { MatchTeamProfilesSnapshot } from "@/lib/teamProfile/teamProfileTypes";
import {
  clearActiveTeamProfilesForResolution,
  setActiveTeamProfilesForResolution,
} from "@/lib/providers/teamProfile/teamProfileProviderContext";

export interface ResolvedProviderSnapshot {
  key: FeatureProviderKey;
  source: ProviderDataSource;
  sourceDetail?: string | null;
  confidence: number;
  warnings: string[];
  data: unknown;
  available: boolean;
}

export interface ProviderResolutionAudit {
  resolved: ResolvedProviderSnapshot[];
  mockProviderCount: number;
  unavailableProviderCount: number;
  teamProfileProviderCount: number;
  criticalProvidersUnavailable: boolean;
  providerSources: Partial<Record<FeatureProviderKey, ProviderDataSource>>;
}

const CRITICAL_PROVIDER_KEYS: FeatureProviderKey[] = [
  "recentForm",
  "homeAway",
  "scoringPattern",
];

const FEATURE_PREFIX_TO_PROVIDER: Array<{
  prefix: string;
  providerKey: FeatureProviderKey;
}> = [
  { prefix: "recent_form.", providerKey: "recentForm" },
  { prefix: "home_away.", providerKey: "homeAway" },
  { prefix: "goals_xg.", providerKey: "goalsXg" },
  { prefix: "scoring_pattern.", providerKey: "scoringPattern" },
  { prefix: "league_strength.", providerKey: "leagueStrength" },
  { prefix: "h2h.", providerKey: "h2h" },
  { prefix: "squad_availability.", providerKey: "squadAvailability" },
  { prefix: "match_context.", providerKey: "matchContext" },
];

export function toReplayDataSource(source: ProviderDataSource): ReplayDataSource {
  switch (source) {
    case "teamProfile":
      return "team-profile";
    case "apiFootball":
      return "api";
    case "googleSearch":
      return "google";
    case "cache":
      return "cache";
    case "hybrid":
      return "hybrid";
    case "mock":
      return "mock";
    case "unavailable":
      return "unavailable";
    default:
      return "unknown";
  }
}

function buildProviderRequest<K extends FeatureProviderKey>(
  providerKey: K,
  input: {
    homeTeam: string;
    awayTeam: string;
    matchDate?: string;
    league?: string;
  }
): ProviderRequestByKey[K] {
  if (providerKey === "leagueStrength") {
    return {
      leagueName: input.league ?? "Unknown",
    } as ProviderRequestByKey[K];
  }

  return {
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    matchDate: input.matchDate,
  } as ProviderRequestByKey[K];
}

export function resolveAllProviderSnapshots(input: {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
  league?: string;
}): ResolvedProviderSnapshot[] {
  const registry = getFeatureProviderRegistry();
  return FEATURE_PROVIDER_KEYS.map((providerKey) => {
    const request = buildProviderRequest(providerKey, input);
    const response = registry.resolveSync(providerKey, request);
    const source = resolveEffectiveProviderSource(response);
    return {
      key: providerKey,
      source,
      sourceDetail: source === "teamProfile" ? "team_profiles" : null,
      confidence: response.confidence,
      warnings: response.warnings,
      data: response.data,
      available: source !== "unavailable" && source !== "mock",
    };
  });
}

export function auditProviderResolution(
  snapshots: ResolvedProviderSnapshot[]
): ProviderResolutionAudit {
  const providerSources: Partial<Record<FeatureProviderKey, ProviderDataSource>> =
    {};
  let mockProviderCount = 0;
  let unavailableProviderCount = 0;
  let teamProfileProviderCount = 0;

  for (const snapshot of snapshots) {
    providerSources[snapshot.key] = snapshot.source;
    if (snapshot.source === "mock") {
      mockProviderCount += 1;
    }
    if (snapshot.source === "unavailable") {
      unavailableProviderCount += 1;
    }
    if (snapshot.source === "teamProfile") {
      teamProfileProviderCount += 1;
    }
  }

  const criticalProvidersUnavailable = CRITICAL_PROVIDER_KEYS.some((key) => {
    const source = providerSources[key];
    return source === "unavailable" || source === "mock" || source === undefined;
  });

  return {
    resolved: snapshots,
    mockProviderCount,
    unavailableProviderCount,
    teamProfileProviderCount,
    criticalProvidersUnavailable,
    providerSources,
  };
}

export function annotateFeatureProviderSources(
  features: FeatureScore[],
  audit: ProviderResolutionAudit
): FeatureScore[] {
  return features.map((feature) => {
    const mapping = FEATURE_PREFIX_TO_PROVIDER.find((entry) =>
      feature.id.startsWith(entry.prefix)
    );
    const providerKey = mapping?.providerKey;
    const source = providerKey ? audit.providerSources[providerKey] : undefined;
    const snapshot = providerKey
      ? audit.resolved.find((entry) => entry.key === providerKey)
      : undefined;

    return {
      ...feature,
      metadata: {
        ...(feature.metadata ?? {}),
        providerSource: source ?? "unknown",
        sourceDetail: snapshot?.sourceDetail ?? null,
        replaySource: source ? toReplayDataSource(source) : "unknown",
      },
    };
  });
}

export function prepareTeamProfileProviderContext(
  teamProfiles: MatchTeamProfilesSnapshot | null | undefined
): void {
  setActiveTeamProfilesForResolution(teamProfiles ?? null);
}

export function resetTeamProfileProviderContext(): void {
  clearActiveTeamProfilesForResolution();
}
