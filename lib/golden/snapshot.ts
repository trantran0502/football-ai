import { generateCandidates } from "@/lib/analysis/candidateGenerator";
import { validateCrossMarkets } from "@/lib/analysis/crossMarketValidator";
import { buildAnalysisFeatures } from "@/lib/analysis/featureBuilder";
import { interpretMarkets } from "@/lib/analysis/marketInterpreter";
import type {
  GoldenExpectedAnalysis,
  GoldenExpectedCandidates,
  GoldenExpectedParser,
  GoldenInterpretationSnapshot,
  GoldenMarketSnapshot,
  GoldenMatchResult,
} from "@/lib/golden/types";
import { resolveWinner } from "@/lib/database/matchSchema";
import { normalizeMarketSelections } from "@/lib/parser/normalizeMarketSelections";
import { parseOdds } from "@/lib/parser/parser";
import type { MarketSelection } from "@/types/match";

const PROBABILITY_PRECISION = 6;

function normalizeNumeric(value: number | null): number | null {
  if (value === null) {
    return null;
  }
  return value === 0 ? 0 : value;
}

function roundNumber(value: number, precision = PROBABILITY_PRECISION): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function compareMarketSnapshots(
  left: GoldenMarketSnapshot,
  right: GoldenMarketSnapshot
): number {
  return (
    left.marketType.localeCompare(right.marketType) ||
    left.title.localeCompare(right.title) ||
    left.period.localeCompare(right.period) ||
    left.side.localeCompare(right.side) ||
    String(left.rawLine ?? "").localeCompare(String(right.rawLine ?? ""))
  );
}

function compareInterpretationSnapshots(
  left: GoldenInterpretationSnapshot,
  right: GoldenInterpretationSnapshot
): number {
  return (
    left.kind.localeCompare(right.kind) ||
    left.marketId.localeCompare(right.marketId) ||
    left.title.localeCompare(right.title) ||
    left.period.localeCompare(right.period)
  );
}

export function snapshotMarket(selection: MarketSelection): GoldenMarketSnapshot {
  return {
    marketType: selection.marketType,
    marketFamily: selection.marketFamily,
    title: selection.title,
    period: selection.period,
    side: selection.side,
    rawLine: selection.rawLine,
    line: normalizeNumeric(selection.line),
    modifier: selection.modifier,
    odds: selection.odds,
    handicap: normalizeNumeric(selection.handicap ?? null),
    label: selection.label ?? null,
    impliedProbability:
      selection.impliedProbability !== undefined
        ? roundNumber(selection.impliedProbability)
        : null,
  };
}

export function buildParserSnapshot(
  rawOdds: string
): GoldenExpectedParser {
  const match = parseOdds(rawOdds);
  const markets = normalizeMarketSelections(match.marketSelections);

  return {
    league: match.league,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    marketCount: markets.length,
    unknownMarketCount: match.unknownMarkets.length,
    markets: markets.map(snapshotMarket).sort(compareMarketSnapshots),
  };
}

export function buildAnalysisSnapshot(rawOdds: string): GoldenExpectedAnalysis {
  const match = parseOdds(rawOdds);
  const markets = normalizeMarketSelections(match.marketSelections);
  const features = buildAnalysisFeatures(markets);
  const interpretations = interpretMarkets(features);
  const validation = validateCrossMarkets(markets);

  return {
    interpretationCount: interpretations.length,
    interpretations: interpretations
      .map((item) => ({
        kind: item.kind,
        marketId: item.marketId,
        marketType: item.marketType,
        title: item.title,
        period: item.period,
      }))
      .sort(compareInterpretationSnapshots),
    crossMarketValidation: validation,
  };
}

export function buildCandidateSnapshot(
  rawOdds: string
): GoldenExpectedCandidates {
  const match = parseOdds(rawOdds);
  const markets = normalizeMarketSelections(match.marketSelections);
  const features = buildAnalysisFeatures(markets);
  const interpretations = interpretMarkets(features);
  const validation = validateCrossMarkets(markets);
  return generateCandidates(features, interpretations, validation);
}

export function buildGoldenMatchResult(input: {
  fullTimeHomeGoals: number;
  fullTimeAwayGoals: number;
  halfTimeHomeGoals: number;
  halfTimeAwayGoals: number;
}): GoldenMatchResult {
  const totalGoals = input.fullTimeHomeGoals + input.fullTimeAwayGoals;

  return {
    ...input,
    winner: resolveWinner(input.fullTimeHomeGoals, input.fullTimeAwayGoals),
    totalGoals,
    bothTeamsScored:
      input.fullTimeHomeGoals > 0 && input.fullTimeAwayGoals > 0,
  };
}
