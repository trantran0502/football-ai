import { buildFeatureScores } from "@/lib/analysis/featureScore/featureScoreEngine";
import { buildReplayDecisionSnapshot } from "@/lib/decision/decisionEngine";
import type { AnalysisReport } from "@/lib/analysis/types";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  buildGoogleSearchCacheKey,
  getCachedGoogleRecord,
} from "@/lib/providers/googleSearch/googleSearchCache";
import { TEAM_CONTEXT_QUERY } from "@/lib/providers/googleSearch/googleSearchService";
import {
  getFeatureProviderRegistry,
  type FeatureProviderKey,
  type ProviderDataSource,
} from "@/lib/providers/registry";
import type {
  ReplayDataSource,
  ReplayMarketSnapshot,
  ReplayMarketSelectionSnapshot,
  ReplayFeatureSnapshot,
  ReplayMatchInfo,
  ReplayProviderKey,
  ReplayProviderSnapshot,
  ReplayRawSources,
  ReplayRecommendationFeatureView,
  ReplayRecommendationSnapshot,
  ReplaySnapshot,
  ReplayValidationSnapshot,
} from "@/lib/replay/replayTypes";
import { REPLAY_SNAPSHOT_VERSION } from "@/lib/replay/replayTypes";
import { summarizeSettlementCounts } from "@/lib/validation/statistics";

const PROVIDER_LABELS: Record<ReplayProviderKey, string> = {
  recentForm: "Recent Form",
  leagueStrength: "League Strength",
  homeAway: "Home / Away",
  goalsXg: "Goals / xG",
  scoringPattern: "BTTS / Over-Under",
  h2h: "H2H",
  squadAvailability: "Squad Availability",
  matchContext: "Match Context",
};

function mapProviderSource(source: ProviderDataSource | undefined): ReplayDataSource {
  switch (source) {
    case "apiFootball":
      return "api";
    case "googleSearch":
      return "google";
    case "cache":
      return "cache";
    case "mock":
      return "mock";
    case "hybrid":
      return "hybrid";
    default:
      return "unknown";
  }
}

function inferFeatureSource(featureId: string): ReplayDataSource {
  if (featureId.startsWith("recent_form.")) {
    return "api";
  }
  if (featureId.startsWith("league_strength.")) {
    return "api";
  }
  if (featureId.startsWith("home_away.")) {
    return "api";
  }
  if (featureId.startsWith("goals_xg.")) {
    return "api";
  }
  if (featureId.startsWith("scoring_pattern.")) {
    return "api";
  }
  if (featureId.startsWith("h2h.")) {
    return "api";
  }
  if (featureId.startsWith("squad_availability.")) {
    return "api";
  }
  if (featureId.startsWith("match_context.")) {
    return "google";
  }
  if (featureId.startsWith("market_odds")) {
    return "cache";
  }
  return "unknown";
}

function captureRawSources(input: {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
}): ReplayRawSources {
  const cacheKey = buildGoogleSearchCacheKey({
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    matchDate: input.matchDate,
    query: TEAM_CONTEXT_QUERY,
  });
  const googleRecord = getCachedGoogleRecord(cacheKey);

  return {
    apiFootballRaw: null,
    googleGroundingRaw: googleRecord?.rawResponse ?? null,
    citations: googleRecord?.citations ?? googleRecord?.payload.citations ?? [],
    cacheSource: googleRecord ? "cache" : null,
  };
}

function captureProviderSnapshots(input: {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
  league?: string;
}): ReplayProviderSnapshot[] {
  const registry = getFeatureProviderRegistry();
  const keys: FeatureProviderKey[] = [
    "recentForm",
    "leagueStrength",
    "homeAway",
    "goalsXg",
    "scoringPattern",
    "h2h",
    "squadAvailability",
    "matchContext",
  ];

  return keys.map((key) => {
    const request =
      key === "leagueStrength"
        ? { leagueName: input.league ?? "Unknown" }
        : {
            homeTeam: input.homeTeam,
            awayTeam: input.awayTeam,
            matchDate: input.matchDate,
          };

    const response = registry.resolveSync(key, request as never);
    return {
      key: key as ReplayProviderKey,
      label: PROVIDER_LABELS[key as ReplayProviderKey],
      source: mapProviderSource(response.source),
      fetchedAt: response.fetchedAt,
      confidence: response.confidence,
      data: response.data,
      citations:
        key !== "leagueStrength" && response.source === "googleSearch"
          ? captureRawSources(input).citations
          : [],
    };
  });
}

