import { MemoryProviderCache } from "@/lib/providers/registry/cache/memoryProviderCache";
import { SupabaseProviderCache } from "@/lib/providers/registry/cache/supabaseProviderCache";
import { createTimestamps } from "@/lib/providers/registry/cacheKey";
import type {
  CachedProviderPayload,
  ProviderDataSource,
  ProviderResponse,
} from "@/lib/providers/registry/types";
import { DEFAULT_MEMORY_TTL_MS, DEFAULT_SUPABASE_TTL_MS } from "@/lib/providers/registry/types";

export class ProviderCacheManager {
  constructor(
    private readonly memoryCache = new MemoryProviderCache(),
    private readonly supabaseCache = new SupabaseProviderCache(),
    private readonly memoryTtlMs = DEFAULT_MEMORY_TTL_MS,
    private readonly supabaseTtlMs = DEFAULT_SUPABASE_TTL_MS
  ) {}

  getMemory<T>(cacheKey: string): ProviderResponse<T> | null {
    return this.memoryCache.get<T>(cacheKey);
  }

  async getSupabase<T>(cacheKey: string): Promise<ProviderResponse<T> | null> {
    const cached = await this.supabaseCache.get<T>(cacheKey);
    if (cached) {
      this.memoryCache.set(cacheKey, toCachedPayload(cached, this.memoryTtlMs));
    }
    return cached;
  }

  remember<T>(
    cacheKey: string,
    response: ProviderResponse<T>,
    originSource: Exclude<ProviderDataSource, "cache">
  ): void {
    const memoryPayload = toCachedPayload(
      {
        ...response,
        source: originSource,
      },
      this.memoryTtlMs
    );
    this.memoryCache.set(cacheKey, memoryPayload);

    void this.supabaseCache.set(
      cacheKey,
      toCachedPayload(
        {
          ...response,
          source: originSource,
        },
        this.supabaseTtlMs
      )
    );
  }

  clear(): void {
    this.memoryCache.clear();
  }
}

function toCachedPayload<T>(
  response: ProviderResponse<T>,
  ttlMs: number
): CachedProviderPayload<T> {
  const timestamps =
    response.source === "cache"
      ? {
          fetchedAt: response.fetchedAt,
          expiresAt: response.expiresAt,
        }
      : createTimestamps(ttlMs);

  const originSource: Exclude<ProviderDataSource, "cache"> =
    response.source === "cache" ? "mock" : response.source;

  return {
    data: response.data,
    source: originSource,
    fetchedAt: timestamps.fetchedAt,
    expiresAt: timestamps.expiresAt,
    confidence: response.confidence,
    warnings: response.warnings,
  };
}

export function createProviderCacheManager(): ProviderCacheManager {
  return new ProviderCacheManager();
}
