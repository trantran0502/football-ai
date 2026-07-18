import { aggregateDecision } from "@/lib/decision/v3/decisionEngine";
import {
  buildDecisionConfigFromResolvedWeights,
  resolveDecisionEvidenceWeights,
} from "@/lib/decision/v3/decisionWeightLoader";
import { collectEvidenceV3 } from "@/lib/evidence/v3/evidenceCollector";
import type {
  EvidenceCollectionResult,
  EvidenceCollectorContext,
} from "@/lib/evidence/v3/evidenceTypes";
import {
  buildRecommendationComparison,
  buildRecommendationComparisonObservability,
  buildRecommendationComparisonReplaySnapshot,
} from "@/lib/recommendation/v3/recommendationComparisonEngine";
import { isRecommendationDualWriteEnabled } from "@/lib/recommendation/v3/recommendationDualWriteConfig";
import type { RecommendationComparisonShadowContext } from "@/lib/recommendation/v3/recommendationComparisonTypes";
import type { RecommendationEngineResult } from "@/lib/recommendation/recommendationTypes";
import type { LoadedRuntimeWeightConfig } from "@/lib/recommendation/weightConfigTypes";
import {
  getShadowRunRecord,
  setShadowRunRecommendationComparison,
} from "@/lib/shadow/shadowRunScope";
import type { MarketSelection } from "@/types/match";

export function runRecommendationDualWriteIfEnabled(input: {
  runId: string;
  legacyRecommendation: RecommendationEngineResult | null;
  evidenceCollection: EvidenceCollectionResult | null;
  collectorContext: EvidenceCollectorContext;
  marketSelections: MarketSelection[];
  runtimeWeightConfig?: LoadedRuntimeWeightConfig | null;
}): void {
  if (!isRecommendationDualWriteEnabled()) {
    setShadowRunRecommendationComparison(input.runId, null);
    return;
  }

  try {
    const evidenceCollection =
      input.evidenceCollection ?? collectEvidenceV3(input.collectorContext);
    const resolved = resolveDecisionEvidenceWeights(input.runtimeWeightConfig);
    const decisionOutcome = aggregateDecision({
      evidence: evidenceCollection,
      marketSelections: input.marketSelections,
      config: buildDecisionConfigFromResolvedWeights(resolved),
      decisionWeightVersion: resolved.version,
      decisionWeightSource: resolved.source,
    });

    const comparison = buildRecommendationComparison({
      legacyRecommendation: input.legacyRecommendation,
      decisionOutcome,
    });

    const record = getShadowRunRecord(input.runId);
    const collectedAt = evidenceCollection.collectedAt;
    const fixtureKey = record?.fixtureKey ?? input.runId.split(":")[0] ?? "unknown";

    const context: RecommendationComparisonShadowContext = {
      enabled: true,
      collectedAt,
      recommendationComparison: buildRecommendationComparisonObservability(comparison),
      replaySnapshot: buildRecommendationComparisonReplaySnapshot({
        runId: input.runId,
        fixtureKey,
        collectedAt,
        comparison,
      }),
    };

    setShadowRunRecommendationComparison(input.runId, context);
  } catch {
    setShadowRunRecommendationComparison(input.runId, null);
  }
}
