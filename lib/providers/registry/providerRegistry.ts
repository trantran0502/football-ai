import { buildProviderCacheKey, createTimestamps } from "@/lib/providers/registry/cacheKey";
import {
  ProviderCacheManager,
  createProviderCacheManager,
} from "@/lib/providers/registry/cache/providerCacheManager";
import { fetchApiFootballSourceData } from "@/lib/providers/registry/sources/apiFootballSource";
import { fetchApiFootballSourceDataAsync } from "@/lib/providers/apiFootball/apiFootballService";
import { fetchGoogleSearchSourceData } from "@/lib/providers/registry/sources/googleSearchSource";
import { fetchMockSourceData } from "@/lib/providers/registry/sources/mockSourceHandlers";
import { allowMockProviderFallback } from "@/lib/providers/teamProfile/providerMode";
import { fetchTeamProfileSourceData } from "@/lib/providers/teamProfile/teamProfileProviderSource";
import {
  fetchProductionH2HSourceData,
  getProductionH2HResolution,
} from "@/lib/providers/h2h/productionH2HProvider";
import { buildUnavailableProviderData } from "@/lib/providers/teamProfile/unavailableProviderData";
import {
  extractProviderDataFromContext,
  resolveHybridData,
} from "@/lib/hybrid/hybridDataResolver";
import {
  DEFAULT_MEMORY_TTL_MS,
  DEFAULT_SOURCE_CONFIDENCE,
  type FeatureProviderKey,
  type ProviderDataByKey,
  type ProviderRegistryOptions,
  type ProviderRequestByKey,
  type ProviderResponse,
} from "@/lib/providers/registry/types";

type OriginSource = Exclude<ProviderResponse<unknown>["source"], "cache">;

export class FeatureProviderRegistry {
  private readonly cacheManager: ProviderCacheManager;
  private readonly sourceConfidence: Record<OriginSource, number>;
  private readonly sourceResolvers: ProviderRegistryOptions["sourceResolvers"];

  constructor(
    cacheManager: ProviderCacheManager = createProviderCacheManager(),
    options: ProviderRegistryOptions = {}
  ) {
    this.cacheManager = cacheManager;
    this.sourceConfidence = {
      ...DEFAULT_SOURCE_CONFIDENCE,
      ...options.defaultConfidence,
    };
    this.sourceResolvers = options.sourceResolvers;
  }

  resolveSync<K extends FeatureProviderKey>(
    providerKey: K,
    request: ProviderRequestByKey[K]
  ): ProviderResponse<ProviderDataByKey[K]> {
    const cacheKey = buildProviderCacheKey(providerKey, request);
    const memoryHit = this.cacheManager.getMemory<ProviderDataByKey[K]>(cacheKey);
    if (memoryHit) {
      return memoryHit;
    }

    const chain: Array<{
      source: OriginSource;
      fetch: () => ProviderDataByKey[K] | null;
      warnings: string[];
    }> = [
      {
        source: "matchRecords",
        fetch: () =>
          providerKey === "h2h"
            ? (fetchProductionH2HSourceData(
                request as ProviderRequestByKey["h2h"],
                "matchRecords"
              ) as ProviderDataByKey[K] | null)
            : null,
        warnings: [],
      },
      {
        source: "teamProfile",
        fetch: () =>
          this.resolveSource("teamProfile", providerKey, request),
        warnings: [],
      },
      {
        source: "apiFootball",
        fetch: () => {
          if (providerKey === "h2h") {
            return fetchProductionH2HSourceData(
              request as ProviderRequestByKey["h2h"],
              "apiFootball"
            ) as ProviderDataByKey[K] | null;
          }
          return this.resolveSource("apiFootball", providerKey, request);
        },
        warnings: [],
      },
      {
        source: "googleSearch",
        fetch: () =>
          this.resolveSource("googleSearch", providerKey, request),
        warnings: [],
      },
    ];

    if (allowMockProviderFallback()) {
      chain.push({
        source: "mock",
        fetch: () => this.resolveSource("mock", providerKey, request),
        warnings: ["Data sourced from mock provider fallback."],
      });
    }

    for (const attempt of chain) {
      const data = attempt.fetch();
      if (data === null) {
        continue;
      }

      const response = this.buildResponse(
        data,
        attempt.source,
        attempt.warnings
      );
      if (providerKey === "h2h") {
        const resolution = getProductionH2HResolution(
          request as ProviderRequestByKey["h2h"]
        );
        if (resolution) {
          response.confidence = resolution.confidence;
          response.warnings = [
            ...response.warnings,
            ...resolution.diagnostics.warnings,
          ];
        }
      }
      this.cacheManager.remember(cacheKey, response, attempt.source);
      return response;
    }

    const unavailableData = buildUnavailableProviderData(providerKey, request);
    const response = this.buildResponse(unavailableData, "unavailable", [
      `Provider ${providerKey} unavailable in current resolution chain.`,
    ]);
    this.cacheManager.remember(cacheKey, response, "unavailable");
    return response;
  }

