import type { ProductionH2HRequest, ProductionH2HResolution } from "@/lib/providers/h2h/h2hTypes";
import { buildH2HCacheKey } from "@/lib/providers/h2h/h2hTypes";

const resolutionStore = new Map<string, ProductionH2HResolution>();

export function readProductionH2HResolution(
  request: ProductionH2HRequest
): ProductionH2HResolution | null {
  return resolutionStore.get(buildH2HCacheKey(request)) ?? null;
}

export function rememberProductionH2HResolution(
  request: ProductionH2HRequest,
  resolution: ProductionH2HResolution
): void {
  resolutionStore.set(buildH2HCacheKey(request), resolution);
}

export function clearProductionH2HCacheForTests(): void {
  resolutionStore.clear();
}

export function productionH2HCacheSize(): number {
  return resolutionStore.size;
}
