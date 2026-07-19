import { HOME_AWAY_FEATURE_IDS } from "@/lib/analysis/featureScore/collectors/homeAwayCollector";
import { GOALS_XG_FEATURE_IDS } from "@/lib/analysis/featureScore/collectors/goalsXgCollector";
import { RECENT_FORM_FEATURE_IDS } from "@/lib/analysis/featureScore/collectors/recentFormCollector";
import type { FeatureFusionResult } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import { clampConfidence, clampScore } from "@/lib/analysis/featureScore/oddsConversion";
import type { FeatureScore } from "@/lib/analysis/featureScore/types";
import type { ProviderResolutionAudit } from "@/lib/providers/teamProfile/teamProfileProviderPipeline";
import { runMarketEngineForRecommendations } from "@/lib/recommendation/marketEngineIntegration";
import type { MarketAnalysisSnapshot } from "@/lib/recommendation/marketEngine/marketEngineTypes";
import type { MatchTeamProfilesSnapshot } from "@/lib/teamProfile/teamProfileTypes";
import type { MarketSelection } from "@/types/match";
import type { EvidenceCategory, EvidenceItem } from "@/lib/evidence/evidenceTypes";

const MIN_USABLE_CONFIDENCE = 0.2;

function normalizeMarketSideScore(finalScore: number): number {
  return clampScore((finalScore - 50) * 2);
}

function findFeature(
  features: FeatureScore[] | undefined,
  featureId: string
): FeatureScore | null {
  if (!features) {
    return null;
  }
  return features.find((feature) => feature.id === featureId) ?? null;
}

function getCategoryFusion(
  fusion: FeatureFusionResult,
  category: string
): { score: number; confidence: number; featureCount: number } | null {
  const match = fusion.categoryScores.find((entry) => entry.category === category);
  if (!match || match.featureCount === 0) {
    return null;
  }
  return {
    score: match.weightedScore,
    confidence: match.confidence,
    featureCount: match.featureCount,
  };
}

function resolveProviderSource(
  audit: ProviderResolutionAudit | null | undefined,
  providerKey: string
): string {
  if (!audit) {
    return "unknown";
  }
  const snapshot = audit.resolved.find((entry) => entry.key === providerKey);
  if (!snapshot) {
    return "unknown";
  }
  if (!snapshot.available) {
    return "unavailable";
  }
  return snapshot.sourceDetail
    ? `${snapshot.source}:${snapshot.sourceDetail}`
    : snapshot.source;
}

function buildEvidenceItem(input: {
  category: EvidenceCategory;
  score: number;
  confidence: number;
  source: string;
  summary: string;
  details: Record<string, unknown>;
}): EvidenceItem | null {
  if (input.confidence < MIN_USABLE_CONFIDENCE) {
    return null;
  }

  return {
    evidenceId: input.category,
    category: input.category,
    score: clampScore(input.score),
    confidence: clampConfidence(input.confidence),
    source: input.source,
    summary: input.summary,
    details: input.details,
  };
}

function buildFromFeature(
  category: EvidenceCategory,
  feature: FeatureScore | null,
  source: string,
  summaryOverride?: string
): EvidenceItem | null {
  if (!feature) {
    return null;
  }

  return buildEvidenceItem({
    category,
    score: feature.score ?? 0,
    confidence: feature.confidence,
    source,
    summary: summaryOverride ?? feature.reason,
    details: {
      featureId: feature.id,
      metadata: feature.metadata ?? {},
    },
  });
}

function buildFromFusionCategory(
  category: EvidenceCategory,
  fusionCategory: string,
  fusion: FeatureFusionResult,
  source: string,
  label: string
): EvidenceItem | null {
  const categoryFusion = getCategoryFusion(fusion, fusionCategory);
  if (!categoryFusion) {
    return null;
  }

  return buildEvidenceItem({
    category,
    score: categoryFusion.score,
    confidence: categoryFusion.confidence,
    source,
    summary: `${label} weighted score ${categoryFusion.score.toFixed(1)} from ${categoryFusion.featureCount} feature(s).`,
    details: {
      fusionCategory,
      featureCount: categoryFusion.featureCount,
      totalScore: categoryFusion.score,
    },
  });
}

