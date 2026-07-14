import { impliedProbabilityFromDecimalOdds } from "@/lib/analysis/featureScore/oddsConversion";
import type { ImpliedProbability } from "@/lib/knowledge/odds/types";

/**
 * 將 Decimal Odds（>= 1.01）換算為隱含機率（0～1）。
 * 原始賠率請改用 convertRawOddsToImpliedProbability。
 */
export function calculateImpliedProbability(
  decimalOdds: number
): ImpliedProbability | null {
  return impliedProbabilityFromDecimalOdds(decimalOdds);
}
