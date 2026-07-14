import type { CachedProviderPayload, ProviderResponse } from "@/lib/providers/registry/types";
import { isExpired } from "@/lib/providers/registry/cacheKey";

const SUPABASE_CACHE_TABLE = "feature_provider_cache";

interface SupabaseCacheRow {
  cache_key: string;
  payload: CachedProviderPayload<unknown>;
  expires_at: string;
}

/**
 * Optional Supabase-backed cache. Gracefully no-ops when Supabase or table is unavailable.
 * Does not require schema changes in this phase — reads/writes fail closed to null.
 */
export class SupabaseProviderCache {
  async get<T>(cacheKey: string): Promise<ProviderResponse<T> | null> {
    try {
      if (typeof window !== "undefined") {
        return null;
      }

      const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
      const supabase = getSupabaseAdmin();
      const result = await supabase
        .from(SUPABASE_CACHE_TABLE as "match_records")
        .select("cache_key,payload,expires_at")
        .eq("cache_key", cacheKey)
        .maybeSingle();

      if (result.error || !result.data) {
        return null;
      }

      const row = result.data as unknown as SupabaseCacheRow;
      if (isExpired(row.expires_at)) {
        return null;
      }

      return {
        data: row.payload.data as T,
        source: "cache",
        fetchedAt: row.payload.fetchedAt,
        expiresAt: row.expires_at,
        confidence: row.payload.confidence,
        warnings: row.payload.warnings,
      };
    } catch {
      return null;
    }
  }

  async set<T>(cacheKey: string, payload: CachedProviderPayload<T>): Promise<void> {
    try {
      if (typeof window !== "undefined") {
        return;
      }

      const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
      const supabase = getSupabaseAdmin();
      await supabase.from(SUPABASE_CACHE_TABLE as "match_records").upsert({
        cache_key: cacheKey,
        payload,
        expires_at: payload.expiresAt,
      } as never);
    } catch {
      // Cache write failures must not break provider resolution.
    }
  }
}

export function createSupabaseProviderCache(): SupabaseProviderCache {
  return new SupabaseProviderCache();
}
