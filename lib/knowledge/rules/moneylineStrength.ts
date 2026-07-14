/**
 * Moneyline 主勝賠率強度規則表。
 * 僅依主勝 decimal odds 對照，不含其他判斷。
 */

export enum MoneylineStrength {
  SUPER_HEAVY_FAVORITE = "SUPER_HEAVY_FAVORITE",
  HEAVY_FAVORITE = "HEAVY_FAVORITE",
  FAVORITE = "FAVORITE",
  SLIGHT_FAVORITE = "SLIGHT_FAVORITE",
  BALANCED = "BALANCED",
  UNDERDOG = "UNDERDOG",
  HEAVY_UNDERDOG = "HEAVY_UNDERDOG",
}

/** 主勝賠率上限 → 強度（依序對照，第一個符合者生效） */
export const MONEYLINE_STRENGTH_RULES: ReadonlyArray<{
  readonly maxHomeWinOdds: number;
  readonly strength: MoneylineStrength;
}> = [
  { maxHomeWinOdds: 1.2, strength: MoneylineStrength.SUPER_HEAVY_FAVORITE },
  { maxHomeWinOdds: 1.4, strength: MoneylineStrength.HEAVY_FAVORITE },
  { maxHomeWinOdds: 1.7, strength: MoneylineStrength.FAVORITE },
  { maxHomeWinOdds: 2.1, strength: MoneylineStrength.SLIGHT_FAVORITE },
  { maxHomeWinOdds: 2.8, strength: MoneylineStrength.BALANCED },
  { maxHomeWinOdds: 4.0, strength: MoneylineStrength.UNDERDOG },
] as const;

/**
 * 依主勝賠率回傳 MoneylineStrength。
 * 規則：
 *   <=1.20  SUPER_HEAVY_FAVORITE
 *   1.21~1.40  HEAVY_FAVORITE
 *   1.41~1.70  FAVORITE
 *   1.71~2.10  SLIGHT_FAVORITE
 *   2.11~2.80  BALANCED
 *   2.81~4.00  UNDERDOG
 *   >4.00  HEAVY_UNDERDOG
 */
export function getMoneylineStrength(homeWinOdds: number): MoneylineStrength {
  const rule = MONEYLINE_STRENGTH_RULES.find(
    (entry) => homeWinOdds <= entry.maxHomeWinOdds
  );
  return rule?.strength ?? MoneylineStrength.HEAVY_UNDERDOG;
}
