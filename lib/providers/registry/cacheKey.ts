export function stableSerialize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = sortValue(record[key]);
        return accumulator;
      }, {});
  }
  return value;
}

export function buildProviderCacheKey(
  providerKey: string,
  request: unknown
): string {
  return `${providerKey}:${stableSerialize(request)}`;
}

export function createTimestamps(ttlMs: number): {
  fetchedAt: string;
  expiresAt: string;
} {
  const fetchedAtMs = Date.now();
  return {
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    expiresAt: new Date(fetchedAtMs + ttlMs).toISOString(),
  };
}

export function isExpired(expiresAt: string, nowMs = Date.now()): boolean {
  return nowMs >= new Date(expiresAt).getTime();
}
