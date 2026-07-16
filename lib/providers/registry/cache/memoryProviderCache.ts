import type { CachedProviderPayload, ProviderResponse } from "@/lib/providers/registry/types";
import { isExpired } from "@/lib/providers/registry/cacheKey";

export class MemoryProviderCache {
  private readonly store = new Map<string, CachedProviderPayload<unknown>>();

  get<T>(cacheKey: string): ProviderResponse<T> | null {
    const entry = this.store.get(cacheKey);
    if (!entry || isExpired(entry.expiresAt)) {
      if (entry) {
        this.store.delete(cacheKey);
      }
      return null;
    }

    return {
      data: entry.data as T,
      source: "cache",
      originSource: entry.source,
      fetchedAt: entry.fetchedAt,
      expiresAt: entry.expiresAt,
      confidence: entry.confidence,
      warnings: entry.warnings,
    };
  }

  set<T>(cacheKey: string, payload: CachedProviderPayload<T>): void {
    this.store.set(cacheKey, payload);
  }

  delete(cacheKey: string): void {
    this.store.delete(cacheKey);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}