  async resolveAsync<K extends FeatureProviderKey>(
    providerKey: K,
    request: ProviderRequestByKey[K]
  ): Promise<ProviderResponse<ProviderDataByKey[K]>> {
    const cacheKey = buildProviderCacheKey(providerKey, request);

    const memoryHit = this.cacheManager.getMemory<ProviderDataByKey[K]>(cacheKey);
    if (memoryHit) {
      return memoryHit;
    }

    const supabaseHit = await this.cacheManager.getSupabase<ProviderDataByKey[K]>(
      cacheKey
    );
    if (supabaseHit) {
      return supabaseHit;
    }

    const hybridData = await this.resolveHybridProvider(providerKey, request);
    if (hybridData) {
      this.cacheManager.remember(cacheKey, hybridData, "hybrid");
      return hybridData;
    }

    const apiData = await fetchApiFootballSourceDataAsync(providerKey, request);
    if (apiData !== null) {
      const response = this.buildResponse(apiData, "apiFootball", []);
      this.cacheManager.remember(cacheKey, response, "apiFootball");
      return response;
    }

    return this.resolveSync(providerKey, request);
  }

  clearCache(): void {
    this.cacheManager.clear();
  }

  private async resolveHybridProvider<K extends FeatureProviderKey>(
    providerKey: K,
    request: ProviderRequestByKey[K]
  ): Promise<ProviderResponse<ProviderDataByKey[K]> | null> {
    const hybridRequest = toHybridRequest(providerKey, request);
    if (!hybridRequest) {
      return null;
    }

    const { context } = await resolveHybridData(hybridRequest);
    const data = extractProviderDataFromContext(providerKey, context, request);
    if (data === null) {
      return null;
    }

    const warnings = [...context.warnings];
    for (const field of [
      context.recentFormLast10Official,
      context.h2hLast5Official,
      context.standings,
      context.injuries,
      context.matchStatus,
    ]) {
      if (field.conflicts.length > 0) {
        warnings.push(
          ...field.conflicts.map((conflict) => `${conflict.field}: ${conflict.message}`)
        );
      }
    }

    return this.buildResponse(data, "hybrid", warnings);
  }

  private resolveSource<K extends FeatureProviderKey>(
    source: OriginSource,
    providerKey: K,
    request: ProviderRequestByKey[K]
  ): ProviderDataByKey[K] | null {
    const custom = this.sourceResolvers?.[source];
    if (custom) {
      const resolved = custom(providerKey, request);
      if (resolved !== null) {
        return resolved as ProviderDataByKey[K];
      }
    }

    if (source === "apiFootball") {
      return fetchApiFootballSourceData(providerKey, request);
    }
    if (source === "teamProfile") {
      return fetchTeamProfileSourceData(providerKey, request);
    }
    if (source === "googleSearch") {
      return fetchGoogleSearchSourceData(providerKey, request);
    }
    return fetchMockSourceData(providerKey, request);
  }

  private buildResponse<T>(
    data: T,
    source: OriginSource,
    warnings: string[]
  ): ProviderResponse<T> {
    const timestamps = createTimestamps(DEFAULT_MEMORY_TTL_MS);
    return {
      data,
      source,
      fetchedAt: timestamps.fetchedAt,
      expiresAt: timestamps.expiresAt,
      confidence: this.sourceConfidence[source],
      warnings,
    };
  }
}

let defaultRegistry: FeatureProviderRegistry | null = null;

export function getFeatureProviderRegistry(): FeatureProviderRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new FeatureProviderRegistry();
  }
  return defaultRegistry;
}

export function setFeatureProviderRegistryForTests(
  registry: FeatureProviderRegistry
): void {
  defaultRegistry = registry;
}

export function resetFeatureProviderRegistryForTests(): void {
  defaultRegistry?.clearCache();
  defaultRegistry = null;
}

export function createFeatureProviderRegistry(
  options?: ProviderRegistryOptions
): FeatureProviderRegistry {
  return new FeatureProviderRegistry(createProviderCacheManager(), options);
}

function toHybridRequest<K extends FeatureProviderKey>(
  providerKey: K,
  request: ProviderRequestByKey[K]
): { homeTeam: string; awayTeam: string; matchDate?: string; leagueName?: string } | null {
  if (providerKey === "leagueStrength") {
    const leagueRequest = request as ProviderRequestByKey["leagueStrength"];
    return {
      homeTeam: "",
      awayTeam: "",
      leagueName: leagueRequest.leagueName,
    };
  }

  const teamRequest = request as ProviderRequestByKey["recentForm"];
  return {
    homeTeam: teamRequest.homeTeam,
    awayTeam: teamRequest.awayTeam,
    matchDate: teamRequest.matchDate,
  };
}
