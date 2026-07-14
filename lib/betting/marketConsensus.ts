import type {
  BookmakerId,
  BookmakerMarketQuotes,
  BookmakerSelectionQuote,
  MarketAnomalyFlag,
  MarketConsensusAnalysis,
  MarketConsensusStatus,
  MultiBookmakerInput,
  OddsMovementDirection,
  ReverseLineMovementAnalysis,
  SteamMoveAnalysis,
} from "@/lib/betting/intelligenceTypes";
function directionFromDelta(delta: number | null): OddsMovementDirection {
  if (delta === null) {
    return "unknown";
  }
  if (Math.abs(delta) <= 0.001) {
    return "stable";
  }
  return delta > 0 ? "up" : "down";
}

function resolveConsensusStatus(spread: number, sampleSize: number): MarketConsensusStatus {
  if (sampleSize < 2) {
    return "insufficient";
  }
  if (spread <= 0.015) {
    return "aligned";
  }
  if (spread >= 0.05) {
    return "divergent";
  }
  return spread >= 0.03 ? "divergent" : "aligned";
}

function resolveAnomalyFlags(input: {
  spread: number;
  averageImpliedProbability: number;
  steamDetected: boolean;
  reverseLineDetected: boolean;
}): MarketAnomalyFlag[] {
  const flags: MarketAnomalyFlag[] = [];
  if (input.steamDetected) {
    flags.push("steam_move");
  }
  if (input.reverseLineDetected) {
    flags.push("reverse_line_movement");
  }
  if (input.spread >= 0.06) {
    flags.push("trap_suspected");
  }
  if (input.averageImpliedProbability >= 0.72) {
    flags.push("overheated");
  }
  if (input.averageImpliedProbability <= 0.12) {
    flags.push("cold_longshot");
  }
  if (flags.length === 0) {
    flags.push("none");
  }
  return flags;
}

export function analyzeBookmakerConsensus(
  quotes: BookmakerSelectionQuote[]
): MarketConsensusAnalysis {
  if (quotes.length === 0) {
    return {
      status: "insufficient",
      spread: 0,
      averageImpliedProbability: 0,
      minBookmaker: null,
      maxBookmaker: null,
      anomalyFlags: ["none"],
      explanation: "No bookmaker quotes available.",
    };
  }

  const impliedValues = quotes.map((quote) => quote.impliedProbability);
  const min = Math.min(...impliedValues);
  const max = Math.max(...impliedValues);
  const spread = max - min;
  const averageImpliedProbability =
    impliedValues.reduce((sum, value) => sum + value, 0) / impliedValues.length;

  const minQuote = quotes.find((quote) => quote.impliedProbability === min) ?? null;
  const maxQuote = quotes.find((quote) => quote.impliedProbability === max) ?? null;

  const status = resolveConsensusStatus(spread, quotes.length);
  const anomalyFlags = resolveAnomalyFlags({
    spread,
    averageImpliedProbability,
    steamDetected: false,
    reverseLineDetected: false,
  });

  return {
    status,
    spread,
    averageImpliedProbability,
    minBookmaker: minQuote?.bookmakerId ?? null,
    maxBookmaker: maxQuote?.bookmakerId ?? null,
    anomalyFlags,
    explanation:
      status === "aligned"
        ? "Bookmakers are broadly aligned on this price."
        : status === "divergent"
          ? "Bookmakers disagree materially on implied probability."
          : "Not enough bookmaker sources to assess consensus.",
  };
}

export function findBookmakerQuotes(
  marketKey: string,
  multiBookmaker: MultiBookmakerInput | null | undefined
): BookmakerSelectionQuote[] {
  if (!multiBookmaker) {
    return [];
  }
  const market = multiBookmaker.markets.find((item) => item.marketKey === marketKey);
  return market?.selections ?? [];
}

export function detectSteamMove(input: {
  selections: Array<{
    marketKey: string;
    lineMovement: { direction: OddsMovementDirection; movementCount: number; priceDelta: number | null };
  }>;
  threshold?: number;
}): SteamMoveAnalysis {
  const threshold = input.threshold ?? 0.04;
  const affectedSelections: string[] = [];
  let strongestMagnitude = 0;
  let direction: OddsMovementDirection = "stable";

  for (const selection of input.selections) {
    const delta = selection.lineMovement.priceDelta;
    if (delta === null) {
      continue;
    }
    const magnitude = Math.abs(delta);
    if (magnitude >= threshold || selection.lineMovement.movementCount >= 2) {
      affectedSelections.push(selection.marketKey);
      if (magnitude > strongestMagnitude) {
        strongestMagnitude = magnitude;
        direction = selection.lineMovement.direction;
      }
    }
  }

  return {
    detected: affectedSelections.length > 0,
    direction,
    magnitude: strongestMagnitude,
    affectedSelections,
    explanation: affectedSelections.length
      ? `Steam move detected across ${affectedSelections.length} selection(s).`
      : "No steam move detected.",
  };
}

export function detectReverseLineMovement(input: {
  lineDirection: OddsMovementDirection;
  priceDirection: OddsMovementDirection;
}): ReverseLineMovementAnalysis {
  const detected =
    input.lineDirection !== "unknown" &&
    input.priceDirection !== "unknown" &&
    input.lineDirection !== input.priceDirection &&
    input.lineDirection !== "stable" &&
    input.priceDirection !== "stable";

  return {
    detected,
    lineDirection: input.lineDirection,
    priceDirection: input.priceDirection,
    explanation: detected
      ? "Line moved one way while price moved the opposite direction."
      : "No reverse line movement detected.",
  };
}

export function buildMultiBookmakerMarkets(
  input: MultiBookmakerInput | null | undefined
): BookmakerMarketQuotes[] {
  return input?.markets ?? [];
}

export function pickBestBookmaker(
  quotesByMarket: Map<string, BookmakerSelectionQuote[]>
): BookmakerId | null {
  let bestBookmaker: BookmakerId | null = null;
  let bestAverage = -Infinity;

  const totals = new Map<BookmakerId, { sum: number; count: number }>();
  for (const quotes of quotesByMarket.values()) {
    for (const quote of quotes) {
      const current = totals.get(quote.bookmakerId) ?? { sum: 0, count: 0 };
      current.sum += quote.decimalOdds;
      current.count += 1;
      totals.set(quote.bookmakerId, current);
    }
  }

  for (const [bookmakerId, total] of totals.entries()) {
    const average = total.count > 0 ? total.sum / total.count : 0;
    if (average > bestAverage) {
      bestAverage = average;
      bestBookmaker = bookmakerId;
    }
  }

  return bestBookmaker;
}

export function enrichConsensusWithSignals(
  consensus: MarketConsensusAnalysis,
  steamDetected: boolean,
  reverseLineDetected: boolean
): MarketConsensusAnalysis {
  return {
    ...consensus,
    anomalyFlags: resolveAnomalyFlags({
      spread: consensus.spread,
      averageImpliedProbability: consensus.averageImpliedProbability,
      steamDetected,
      reverseLineDetected,
    }),
  };
}

export function compareLineAndPriceDirection(input: {
  lineDelta: number | null;
  priceDelta: number | null;
}): ReverseLineMovementAnalysis {
  return detectReverseLineMovement({
    lineDirection: directionFromDelta(input.lineDelta),
    priceDirection: directionFromDelta(input.priceDelta),
  });
}
