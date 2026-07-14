import {
  GOOGLE_CACHE_TTL_MS,
  type GoogleCacheCategory,
  type GoogleSearchCachedRecord,
} from "@/lib/providers/googleSearch/googleSearchTypes";
import { isExpired } from "@/lib/providers/registry/cacheKey";

const SUPABASE_CACHE_TABLE = "feature_provider_cache";

export function buildCategoryExpiresAt(
  searchTime: string
): Record<GoogleCacheCategory, string> {
  const base = Date.parse(searchTime);
  const toIso = (category: GoogleCacheCategory) =>
    new Date(base + GOOGLE_CACHE_TTL_MS[category]).toISOString();

  return {
    news: toIso("news"),
    injuries: toIso("injuries"),
    weather: toIso("weather"),
    recentForm: toIso("recentForm"),
    h2h: toIso("h2h"),
  };
}

export function resolveBundleExpiresAt(
  categoryExpiresAt: Record<GoogleCacheCategory, string>
): string {
  return Object.values(categoryExpiresAt).sort()[0];
}

export function isGoogleCacheExpired(record: GoogleSearchCachedRecord): boolean {
  return isExpired(record.expiresAt);
}

export async function readGoogleSearchSupabaseCache(
  cacheKey: string
): Promise<GoogleSearchCachedRecord | null> {
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

    const row = result.data as unknown as {
      payload: GoogleSearchCachedRecord;
      expires_at: string;
    };

    const record = {
      ...row.payload,
      expiresAt: row.expires_at,
    };

    if (isGoogleCacheExpired(record)) {
      return null;
    }

    return record;
  } catch {
    return null;
  }
}

export async function writeGoogleSearchSupabaseCache(
  cacheKey: string,
  record: GoogleSearchCachedRecord
): Promise<void> {
  try {
    if (typeof window !== "undefined") {
      return;
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    await supabase.from(SUPABASE_CACHE_TABLE as "match_records").upsert({
      cache_key: cacheKey,
      payload: record,
      expires_at: record.expiresAt,
    } as never);
  } catch {
    // Fail closed — cache write must not break live fetch.
  }
}

export function resetGoogleSearchSupabaseCacheForTests(): void {
  // Supabase is external; tests use memory cache only.
}
