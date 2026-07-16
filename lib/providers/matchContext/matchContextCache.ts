import type {
  ProductionMatchContextRequest,
  ProductionMatchContextResolution,
} from "@/lib/providers/matchContext/matchContextTypes";
import { buildMatchContextCacheKey } from "@/lib/providers/matchContext/matchContextTypes";

const resolutionStore = new Map<string, ProductionMatchContextResolution>();

export function readProductionMatchContextResolution(
  request: ProductionMatchContextRequest
): ProductionMatchContextResolution | null {
  return resolutionStore.get(buildMatchContextCacheKey(request)) ?? null;
}

export function rememberProductionMatchContextResolution(
  request: ProductionMatchContextRequest,
  resolution: ProductionMatchContextResolution
): void {
  resolutionStore.set(buildMatchContextCacheKey(request), resolution);
}

export function clearProductionMatchContextCacheForTests(): void {
  resolutionStore.clear();
}
