import type { ImpliedProbability } from "@/lib/knowledge/odds/types";

/**
 * 將 Decimal Odds 換算為隱含機率。
 * 公式：impliedProbability = 1 / decimalOdds
 * 僅做數學換算，不含分析。
 */
export function calculateImpliedProbability(
  decimalOdds: number
): ImpliedProbability | null {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 0) {
    return null;
  }
  return 1 / decimalOdds;
}
