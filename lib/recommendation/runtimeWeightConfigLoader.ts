import { logAdminError } from "@/lib/admin/adminErrorLog";
import { buildProductionBaselineWeightConfig } from "@/lib/recommendation/productionWeightConfig";
import type {
  DecisionRuntimeWeights,
  LoadedRuntimeWeightConfig,
  RuntimeWeightConfig,
} from "@/lib/recommendation/weightConfigTypes";
import { getActiveWeightConfig } from "@/lib/supabase/services/weightConfigService";

const CACHE_KEY = "active-runtime-weight-config";
const DEFAULT_CACHE_TTL_MS = 60_000;

interface RuntimeWeightConfigCacheEntry {
  key: typeof CACHE_KEY;
  runtimeWeightConfig: LoadedRuntimeWeightConfig;
  loadedAt: string;
  expiresAt: number;
}

let runtimeWeightConfigCache: RuntimeWeightConfigCacheEntry | null = null;

export type ActiveWeightConfigVersionIdCheck =
  | { status: "ok"; activeVersionId: string | null }
  | { status: "failed" };

export interface RuntimeWeightConfigLoaderDeps {
  getActiveWeightConfig?: typeof getActiveWeightConfig;
  getActiveWeightConfigVersionId?: () => Promise<ActiveWeightConfigVersionIdCheck>;
  now?: () => number;
}

function isDbWeightConfigEnabled(): boolean {
  const value = process.env.USE_DB_WEIGHT_CONFIG?.trim().toLowerCase();
  return value !== "false" && value !== "0" && value !== "no";
}

function resolveCacheTtlMs(): number {
  const raw = process.env.WEIGHT_CONFIG_CACHE_TTL_MS?.trim();
  if (!raw) {
    return DEFAULT_CACHE_TTL_MS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_CACHE_TTL_MS;
  }

  return parsed;
}

function toLoadedRuntimeWeightConfig(
  config: RuntimeWeightConfig,
  loadedAt: string
): LoadedRuntimeWeightConfig {
  return {
    providerWeights: { ...config.providerWeights },
    marketBlendWeight: config.marketBlendWeight,
    ...(config.decision ? { decision: { ...config.decision, evidenceWeights: { ...config.decision.evidenceWeights } } } : {}),
    source: config.source,
    activeVersion: config.activeVersion ? { ...config.activeVersion } : null,
    loadedAt,
  };
}

function buildLoadedFallback(nowMs: number): LoadedRuntimeWeightConfig {
  return toLoadedRuntimeWeightConfig(
    buildProductionBaselineWeightConfig(new Date(nowMs)),
    new Date(nowMs).toISOString()
  );
}

function readValidCache(nowMs: number): LoadedRuntimeWeightConfig | null {
  if (!runtimeWeightConfigCache || runtimeWeightConfigCache.key !== CACHE_KEY) {
    return null;
  }

  if (runtimeWeightConfigCache.expiresAt <= nowMs) {
    return null;
  }

  return runtimeWeightConfigCache.runtimeWeightConfig;
}

function writeCache(
  config: LoadedRuntimeWeightConfig,
  nowMs: number,
  ttlMs: number
): void {
  if (ttlMs <= 0) {
    runtimeWeightConfigCache = null;
    return;
  }

  runtimeWeightConfigCache = {
    key: CACHE_KEY,
    runtimeWeightConfig: config,
    loadedAt: config.loadedAt,
    expiresAt: nowMs + ttlMs,
  };
}

function logWeightConfigFallback(error: unknown): void {
  const message =
    error instanceof Error ? error.message : "Unknown weight config load failure.";

  logAdminError({
    category: "scheduler",
    message: "Weight config fallback applied for production recommendation runtime.",
    context: {
      cacheKey: CACHE_KEY,
      reason: message,
    },
  });
}

async function fetchActiveWeightConfigVersionId(): Promise<ActiveWeightConfigVersionIdCheck> {
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    const result = await supabase
      .from("weight_config_versions")
      .select("id")
      .eq("status", "active")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (result.error) {
      return { status: "failed" };
    }

    const data = result.data as { id: string } | null;
    return { status: "ok", activeVersionId: data?.id ?? null };
  } catch {
    return { status: "failed" };
  }
}

async function loadFreshRuntimeWeightConfig(
  deps: RuntimeWeightConfigLoaderDeps,
  nowMs: number,
  cacheTtlMs: number
): Promise<LoadedRuntimeWeightConfig> {
  try {
    const getActive = deps.getActiveWeightConfig ?? getActiveWeightConfig;
    const config = await getActive();
    const loaded = toLoadedRuntimeWeightConfig(config, new Date(nowMs).toISOString());
    writeCache(loaded, nowMs, cacheTtlMs);
    return loaded;
  } catch (error) {
    logWeightConfigFallback(error);
    const fallback = buildLoadedFallback(nowMs);
    writeCache(fallback, nowMs, cacheTtlMs);
    return fallback;
  }
}

async function resolveCachedRuntimeWeightConfig(
  cached: LoadedRuntimeWeightConfig,
  deps: RuntimeWeightConfigLoaderDeps,
  nowMs: number,
  cacheTtlMs: number
): Promise<LoadedRuntimeWeightConfig> {
  const checkVersionId =
    deps.getActiveWeightConfigVersionId ?? fetchActiveWeightConfigVersionId;

  try {
    const check = await checkVersionId();
    if (check.status === "failed") {
      return cached;
    }

    const cachedVersionId = cached.activeVersion?.id ?? null;
    if (check.activeVersionId === cachedVersionId) {
      return cached;
    }

    invalidateRuntimeWeightConfigCache();
    return loadFreshRuntimeWeightConfig(deps, nowMs, cacheTtlMs);
  } catch {
    return cached;
  }
}

export function invalidateRuntimeWeightConfigCache(): void {
  runtimeWeightConfigCache = null;
}

export function resetRuntimeWeightConfigCacheForTests(): void {
  runtimeWeightConfigCache = null;
}

export async function loadRuntimeWeightConfigForProduction(
  deps: RuntimeWeightConfigLoaderDeps = {}
): Promise<LoadedRuntimeWeightConfig> {
  const now = deps.now ?? (() => Date.now());
  const nowMs = now();
  const cacheTtlMs = resolveCacheTtlMs();

  if (!isDbWeightConfigEnabled()) {
    return buildLoadedFallback(nowMs);
  }

  const cached = readValidCache(nowMs);
  if (cached) {
    return resolveCachedRuntimeWeightConfig(cached, deps, nowMs, cacheTtlMs);
  }

  return loadFreshRuntimeWeightConfig(deps, nowMs, cacheTtlMs);
}
