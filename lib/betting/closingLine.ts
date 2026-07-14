import type {
  MarketOddsSnapshot,
  SelectionIntelligence,
} from "@/lib/betting/intelligenceTypes";

export function calculateClosingLineValue(input: {
  takenDecimalOdds: number;
  closingDecimalOdds: number;
}): number | null {
  if (
    !Number.isFinite(input.takenDecimalOdds) ||
    !Number.isFinite(input.closingDecimalOdds) ||
    input.takenDecimalOdds <= 0 ||
    input.closingDecimalOdds <= 0
  ) {
    return null;
  }
  return input.takenDecimalOdds / input.closingDecimalOdds - 1;
}

export function projectClosingLineValue(
  selection: Pick<
    SelectionIntelligence,
    "current" | "closing" | "lineMovement"
  >
): number | null {
  const taken = selection.current?.decimalOdds ?? null;
  const closing = selection.closing?.decimalOdds ?? null;
  if (taken === null || closing === null) {
    return null;
  }
  return calculateClosingLineValue({
    takenDecimalOdds: taken,
    closingDecimalOdds: closing,
  });
}

export function attachClosingLineValues(
  selections: SelectionIntelligence[]
): SelectionIntelligence[] {
  return selections.map((selection) => {
    const closingLineValue = projectClosingLineValue(selection);
    if (!selection.valueBet) {
      return selection;
    }
    return {
      ...selection,
      valueBet: {
        ...selection.valueBet,
        closingLineValue,
      },
    };
  });
}

export function averageClosingLineValue(
  selections: SelectionIntelligence[]
): number | null {
  const values = selections
    .map((selection) => selection.valueBet?.closingLineValue)
    .filter((value): value is number => value !== null && value !== undefined);
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarizeClosingOdds(
  opening: MarketOddsSnapshot | null,
  current: MarketOddsSnapshot | null,
  closing: MarketOddsSnapshot | null
): {
  openingDecimal: number | null;
  currentDecimal: number | null;
  closingDecimal: number | null;
} {
  return {
    openingDecimal: opening?.decimalOdds ?? null,
    currentDecimal: current?.decimalOdds ?? null,
    closingDecimal: closing?.decimalOdds ?? null,
  };
}
