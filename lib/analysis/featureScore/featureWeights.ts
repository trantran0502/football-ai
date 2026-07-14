/**
 * Central weight registry for Feature Score Engine.
 * All feature weights are controlled here; collectors reference keys from this map.
 */
export const FEATURE_WEIGHTS = {
  homeAdvantage: 1,
  recentForm: 1,
  marketOdds: 1,
  handicapSupport: 1,
  totalGoalsSupport: 1,
  bttsSupport: 1,
} as const;

export type FeatureWeightKey = keyof typeof FEATURE_WEIGHTS;

export function getFeatureWeight(key: FeatureWeightKey): number {
  return FEATURE_WEIGHTS[key];
}
