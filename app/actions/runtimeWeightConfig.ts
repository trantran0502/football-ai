"use server";

import { fetchBrowserRuntimeWeightConfig } from "@/lib/recommendation/fetchBrowserRuntimeWeightConfig";
import type { BrowserRuntimeWeightConfig } from "@/lib/recommendation/weightConfigTypes";

export async function fetchRuntimeWeightConfigForBrowserAction(): Promise<BrowserRuntimeWeightConfig> {
  return fetchBrowserRuntimeWeightConfig();
}
