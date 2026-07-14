import {
  getMoneylineStrength,
  MoneylineStrength,
} from "@/lib/knowledge/rules/moneylineStrength";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

export function runMoneylineStrengthTests(): void {
  const cases: Array<{ homeWinOdds: number; expected: MoneylineStrength }> = [
    { homeWinOdds: 1.18, expected: MoneylineStrength.SUPER_HEAVY_FAVORITE },
    { homeWinOdds: 1.35, expected: MoneylineStrength.HEAVY_FAVORITE },
    { homeWinOdds: 1.55, expected: MoneylineStrength.FAVORITE },
    { homeWinOdds: 1.95, expected: MoneylineStrength.SLIGHT_FAVORITE },
    { homeWinOdds: 2.4, expected: MoneylineStrength.BALANCED },
    { homeWinOdds: 3.2, expected: MoneylineStrength.UNDERDOG },
    { homeWinOdds: 5.8, expected: MoneylineStrength.HEAVY_UNDERDOG },
  ];

  for (const { homeWinOdds, expected } of cases) {
    assertEqual(
      getMoneylineStrength(homeWinOdds),
      expected,
      `homeWinOdds=${homeWinOdds}`
    );
  }
}
