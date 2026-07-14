import { createTimestamps, isExpired } from "@/lib/providers/registry/cacheKey";
import type {
  ApiFootballCacheCategory,
  ApiFootballCachedPayload,
} from "@/lib/providers/apiFootball/apiFootballTypes";
import { API_FOOTBALL_CACHE_TTL_MS } from "@/lib/providers/apiFootball/apiFootballTypes";

const SUPABASE_API_CACHE_TABLE = "feature_provider_cache";

export class ApiFootballCacheStore {
  private readonly memory = new Map<string, ApiFootballCachedPayload<unknown>>();

  getSync<T>(cacheKey: string): T | null {
    const entry = this.memory.get(cacheKey);
    if (!entry || isExpired(entry.expiresAt)) {
      if (entry) {
        this.memory.delete(cacheKey);
      }
      return null;
    }
    return entry.data as T;
  }

  async get<T>(cacheKey: string): Promise<T | null> {
    const memoryHit = this.getSync<T>(cacheKey);
    if (memoryHit !== null) {
      return memoryHit;
    }

    try {
      if (typeof window !== "undefined") {
        return null;
      }

      const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
      const supabase = getSupabaseAdmin();
      const result = await supabase
        .from(SUPABASE_API_CACHE_TABLE as "match_records")
        .select("cache_key,payload,expires_at")
        .eq("cache_key", cacheKey)
        .maybeSingle();

      if (result.error || !result.data) {
        return null;
      }

      const row = result.data as unknown as {
        payload: ApiFootballCachedPayload<unknown>;
        expires_at: string;
      };

      if (isExpired(row.expires_at)) {
        return null;
      }

      this.memory.set(cacheKey, {
        ...row.payload,
        expiresAt: row.expires_at,
      });
      return row.payload.data as T;
    } catch {
      return null;
    }
  }

  set<T>(
    cacheKey: string,
    category: ApiFootballCacheCategory,
    data: T
  ): ApiFootballCachedPayload<T> {
    const timestamps = createTimestamps(API_FOOTBALL_CACHE_TTL_MS[category]);
    const payload: ApiFootballCachedPayload<T> = {
      data,
      fetchedAt: timestamps.fetchedAt,
      expiresAt: timestamps.expiresAt,
      category,
    };
    this.memory.set(cacheKey, payload);
    void this.writeSupabase(cacheKey, payload);
    return payload;
  }

  clear(): void {
    this.memory.clear();
  }

  private async writeSupabase<T>(
    cacheKey: string,
    payload: ApiFootballCachedPayload<T>
  ): Promise<void> {
    try {
      if (typeof window !== "undefined") {
        return;
      }

      const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
      const supabase = getSupabaseAdmin();
      await supabase.from(SUPABASE_API_CACHE_TABLE as "match_records").upsert({
        cache_key: cacheKey,
        payload,
        expires_at: payload.expiresAt,
      } as never);
    } catch {
      // Fail closed — cache write must not break API flow.
    }
  }
}

let defaultStore: ApiFootballCacheStore | null = null;

export function getApiFootballCacheStore(): ApiFootballCacheStore {
  if (!defaultStore) {
    defaultStore = new ApiFootballCacheStore();
  }
  return defaultStore;
}

export function resetApiFootballCacheStoreForTests(): void {
  defaultStore?.clear();
  defaultStore = null;
}

export function buildApiFootballCacheKey(
  category: ApiFootballCacheCategory,
  parts: Record<string, string | number | undefined>
): string {
  const serialized = Object.keys(parts)
    .sort()
    .map((key) => `${key}=${parts[key] ?? ""}`)
    .join("&");
  return `api-football:${category}:${serialized}`;
}