function captureFeatureSnapshots(
  report: AnalysisReport,
  matchDate?: string
): ReplayFeatureSnapshot[] {
  const featureResult = buildFeatureScores({
    marketSelections: report.markets,
    metadata: {
      homeTeam: report.match.homeTeam,
      awayTeam: report.match.awayTeam,
      league: report.match.league,
      matchDate,
    },
  });

  return featureResult.features.map((feature) => ({
    id: feature.id,
    category: feature.category,
    score: feature.score,
    confidence: feature.confidence,
    weight: feature.weight,
    explanation: feature.reason,
    source: inferFeatureSource(feature.id),
    metadata: feature.metadata ?? null,
  }));
}

function buildFeatureViews(
  candidateFeatures: string[],
  features: ReplayFeatureSnapshot[],
  direction: "supporting" | "opposing"
): ReplayRecommendationFeatureView[] {
  const views: ReplayRecommendationFeatureView[] = [];

  for (const feature of features) {
    const label =
      typeof feature.metadata?.label === "string"
        ? feature.metadata.label
        : feature.id;
    const inSupportingList = candidateFeatures.includes(label) ||
      candidateFeatures.includes(feature.id);

    if (direction === "supporting" && (inSupportingList || feature.score > 15)) {
      views.push({
        featureId: feature.id,
        label,
        score: feature.score,
        role: "supporting",
      });
    }

    if (direction === "opposing" && (feature.score < -10 || (candidateFeatures.length > 0 && !inSupportingList && feature.score < 0))) {
      views.push({
        featureId: feature.id,
        label,
        score: feature.score,
        role: "opposing",
      });
    }
  }

  return views;
}

function buildRecommendationSnapshot(
  report: AnalysisReport,
  features: ReplayFeatureSnapshot[]
): ReplayRecommendationSnapshot | null {
  const section = report.recommendation;
  if (!section?.result) {
    return section
      ? {
          globalPass: true,
          passReason: section.result?.passReason ?? section.message,
          message: section.message,
          candidates: [],
        }
      : null;
  }

  const result = section.result;
  return {
    globalPass: result.globalPass,
    passReason: result.passReason,
    message: section.message,
    candidates: result.candidates.map((candidate) => ({
      marketType: candidate.marketType,
      selectionLabel: `${candidate.selection.title} ${candidate.selection.side}`,
      confidence: candidate.confidence,
      expectedValue: candidate.expectedValue,
      score: candidate.score,
      reasons: candidate.reasons,
      warnings: candidate.warnings,
      supportingFeatures: buildFeatureViews(
        candidate.supportingFeatures,
        features,
        "supporting"
      ),
      opposingFeatures: buildFeatureViews(
        candidate.supportingFeatures,
        features,
        "opposing"
      ),
    })),
  };
}

export function captureMarketReplay(report: AnalysisReport): ReplayMarketSnapshot | null {
  const intelligence = report.bettingIntelligence;
  if (!intelligence) {
    return null;
  }

  const selections: ReplayMarketSelectionSnapshot[] = intelligence.selections.map(
    (selection) => ({
      marketKey: selection.marketKey,
      label: selection.label ?? selection.marketKey,
      marketType: selection.marketType,
      timeline: selection.historyTimeline.map((point) => ({
        timestamp: point.timestamp,
        source: String(point.source),
        odds: point.odds,
        decimalOdds: point.decimalOdds,
        movement: point.movement,
        expectedValue: selection.valueBet?.expectedValue ?? null,
      })),
      openingOdds: selection.opening?.rawOdds ?? null,
      currentOdds: selection.current?.rawOdds ?? null,
      closingOdds: selection.closing?.rawOdds ?? null,
      latestExpectedValue: selection.valueBet?.expectedValue ?? null,
    })
  );

  return {
    selections,
    bettingIntelligence: intelligence,
  };
}

