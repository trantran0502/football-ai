import type {
  BrowserRuntimeWeightConfig,
  LoadedRuntimeWeightConfig,
  WeightConfigVersion,
} from "@/lib/recommendation/weightConfigTypes";

export function sanitizeLoadedRuntimeWeightConfigForBrowser(
  config: LoadedRuntimeWeightConfig
): BrowserRuntimeWeightConfig {
  return {
    providerWeights: { ...config.providerWeights },
    marketBlendWeight: config.marketBlendWeight,
    source: config.source,
    loadedAt: config.loadedAt,
    activeVersion: config.activeVersion
      ? {
          id: config.activeVersion.id,
          version: config.activeVersion.version,
        }
      : null,
  };
}

export function toLoadedRuntimeWeightConfigFromBrowser(
  config: BrowserRuntimeWeightConfig
): LoadedRuntimeWeightConfig {
  return {
    providerWeights: { ...config.providerWeights },
    marketBlendWeight: config.marketBlendWeight,
    source: config.source,
    loadedAt: config.loadedAt,
    activeVersion: config.activeVersion
      ? ({
          id: config.activeVersion.id,
          version: config.activeVersion.version,
        } as WeightConfigVersion)
      : null,
  };
}