export function collectMarketEngineEvidence(
  marketSelections: MarketSelection[],
  snapshot?: MarketAnalysisSnapshot
): EvidenceItem | null {
  const marketSnapshot = snapshot ?? runMarketEngineForRecommendations(marketSelections);
  if (marketSnapshot.markets.length === 0) {
    return null;
  }

  const totalConfidence = marketSnapshot.markets.reduce(
    (sum, market) => sum + market.confidence,
    0
  );
  const averageConfidence = totalConfidence / marketSnapshot.markets.length;
  const averageScore =
    marketSnapshot.markets.reduce(
      (sum, market) => sum + normalizeMarketSideScore(market.finalScore),
      0
    ) / marketSnapshot.markets.length;

  const dominantMarket = [...marketSnapshot.markets].sort(
    (left, right) => Math.abs(normalizeMarketSideScore(right.finalScore)) -
      Math.abs(normalizeMarketSideScore(left.finalScore))
  )[0];

  return buildEvidenceItem({
    category: "marketEngine",
    score: averageScore,
    confidence: averageConfidence,
    source: "marketEngine",
    summary: `Market engine average side score ${averageScore.toFixed(1)} across ${marketSnapshot.markets.length} market(s).`,
    details: {
      marketCount: marketSnapshot.markets.length,
      averageScore,
      averageConfidence,
      dominantMarketType: dominantMarket?.marketType ?? null,
      dominantRecommendation: dominantMarket?.recommendation ?? null,
      matchedPatternCount: marketSnapshot.markets.reduce(
        (sum, market) => sum + market.matchedPatterns.length,
        0
      ),
    },
  });
}

export function collectRecent10MatchesEvidence(
  fusion: FeatureFusionResult,
  features: FeatureScore[] | undefined,
  audit: ProviderResolutionAudit | null | undefined
): EvidenceItem | null {
  const winRate = findFeature(features, RECENT_FORM_FEATURE_IDS.winRate);
  if (winRate) {
    return buildFromFeature(
      "recent10Matches",
      winRate,
      resolveProviderSource(audit, "recentForm"),
      "Recent 10 matches win-rate differential from recent form provider."
    );
  }

  return buildFromFusionCategory(
    "recent10Matches",
    "recentForm",
    fusion,
    resolveProviderSource(audit, "recentForm"),
    "Recent 10 matches"
  );
}

export function collectHomeFormEvidence(
  fusion: FeatureFusionResult,
  features: FeatureScore[] | undefined,
  audit: ProviderResolutionAudit | null | undefined
): EvidenceItem | null {
  const homeForm = findFeature(features, RECENT_FORM_FEATURE_IDS.homeForm);
  if (homeForm) {
    return buildFromFeature(
      "homeForm",
      homeForm,
      resolveProviderSource(audit, "recentForm")
    );
  }

  const homeWinRate = findFeature(features, HOME_AWAY_FEATURE_IDS.homeWinRate);
  if (homeWinRate) {
    return buildFromFeature(
      "homeForm",
      homeWinRate,
      resolveProviderSource(audit, "homeAway")
    );
  }

  return buildFromFusionCategory(
    "homeForm",
    "homeAway",
    fusion,
    resolveProviderSource(audit, "homeAway"),
    "Home form"
  );
}