function buildValidationSnapshot(
  record: HistoricalMatchRecord | null | undefined
): ReplayValidationSnapshot | null {
  if (!record?.result || !record.verificationResult) {
    return null;
  }

  const entries =
    record.verificationResult.recommendationValidation.entries ?? [];
  const settlementSummary = summarizeSettlementCounts(entries);
  const profit = entries.reduce((sum, entry) => sum + entry.evaluation.profit, 0);
  const hits = entries.filter((entry) => entry.evaluation.hit).length;
  const decisive = entries.filter((entry) => entry.evaluation.result !== "PUSH").length;

  return {
    finalScore: record.result,
    entries,
    settlementSummary,
    roi: entries.length > 0 ? profit / entries.length : 0,
    hitRate: decisive > 0 ? hits / decisive : 0,
  };
}

export function buildReplayMatchInfo(
  report: AnalysisReport,
  matchId: string,
  matchDate?: string
): ReplayMatchInfo {
  return {
    matchId,
    fixtureId: null,
    league: report.match.league ?? "",
    season: null,
    matchTime: matchDate ?? new Date().toISOString().slice(0, 10),
    homeTeam: report.match.homeTeam,
    awayTeam: report.match.awayTeam,
  };
}

export function buildReplaySnapshotFromReport(
  report: AnalysisReport,
  options: {
    matchId: string;
    capturedAt?: string;
    matchDate?: string;
    record?: HistoricalMatchRecord | null;
  }
): ReplaySnapshot {
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const matchDate = options.matchDate ?? options.record?.matchDate;
  const matchInfo = buildReplayMatchInfo(report, options.matchId, matchDate);
  const raw = captureRawSources({
    homeTeam: report.match.homeTeam,
    awayTeam: report.match.awayTeam,
    matchDate,
  });
  const providers = captureProviderSnapshots({
    homeTeam: report.match.homeTeam,
    awayTeam: report.match.awayTeam,
    matchDate,
    league: report.match.league,
  });
  const features = captureFeatureSnapshots(report, matchDate);
  const decisionReplay = report.decision
    ? buildReplayDecisionSnapshot(
        {
          fusion: report.recommendation?.fusion ?? null,
          bettingIntelligence: report.bettingIntelligence,
          recommendationCandidates: report.recommendation?.result?.candidates ?? [],
          recommendationResult: report.recommendation?.result ?? null,
        },
        report.decision
      )
    : null;

  return {
    version: REPLAY_SNAPSHOT_VERSION,
    capturedAt,
    match: matchInfo,
    raw,
    providers,
    features,
    fusion: report.recommendation?.fusion ?? null,
    recommendation: buildRecommendationSnapshot(report, features),
    marketReplay: captureMarketReplay(report),
    decisionReplay,
    validation: buildValidationSnapshot(options.record ?? null),
  };
}

export function attachValidationToReplaySnapshot(
  snapshot: ReplaySnapshot,
  record: HistoricalMatchRecord
): ReplaySnapshot {
  return {
    ...snapshot,
    validation: buildValidationSnapshot(record),
  };
}

export function enrichRecordWithReplayValidation(
  record: HistoricalMatchRecord
): HistoricalMatchRecord {
  const replay = record.analysisSnapshot?.replay;
  if (!replay || !record.verificationResult) {
    return record;
  }

  if (replay.validation) {
    return record;
  }

  const updatedReplay = attachValidationToReplaySnapshot(replay, record);
  if (!record.analysisSnapshot) {
    return record;
  }

  return {
    ...record,
    analysisSnapshot: {
      ...record.analysisSnapshot,
      replay: updatedReplay,
    },
  };
}
