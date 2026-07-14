import type { GoalsXgProvider } from "@/lib/analysis/featureScore/providers/goalsXgProvider";
import type { H2HProvider } from "@/lib/analysis/featureScore/providers/h2hProvider";
import type { HomeAwayProvider } from "@/lib/analysis/featureScore/providers/homeAwayProvider";
import type { LeagueStrengthProvider } from "@/lib/analysis/featureScore/providers/leagueStrengthProvider";
import type { MatchContextProvider } from "@/lib/analysis/featureScore/providers/matchContextProvider";
import type { RecentFormProvider } from "@/lib/analysis/featureScore/providers/recentFormProvider";
import type { ScoringPatternProvider } from "@/lib/analysis/featureScore/providers/scoringPatternProvider";
import type { SquadAvailabilityProvider } from "@/lib/analysis/featureScore/providers/squadAvailabilityProvider";
import {
  FeatureProviderRegistry,
  getFeatureProviderRegistry,
} from "@/lib/providers/registry/providerRegistry";

export function createRegistryRecentFormProvider(
  registry: FeatureProviderRegistry = getFeatureProviderRegistry()
): RecentFormProvider {
  return {
    getRecentForm(request) {
      return registry.resolveSync("recentForm", request).data;
    },
  };
}

export function createRegistryLeagueStrengthProvider(
  registry: FeatureProviderRegistry = getFeatureProviderRegistry()
): LeagueStrengthProvider {
  return {
    getLeagueStrength(request) {
      return registry.resolveSync("leagueStrength", request).data;
    },
  };
}

export function createRegistryHomeAwayProvider(
  registry: FeatureProviderRegistry = getFeatureProviderRegistry()
): HomeAwayProvider {
  return {
    getHomeAwayStrength(request) {
      return registry.resolveSync("homeAway", request).data;
    },
  };
}

export function createRegistryGoalsXgProvider(
  registry: FeatureProviderRegistry = getFeatureProviderRegistry()
): GoalsXgProvider {
  return {
    getGoalsXgMetrics(request) {
      return registry.resolveSync("goalsXg", request).data;
    },
  };
}

export function createRegistryScoringPatternProvider(
  registry: FeatureProviderRegistry = getFeatureProviderRegistry()
): ScoringPatternProvider {
  return {
    getScoringPattern(request) {
      return registry.resolveSync("scoringPattern", request).data;
    },
  };
}

export function createRegistryH2HProvider(
  registry: FeatureProviderRegistry = getFeatureProviderRegistry()
): H2HProvider {
  return {
    getH2HHistory(request) {
      return registry.resolveSync("h2h", request).data;
    },
  };
}

export function createRegistrySquadAvailabilityProvider(
  registry: FeatureProviderRegistry = getFeatureProviderRegistry()
): SquadAvailabilityProvider {
  return {
    getSquadAvailability(request) {
      return registry.resolveSync("squadAvailability", request).data;
    },
  };
}

export function createRegistryMatchContextProvider(
  registry: FeatureProviderRegistry = getFeatureProviderRegistry()
): MatchContextProvider {
  return {
    getMatchContext(request) {
      return registry.resolveSync("matchContext", request).data;
    },
  };
}
