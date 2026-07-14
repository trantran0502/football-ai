/** 解析賠率數值（支援整數與小數）。 */
export function parseOddsNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const odds = Number(trimmed);
  if (!Number.isFinite(odds) || odds <= 0) {
    return null;
  }
  return odds;
}

/** 是否為賠率 token（非比分標籤）。 */
export function isOddsToken(value: string): boolean {
  return /^\d+(?:\.\d+)?$/.test(value.trim()) && parseOddsNumber(value) !== null;
}

export function normalizeMarketContent(content: string | string[]): string {
  return Array.isArray(content) ? content.join(" ") : content;
}

export function tokenizeMarketContent(content: string | string[]): string[] {
  return normalizeMarketContent(content).split(/\s+/).filter(Boolean);
}
