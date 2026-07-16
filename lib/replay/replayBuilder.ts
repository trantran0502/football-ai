import { registerAllFeatureCollectors } from "@/lib/analysis/featureScore/registerAllFeatureCollectors";
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
  annotateFeatureProviderSources,
  auditProviderResolution,
  prepareTeamProfileProviderContext,
  resetTeamProfileProviderContext,
  resolveAllProviderSnapshots,
  toReplayDataSource,
} from "@/lib/providers/teamProfile/teamProfileProviderPipeline";
import type { FeatureProviderKey } from "@/lib/providers/registry/types";
import type { MatchTeamProfilesSnapshot } from "@/lib/teamProfile/teamProfileTypes";
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

let replayCollectorsBootstrapped = false;

function ensureReplayFeatureCollectorsRegistered(): void {
  if (replayCollectorsBootstrapped) {
    return;
  }
  registerAllFeatureCollectors();
  replayCollectorsBootstrapped = true;
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
  teamProfiles?: MatchTeamProfilesSnapshot | null;
}): ReplayProviderSnapshot[] {
  prepareTeamProfileProviderContext(input.teamProfiles ?? null);
  try {
    const snapshots = resolveAllProviderSnapshots({
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      matchDate: input.matchDate,
      league: input.league,
    });

    return snapshots.map((snapshot) => ({
      key: snapshot.key as ReplayProviderKey,
      label: PROVIDER_LABELS[snapshot.key as ReplayProviderKey],
      source: toReplayDataSource(snapshot.source, snapshot.key as FeatureProviderKey),
      fetchedAt: new Date().toISOString(),
      confidence: snapshot.confidence,
      data: snapshot.data,
      citations:
        snapshot.key !== "leagueStrength" && snapshot.source === "googleSearch"
          ? captureRawSources(input).citations
          : [],
    }));
  } finally {
    resetTeamProfileProviderContext();
  }
}

function captureFeatureSnapshots(
  report: AnalysisReport,
  matchDate?: string
): ReplayFeatureSnapshot[] {
  ensureReplayFeatureCollectorsRegistered();
  prepareTeamProfileProviderContext(report.teamProfiles ?? null);
  try {
    const audit = auditProviderResolution(
      resolveAllProviderSnapshots({
        homeTeam: report.match.homeTeam,
        awayTeam: report.match.awayTeam,
        matchDate,
        league: report.match.league,
      })
    );
    const featureResult = buildFeatureScores({
      marketSelections: report.markets,
      metadata: {
        homeTeam: report.match.homeTeam,
        awayTeam: report.match.awayTeam,
        league: report.match.league,
        matchDate,
        providerAudit: audit,
      },
    });
    const annotated = annotateFeatureProviderSources(featureResult.features, audit);

    return annotated.map((feature) => ({
      id: feature.id,
      category: feature.category,
      score: feature.score,
      confidence: feature.confidence,
      weight: feature.weight,
      explanation: feature.reason,
      source:
        (feature.metadata?.replaySource as ReplayDataSource | undefined) ??
        "unknown",
      metadata: feature.metadata ?? null,
    }));
  } finally {
    resetTeamProfileProviderContext();
  }
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
    fixtureId: report.match.fixtureId ?? null,
    league: report.match.league ?? "",
    leagueId: report.match.leagueId ?? null,
    season: report.match.season ?? null,
    matchTime: report.match.kickoffTime ?? matchDate ?? new Date().toISOString().slice(0, 10),
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
    teamProfiles: report.teamProfiles ?? null,
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