export function collectAwayFormEvidence(
  fusion: FeatureFusionResult,
  features: FeatureScore[] | undefined,
  audit: ProviderResolutionAudit | null | undefined
): EvidenceItem | null {
  const awayForm = findFeature(features, RECENT_FORM_FEATURE_IDS.awayForm);
  if (awayForm) {
    return buildFromFeature(
      "awayForm",
      awayForm,
      resolveProviderSource(audit, "recentForm")
    );
  }

  const awayWinRate = findFeature(features, HOME_AWAY_FEATURE_IDS.awayWinRate);
  if (awayWinRate) {
    return buildFromFeature(
      "awayForm",
      awayWinRate,
      resolveProviderSource(audit, "homeAway")
    );
  }

  return buildFromFusionCategory(
    "awayForm",
    "homeAway",
    fusion,
    resolveProviderSource(audit, "homeAway"),
    "Away form"
  );
}

export function collectXgEvidence(
  fusion: FeatureFusionResult,
  features: FeatureScore[] | undefined,
  audit: ProviderResolutionAudit | null | undefined
): EvidenceItem | null {
  const homeXg = findFeature(features, GOALS_XG_FEATURE_IDS.homeXg);
  const awayXg = findFeature(features, GOALS_XG_FEATURE_IDS.awayXg);
  const primary = homeXg ?? awayXg;
  if (primary) {
    const combinedScore =
      homeXg && awayXg
        ? clampScore(((homeXg.score ?? 0) + (awayXg.score ?? 0)) / 2)
        : primary.score ?? 0;
    const combinedConfidence =
      homeXg && awayXg
        ? clampConfidence((homeXg.confidence + awayXg.confidence) / 2)
        : primary.confidence;

    return buildEvidenceItem({
      category: "xg",
      score: combinedScore,
      confidence: combinedConfidence,
      source: resolveProviderSource(audit, "goalsXg"),
      summary: "Expected goals (xG) evidence from goals/xG provider.",
      details: {
        homeXg: homeXg?.metadata ?? null,
        awayXg: awayXg?.metadata ?? null,
      },
    });
  }

  return buildFromFusionCategory(
    "xg",
    "goalsXg",
    fusion,
    resolveProviderSource(audit, "goalsXg"),
    "xG"
  );
}

export function collectXgaEvidence(
  fusion: FeatureFusionResult,
  features: FeatureScore[] | undefined,
  audit: ProviderResolutionAudit | null | undefined
): EvidenceItem | null {
  const homeXga = findFeature(features, GOALS_XG_FEATURE_IDS.homeXga);
  const awayXga = findFeature(features, GOALS_XG_FEATURE_IDS.awayXga);
  const primary = homeXga ?? awayXga;
  if (primary) {
    const combinedScore =
      homeXga && awayXga
        ? clampScore(((homeXga.score ?? 0) + (awayXga.score ?? 0)) / 2)
        : primary.score ?? 0;
    const combinedConfidence =
      homeXga && awayXga
        ? clampConfidence((homeXga.confidence + awayXga.confidence) / 2)
        : primary.confidence;

    return buildEvidenceItem({
      category: "xga",
      score: combinedScore,
      confidence: combinedConfidence,
      source: resolveProviderSource(audit, "goalsXg"),
      summary: "Expected goals against (xGA) evidence from goals/xG provider.",
      details: {
        homeXga: homeXga?.metadata ?? null,
        awayXga: awayXga?.metadata ?? null,
      },
    });
  }

  return buildFromFusionCategory(
    "xga",
    "goalsXg",
    fusion,
    resolveProviderSource(audit, "goalsXg"),
    "xGA"
  );
}

