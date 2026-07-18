import { runFeatureRecommendationPipeline } from "@/lib/analysis/featureRecommendationPipeline";
import { aggregateDecision } from "@/lib/decision/v3/decisionEngine";
import {
  buildDecisionConfigFromResolvedWeights,
  resolveDecisionEvidenceWeights,
} from "@/lib/decision/v3/decisionWeightLoader";
import type { DecisionOutcome } from "@/lib/decision/v3/decisionTypes";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { collectEvidenceV3 } from "@/lib/evidence/v3/evidenceCollector";
import type { EvidenceCollectionResult, EvidenceCollectorContext } from "@/lib/evidence/v3/evidenceTypes";
import { buildFallbackWeightConfig } from "@/lib/recommendation/weightConfigRuntime";
import type { LoadedRuntimeWeightConfig } from "@/lib/recommendation/weightConfigTypes";
import type { RecommendationEngineResult } from "@/lib/recommendation/recommendationTypes";
import {
  isMockValidationRecord,
  resolveEvidenceCapturedAt,
} from "@/lib/replay/v3/decisionV3ReplayValidationEligibility";
import type { MatchData } from "@/types/match";

function buildMatchData(record: HistoricalMatchRecord): MatchData {
  return {
    league: record.league,
    homeTeam: record.homeTeam,
    awayTeam: record.awayTeam,
    marketSelections: record.marketSelections,
    selections: [],
    unknownMarkets: [],
    moneyline: [],
    handicap: [],
    overUnder: [],
    btts: [],
    oddEven: [],
    otherMarkets: [],
  };
}

function resolveRuntimeWeightConfig(
  record: HistoricalMatchRecord
): LoadedRuntimeWeightConfig {
  const snapshot = record.analysisSnapshot?.weightConfig;
  const fallback = buildFallbackWeightConfig();
  const loadedAt = snapshot?.loadedAt ?? "1970-01-01T00:00:00.000Z";

  return {
    ...fallback,
    loadedAt,
    source: snapshot?.source ?? fallback.source,
    activeVersion: snapshot?.version
      ? {
          id: snapshot.versionId ?? "snapshot",
          version: snapshot.version,
          status: "active",
          providerWeights: fallback.providerWeights,
          marketBlendWeight: fallback.marketBlendWeight,
          sourceReportSnapshot: {},
          createdBy: "replay-validation",
          createdAt: snapshot.loadedAt,
          appliedAt: snapshot.loadedAt,
          archivedAt: null,
        }
      : fallback.activeVersion,
  };
}

export function buildEvidenceCollectorContext(
  record: HistoricalMatchRecord
): EvidenceCollectorContext {
  return {
    homeTeam: record.homeTeam,
    awayTeam: record.awayTeam,
    league: record.league,
    matchDate: record.matchDate,
    fixtureId: record.fixtureId ?? undefined,
    marketSelections: record.marketSelections,
    providerAudit: null,
    teamProfiles: record.analysisSnapshot?.teamProfiles ?? null,
    collectedAt: resolveEvidenceCapturedAt(record) ?? undefined,
  };
}

export function rebuildLegacyRecommendation(
  record: HistoricalMatchRecord
): RecommendationEngineResult | null {
  const pipeline = runFeatureRecommendationPipeline(buildMatchData(record), record.marketSelections, {
    teamProfiles: record.analysisSnapshot?.teamProfiles ?? null,
    matchDate: record.matchDate,
    runtimeWeightConfig: resolveRuntimeWeightConfig(record),
  });

  return pipeline.recommendation;
}

export function rebuildDecisionV3(input: {
  record: HistoricalMatchRecord;
  collectorContext?: EvidenceCollectorContext;
  runtimeWeightConfig?: LoadedRuntimeWeightConfig;
}): {
  outcome: DecisionOutcome;
  evidence: EvidenceCollectionResult;
  runtimeWeightConfig: LoadedRuntimeWeightConfig;
} {
  const runtimeWeightConfig =
    input.runtimeWeightConfig ?? resolveRuntimeWeightConfig(input.record);
  const collectorContext =
    input.collectorContext ?? buildEvidenceCollectorContext(input.record);
  const evidence = collectEvidenceV3(collectorContext);
  const resolved = resolveDecisionEvidenceWeights(runtimeWeightConfig);
  const outcome = aggregateDecision({
    evidence,
    marketSelections: input.record.marketSelections,
    config: buildDecisionConfigFromResolvedWeights(resolved),
    decisionWeightVersion: resolved.version,
    decisionWeightSource: resolved.source,
  });

  return {
    outcome,
    evidence,
    runtimeWeightConfig,
  };
}

export function resolveValidationDataSource(
  record: HistoricalMatchRecord
): "production" | "mock" | "unknown" {
  if (isMockValidationRecord(record)) {
    return "mock";
  }

  if (record.analysisSnapshot?.replay?.providers?.some((provider) => provider.source === "mock")) {
    return "mock";
  }

  if (record.fixtureId !== null && record.fixtureId !== undefined) {
    return "production";
  }

  return "unknown";
}

export function resolveProviderConfidence(evidence: EvidenceCollectionResult): number | null {
  const providerEvidence = evidence.evidence.find(
    (item) => item.id === "PROVIDER_CONFIDENCE"
  );
  return providerEvidence?.confidence ?? null;
}

export function resolveFixtureKey(record: HistoricalMatchRecord): string {
  if (record.fixtureId !== null && record.fixtureId !== undefined) {
    return String(record.fixtureId);
  }

  return `${record.homeTeam.trim()}::${record.awayTeam.trim()}`;
}
