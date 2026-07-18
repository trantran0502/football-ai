import {
  collectMarketOddsFeature,
  type MarketOddsFeatureMetadata,
} from "@/lib/analysis/featureScore/collectors/marketOddsCollector";
import type {
  EvidenceCollectorContext,
  EvidenceProviderOutcome,
} from "@/lib/evidence/v3/evidenceTypes";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveDirection(
  favorite: MarketOddsFeatureMetadata["favorite"]
): "home" | "away" | "draw" | "neutral" {
  if (favorite === "home" || favorite === "away" || favorite === "draw") {
    return favorite;
  }
  return "neutral";
}

function scoreFromMarketGap(
  marketGap: number,
  favorite: MarketOddsFeatureMetadata["favorite"]
): number {
  const magnitude = clamp(marketGap * 2, 0, 1);
  if (favorite === "away") {
    return -magnitude;
  }
  if (favorite === "draw") {
    return 0;
  }
  return magnitude;
}

export function collectOddsImpliedValueEvidence(
  context: EvidenceCollectorContext
): EvidenceProviderOutcome {
  try {
    const [feature] = collectMarketOddsFeature({
      marketSelections: context.marketSelections,
      metadata: {
        homeTeam: context.homeTeam,
        awayTeam: context.awayTeam,
        league: context.league,
      },
    });

    const metadata = feature.metadata as MarketOddsFeatureMetadata | undefined;
    const marketGap = metadata?.marketGap;
    const favorite = metadata?.favorite ?? "unknown";

    if (
      marketGap === null ||
      marketGap === undefined ||
      favorite === "unknown" ||
      feature.confidence <= 0
    ) {
      return { status: "missing" };
    }

    const capturedAt = context.collectedAt ?? new Date().toISOString();
    const direction = resolveDirection(favorite);

    return {
      status: "collected",
      result: {
        id: "ODDS_IMPLIED_VALUE",
        score: scoreFromMarketGap(marketGap, favorite),
        confidence: clamp(feature.confidence, 0, 1),
        reason: feature.reason,
        metadata: {
          category: "market",
          direction,
          source: {
            provider: "parser",
            resolutionChain: ["parser", "normalizeMarketSelections"],
          },
          capturedAt,
          marketType: "moneyline",
          rawMetrics: {
            marketGap,
            favoriteProbability: metadata?.favoriteProbability ?? 0,
          },
        },
      },
    };
  } catch {
    return { status: "missing" };
  }
}
