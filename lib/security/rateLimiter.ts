import { hashClientIdentity } from "@/lib/security/cryptoUtils";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export interface RateLimitConfig {
  routeKey: string;
  windowMs: number;
  maxRequests: number;
}

export type RateLimitDecision = "allow" | "deny";

export interface RateLimitAdapter {
  checkAndIncrement(bucketKey: string, config: RateLimitConfig): Promise<RateLimitDecision>;
  resetForTests?(): void;
}

const memoryBuckets = new Map<
  string,
  {
    count: number;
    windowStartedAt: number;
  }
>();

class MemoryRateLimitAdapter implements RateLimitAdapter {
  async checkAndIncrement(
    bucketKey: string,
    config: RateLimitConfig
  ): Promise<RateLimitDecision> {
    const now = Date.now();
    const existing = memoryBuckets.get(bucketKey);

    if (!existing || now - existing.windowStartedAt >= config.windowMs) {
      memoryBuckets.set(bucketKey, { count: 1, windowStartedAt: now });
      return "allow";
    }

    if (existing.count >= config.maxRequests) {
      return "deny";
    }

    existing.count += 1;
    memoryBuckets.set(bucketKey, existing);
    return "allow";
  }

  resetForTests(): void {
    memoryBuckets.clear();
  }
}

class SupabaseRateLimitAdapter implements RateLimitAdapter {
  async checkAndIncrement(
    bucketKey: string,
    config: RateLimitConfig
  ): Promise<RateLimitDecision> {
    try {
      if (typeof window !== "undefined") {
        return "deny";
      }

      const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
      const supabase = getSupabaseAdmin();
      const now = new Date();
      const nowIso = now.toISOString();

      const existing = await supabase
        .from("security_rate_limit_buckets" as "match_records")
        .select("bucket_key,request_count,window_started_at")
        .eq("bucket_key", bucketKey)
        .maybeSingle();

      if (existing.error) {
        return "deny";
      }

      const row = existing.data as unknown as {
        bucket_key: string;
        request_count: number;
        window_started_at: string;
      } | null;

      if (!row) {
        const insertResult = await supabase
          .from("security_rate_limit_buckets" as "match_records")
          .insert({
            bucket_key: bucketKey,
            request_count: 1,
            window_started_at: nowIso,
            updated_at: nowIso,
          } as never);

        return insertResult.error ? "deny" : "allow";
      }

      const windowStartedAt = new Date(row.window_started_at).getTime();
      const windowExpired = now.getTime() - windowStartedAt >= config.windowMs;

      if (windowExpired) {
        const updateResult = await supabase
          .from("security_rate_limit_buckets" as "match_records")
          .update({
            request_count: 1,
            window_started_at: nowIso,
            updated_at: nowIso,
          } as never)
          .eq("bucket_key", bucketKey);

        return updateResult.error ? "deny" : "allow";
      }

      if (row.request_count >= config.maxRequests) {
        return "deny";
      }

      const incrementResult = await supabase
        .from("security_rate_limit_buckets" as "match_records")
        .update({
          request_count: row.request_count + 1,
          updated_at: nowIso,
        } as never)
        .eq("bucket_key", bucketKey);

      return incrementResult.error ? "deny" : "allow";
    } catch {
      return "deny";
    }
  }
}

let adapterOverride: RateLimitAdapter | null = null;
const memoryAdapter = new MemoryRateLimitAdapter();
const supabaseAdapter = new SupabaseRateLimitAdapter();

export function getRateLimitAdapter(): RateLimitAdapter {
  if (adapterOverride) {
    return adapterOverride;
  }

  if (process.env.RATE_LIMIT_ADAPTER === "memory" || process.env.NODE_ENV === "test") {
    return memoryAdapter;
  }

  if (hasSupabaseEnv()) {
    return supabaseAdapter;
  }

  return supabaseAdapter;
}

export function setRateLimitAdapterForTests(adapter: RateLimitAdapter | null): void {
  adapterOverride = adapter;
}

export function resetRateLimitForTests(): void {
  memoryAdapter.resetForTests?.();
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function buildRateLimitBucketKey(routeKey: string, request: Request): string {
  const ip = getClientIp(request);
  return `${routeKey}:${hashClientIdentity(ip)}`;
}

export async function checkRateLimit(
  request: Request,
  config: RateLimitConfig
): Promise<RateLimitDecision> {
  const bucketKey = buildRateLimitBucketKey(config.routeKey, request);
  return getRateLimitAdapter().checkAndIncrement(bucketKey, config);
}

export const RATE_LIMIT_PRESETS = {
  teamData: {
    routeKey: "api:football:team-data",
    windowMs: 60_000,
    maxRequests: 10,
  },
  dataImport: {
    routeKey: "api:data:import",
    windowMs: 60_000,
    maxRequests: 5,
  },
  adminCron: {
    routeKey: "api:admin:cron",
    windowMs: 60_000,
    maxRequests: 10,
  },
  adminRepair: {
    routeKey: "api:admin:repair",
    windowMs: 60_000,
    maxRequests: 5,
  },
  weightConfigAdmin: {
    routeKey: "api:admin:weight-config",
    windowMs: 60_000,
    maxRequests: 10,
  },
} as const satisfies Record<string, RateLimitConfig>;
