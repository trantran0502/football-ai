import { sanitizeLoadedRuntimeWeightConfigForBrowser } from "@/lib/recommendation/runtimeWeightConfigBrowser";
import {
  loadRuntimeWeightConfigForProduction,
  type RuntimeWeightConfigLoaderDeps,
} from "@/lib/recommendation/runtimeWeightConfigLoader";
import type { BrowserRuntimeWeightConfig } from "@/lib/recommendation/weightConfigTypes";

export async function fetchBrowserRuntimeWeightConfig(
  deps: RuntimeWeightConfigLoaderDeps = {}
): Promise<BrowserRuntimeWeightConfig> {
  const loaded = await loadRuntimeWeightConfigForProduction(deps);
  return sanitizeLoadedRuntimeWeightConfigForBrowser(loaded);
}
