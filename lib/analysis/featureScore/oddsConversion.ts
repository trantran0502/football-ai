/** Detected odds format for a single raw price. */
export type SingleOddsFormat = "decimal" | "hong_kong" | "unknown";

/** Aggregated odds format across multiple selections. */
export type MarketOddsFormat = "decimal" | "hong_kong" | "mixed" | "unknown";

export interface ConvertedOdds {
  rawOdds: number;
  decimalOdds: number;
  impliedProbability: number;
  format: SingleOddsFormat;
}

const DECIMAL_MIN = 1.01;

/**
 * Infer format from a raw odds value.
 * - >= 1.01 → decimal (European)
 * - (0, 1.01) → Hong Kong / Asian water
 */
export function inferSingleOddsFormat(rawOdds: number): SingleOddsFormat {
  if (!Number.isFinite(rawOdds) || rawOdds <= 0) {
    return "unknown";
  }
  if (rawOdds >= DECIMAL_MIN) {
    return "decimal";
  }
  if (rawOdds > 0 && rawOdds < DECIMAL_MIN) {
    return "hong_kong";
  }
  return "unknown";
}

/**
 * Convert raw odds to decimal odds and implied probability.
 * Hong Kong: decimalOdds = hongKongOdds + 1
 * Decimal:   decimalOdds = rawOdds (when >= 1.01)
 *
 * Never returns impliedProbability > 1.
 */
export function convertRawOdds(rawOdds: number): ConvertedOdds | null {
  const format = inferSingleOddsFormat(rawOdds);
  if (format === "unknown") {
    return null;
  }

  const decimalOdds =
    format === "hong_kong" ? rawOdds + 1 : rawOdds;

  if (!Number.isFinite(decimalOdds) || decimalOdds < DECIMAL_MIN) {
    return null;
  }

  const impliedProbability = clampImpliedProbability(1 / decimalOdds);
  if (!Number.isFinite(impliedProbability) || impliedProbability > 1) {
    return null;
  }

  return {
    rawOdds,
    decimalOdds,
    impliedProbability,
    format,
  };
}

/** Clamp implied probability to [0, 1]. */
export function clampImpliedProbability(probability: number): number {
  if (!Number.isFinite(probability)) {
    return 0;
  }
  return Math.min(1, Math.max(0, probability));
}

/** Convert already-normalized decimal odds (>= 1.01) to implied probability. */
export function impliedProbabilityFromDecimalOdds(
  decimalOdds: number
): number | null {
  if (!Number.isFinite(decimalOdds) || decimalOdds < DECIMAL_MIN) {
    return null;
  }

  const impliedProbability = clampImpliedProbability(1 / decimalOdds);
  if (impliedProbability > 1) {
    return null;
  }

  return impliedProbability;
}

/** Standard entry point: raw odds → implied probability in [0, 1]. */
export function convertRawOddsToImpliedProbability(
  rawOdds: number
): number | null {
  return convertRawOdds(rawOdds)?.impliedProbability ?? null;
}

export function aggregateOddsFormat(formats: SingleOddsFormat[]): MarketOddsFormat {
  const meaningful = formats.filter((format) => format !== "unknown");
  if (meaningful.length === 0) {
    return "unknown";
  }

  const unique = new Set(meaningful);
  if (unique.size === 1) {
    return meaningful[0] === "hong_kong" ? "hong_kong" : "decimal";
  }
  return "mixed";
}

export function clampScore(score: number): number {
  return Math.min(100, Math.max(-100, score));
}

export function clampConfidence(confidence: number): number {
  return Math.min(1, Math.max(0, confidence));
}
