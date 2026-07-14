import { fuseFeatureScores } from "@/lib/analysis/featureScore/fusion/featureFusionEngine";
import type { FeatureScore } from "@/lib/analysis/featureScore/types";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  attachValidationToReplaySnapshot,
  buildReplaySnapshotFromReport,
} from "@/lib/replay/replayBuilder";
import type {
  ReplayFeatureRemovalSimulation,
  ReplayResponse,
  ReplaySnapshot,
} from "@/lib/replay/replayTypes";
import type { AnalysisReport } from "@/lib/analysis/types";

export function buildReplaySnapshotForAnalysis(
  report: AnalysisReport,
  matchId: string,
  record?: HistoricalMatchRecord | null
): ReplaySnapshot {
  const snapshot = buildReplaySnapshotFromReport(report, {
    matchId,
    record,
  });
  if (record?.verificationResult) {
    return attachValidationToReplaySnapshot(snapshot, record);
  }
  return snapshot;
}

export function getReplaySnapshotFromRecord(
  record: HistoricalMatchRecord
): ReplaySnapshot | null {
  return record.analysisSnapshot?.replay ?? null;
}

export function simulateFeatureRemoval(
  snapshot: ReplaySnapshot,
  featureId: string
): ReplayFeatureRemovalSimulation | null {
  if (!snapshot.fusion) {
    return null;
  }

  const originalOverallScore = snapshot.fusion.overallScore;
  const remaining = snapshot.features
    .filter((feature) => feature.id !== featureId)
    .map(toFeatureScore);

  if (remaining.length === snapshot.features.length) {
    return null;
  }

  const simulated = fuseFeatureScores(remaining);
  return {
    featureId,
    originalOverallScore,
    simulatedOverallScore: simulated.overallScore,
    delta: simulated.overallScore - originalOverallScore,
  };
}

export function buildFeatureRemovalSimulations(
  snapshot: ReplaySnapshot
): ReplayFeatureRemovalSimulation[] {
  return snapshot.features
    .map((feature) => simulateFeatureRemoval(snapshot, feature.id))
    .filter((item): item is ReplayFeatureRemovalSimulation => item !== null);
}

export function buildReplayResponse(
  record: HistoricalMatchRecord
): ReplayResponse | null {
  const snapshot = getReplaySnapshotFromRecord(record);
  if (!snapshot) {
    return null;
  }

  const enriched =
    record.verificationResult && !snapshot.validation
      ? attachValidationToReplaySnapshot(snapshot, record)
      : snapshot;

  return {
    matchId: record.id,
    generatedAt: new Date().toISOString(),
    snapshot: enriched,
    steps: [
      {
        step: 1,
        key: "raw",
        title: "原始資料",
        data: enriched.raw,
      },
      {
        step: 2,
        key: "providers",
        title: "Provider",
        data: enriched.providers,
      },
      {
        step: 3,
        key: "features",
        title: "Feature",
        data: enriched.features,
      },
      {
        step: 4,
        key: "fusion",
        title: "Fusion",
        data: enriched.fusion,
      },
      {
        step: 5,
        key: "recommendation",
        title: "Recommendation",
        data: enriched.recommendation,
      },
      {
        step: 6,
        key: "decision",
        title: "Decision",
        data: enriched.decisionReplay,
      },
      {
        step: 7,
        key: "markets",
        title: "Market Replay",
        data: enriched.marketReplay,
      },
      {
        step: 8,
        key: "validation",
        title: "Validation",
        data: enriched.validation,
      },
    ],
    featureRemovalSimulations: buildFeatureRemovalSimulations(enriched),
    readOnly: true,
  };
}

function toFeatureScore(feature: ReplaySnapshot["features"][number]): FeatureScore {
  return {
    id: feature.id,
    category: feature.category as FeatureScore["category"],
    score: feature.score,
    weight: feature.weight,
    confidence: feature.confidence,
    reason: feature.explanation,
    metadata: feature.metadata ?? undefined,
  };
}

export function buildReplayResponseFromSnapshot(
  matchId: string,
  snapshot: ReplaySnapshot
): ReplayResponse {
  return {
    matchId,
    generatedAt: new Date().toISOString(),
    snapshot,
    steps: [
      { step: 1, key: "raw", title: "原始資料", data: snapshot.raw },
      { step: 2, key: "providers", title: "Provider", data: snapshot.providers },
      { step: 3, key: "features", title: "Feature", data: snapshot.features },
      { step: 4, key: "fusion", title: "Fusion", data: snapshot.fusion },
      {
        step: 5,
        key: "recommendation",
        title: "Recommendation",
        data: snapshot.recommendation,
      },
      {
        step: 6,
        key: "decision",
        title: "Decision",
        data: snapshot.decisionReplay,
      },
      {
        step: 7,
        key: "markets",
        title: "Market Replay",
        data: snapshot.marketReplay,
      },
      { step: 8, key: "validation", title: "Validation", data: snapshot.validation },
    ],
    featureRemovalSimulations: buildFeatureRemovalSimulations(snapshot),
    readOnly: true,
  };
}