export function collectTeamProfileEvidence(
  teamProfiles: MatchTeamProfilesSnapshot | null | undefined
): EvidenceItem | null {
  if (!teamProfiles) {
    return null;
  }

  const home = teamProfiles.home;
  const away = teamProfiles.away;
  if (!home && !away) {
    return null;
  }

  const completeness = teamProfiles.completeness;
  const homeFormScore = home?.formScore ?? null;
  const awayFormScore = away?.formScore ?? null;
  const score =
    homeFormScore !== null && awayFormScore !== null
      ? clampScore(homeFormScore - awayFormScore)
      : homeFormScore ?? (awayFormScore !== null ? -awayFormScore : 0);

  const sampleSizes = [home?.sampleSize ?? 0, away?.sampleSize ?? 0];
  const maxSample = Math.max(...sampleSizes);
  const confidence = clampConfidence(
    Math.min(0.9, completeness * 0.6 + Math.min(maxSample, 10) / 10 * 0.4)
  );

  return buildEvidenceItem({
    category: "teamProfile",
    score,
    confidence,
    source: home?.source ?? away?.source ?? "teamProfile",
    summary: `Team profile completeness ${(completeness * 100).toFixed(0)}% with sample sizes ${sampleSizes.join(" / ")}.`,
    details: {
      completeness,
      homeTeam: home?.teamName ?? null,
      awayTeam: away?.teamName ?? null,
      homeSampleSize: home?.sampleSize ?? null,
      awaySampleSize: away?.sampleSize ?? null,
      warnings: teamProfiles.warnings,
    },
  });
}

export function collectTeamEngineEvidence(
  teamProfiles: MatchTeamProfilesSnapshot | null | undefined
): EvidenceItem | null {
  if (!teamProfiles) {
    return null;
  }

  const home = teamProfiles.home;
  const away = teamProfiles.away;
  const homeMomentum = home?.momentumScore ?? null;
  const awayMomentum = away?.momentumScore ?? null;
  const homeForm = home?.formScore ?? null;
  const awayForm = away?.formScore ?? null;

  if (
    homeMomentum === null &&
    awayMomentum === null &&
    homeForm === null &&
    awayForm === null
  ) {
    return null;
  }

  const momentumDiff =
    homeMomentum !== null && awayMomentum !== null
      ? homeMomentum - awayMomentum
      : homeMomentum ?? (awayMomentum !== null ? -awayMomentum : 0);
  const formDiff =
    homeForm !== null && awayForm !== null
      ? homeForm - awayForm
      : homeForm ?? (awayForm !== null ? -awayForm : 0);
  const score = clampScore(momentumDiff * 0.6 + formDiff * 0.4);
  const confidence = clampConfidence(teamProfiles.completeness * 0.85);

  return buildEvidenceItem({
    category: "teamEngine",
    score,
    confidence,
    source: "teamEngine",
    summary: `Team engine momentum/form differential score ${score.toFixed(1)}.`,
    details: {
      homeMomentum,
      awayMomentum,
      homeForm,
      awayForm,
      completeness: teamProfiles.completeness,
    },
  });
}

export function collectH2hEvidence(
  fusion: FeatureFusionResult,
  audit: ProviderResolutionAudit | null | undefined
): EvidenceItem | null {
  return buildFromFusionCategory(
    "h2h",
    "h2h",
    fusion,
    resolveProviderSource(audit, "h2h"),
    "Head-to-head"
  );
}

export function collectLeagueStrengthEvidence(
  fusion: FeatureFusionResult,
  audit: ProviderResolutionAudit | null | undefined
): EvidenceItem | null {
  return buildFromFusionCategory(
    "leagueStrength",
    "leagueStrength",
    fusion,
    resolveProviderSource(audit, "leagueStrength"),
    "League strength"
  );
}

export function collectSquadAvailabilityEvidence(
  fusion: FeatureFusionResult,
  audit: ProviderResolutionAudit | null | undefined
): EvidenceItem | null {
  return buildFromFusionCategory(
    "squadAvailability",
    "squadAvailability",
    fusion,
    resolveProviderSource(audit, "squadAvailability"),
    "Squad availability"
  );
}

export function collectMatchContextEvidence(
  fusion: FeatureFusionResult,
  audit: ProviderResolutionAudit | null | undefined
): EvidenceItem | null {
  return buildFromFusionCategory(
    "matchContext",
    "matchContext",
    fusion,
    resolveProviderSource(audit, "matchContext"),
    "Match context"
  );
}
