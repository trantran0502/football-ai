import { createMockGoalsXgProvider } from "@/lib/analysis/featureScore/providers/goalsXgProvider";
import { createMockH2HProvider } from "@/lib/analysis/featureScore/providers/h2hProvider";
import { createMockHomeAwayProvider } from "@/lib/analysis/featureScore/providers/homeAwayProvider";
import { createMockLeagueStrengthProvider } from "@/lib/analysis/featureScore/providers/leagueStrengthProvider";
import { createMockMatchContextProvider } from "@/lib/analysis/featureScore/providers/matchContextProvider";
import { createMockRecentFormProvider } from "@/lib/analysis/featureScore/providers/recentFormProvider";
import { createMockScoringPatternProvider } from "@/lib/analysis/featureScore/providers/scoringPatternProvider";
import { createMockSquadAvailabilityProvider } from "@/lib/analysis/featureScore/providers/squadAvailabilityProvider";
import type {
  FeatureProviderKey,
  ProviderDataByKey,
  ProviderRequestByKey,
} from "@/lib/providers/registry/types";

type MockHandler = (request: unknown) => unknown;

const recentFormProvider = createMockRecentFormProvider();
const leagueStrengthProvider = createMockLeagueStrengthProvider();
const homeAwayProvider = createMockHomeAwayProvider();
const goalsXgProvider = createMockGoalsXgProvider();
const scoringPatternProvider = createMockScoringPatternProvider();
const h2hProvider = createMockH2HProvider();
const squadAvailabilityProvider = createMockSquadAvailabilityProvider();
const matchContextProvider = createMockMatchContextProvider();

export const MOCK_SOURCE_HANDLERS: {
  [K in FeatureProviderKey]: (request: ProviderRequestByKey[K]) => ProviderDataByKey[K];
} = {
  recentForm: (request) => recentFormProvider.getRecentForm(request),
  leagueStrength: (request) => leagueStrengthProvider.getLeagueStrength(request),
  homeAway: (request) => homeAwayProvider.getHomeAwayStrength(request),
  goalsXg: (request) => goalsXgProvider.getGoalsXgMetrics(request),
  scoringPattern: (request) => scoringPatternProvider.getScoringPattern(request),
  h2h: (request) => h2hProvider.getH2HHistory(request),
  squadAvailability: (request) => squadAvailabilityProvider.getSquadAvailability(request),
  matchContext: (request) => matchContextProvider.getMatchContext(request),
};

export function fetchMockSourceData<K extends FeatureProviderKey>(
  providerKey: K,
  request: ProviderRequestByKey[K]
): ProviderDataByKey[K] {
  const handler = MOCK_SOURCE_HANDLERS[providerKey] as MockHandler;
  return handler(request) as ProviderDataByKey[K];
}
