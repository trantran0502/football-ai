import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { accumulateVerifiedMatchesForKnowledge } from "../marketKnowledgeAccumulator";
import { buildMarketKnowledgeFromVerifiedMatches } from "../marketKnowledgeFromVerified";
import { buildStatisticsFromObservations } from "../marketKnowledgeStatistics";
import type { MarketKnowledgeSnapshot } from "../marketKnowledgeTypes";
import type {
  ReplayStep,
  ReplayValidationResult,
} from "./marketKnowledgeReplayTypes";

const SAMPLE_SIZE_EPSILON = 1e-9;

export interface ReplayValidationInput {
  steps: ReplayStep[];
  snapshots: MarketKnowledgeSnapshot[];
  processedMatches: HistoricalMatchRecord[];
}

export function validateReplaySnapshots(
  snapshots: MarketKnowledgeSnapshot[]
): ReplayValidationResult {
  const errors: string[] = [];

  for (let index = 0; index < snapshots.length; index += 1) {
    const snapshot = snapshots[index];

    for (const rule of snapshot.ruleStatistics) {
      const totalOutcomes = rule.hitCount + rule.missCount + rule.pushCount;
      if (Math.abs(totalOutcomes - rule.sampleSize) > SAMPLE_SIZE_EPSILON) {
        errors.push(
          `Snapshot ${snapshot.id} rule ${rule.ruleId}: hit+miss+push (${totalOutcomes}) != sampleSize (${rule.sampleSize}).`
        );
      }
    }

    if (index === 0) {
      continue;
    }

    const previous = snapshots[index - 1];
    const previousRules = new Map(
      previous.ruleStatistics.map((item) => [item.ruleId, item.sampleSize])
    );
    const previousPatterns = new Map(
      previous.patternStatistics.map((item) => [item.patternId, item.sampleSize])
    );

    for (const rule of snapshot.ruleStatistics) {
      const previousSampleSize = previousRules.get(rule.ruleId) ?? 0;
      if (rule.sampleSize + SAMPLE_SIZE_EPSILON < previousSampleSize) {
        errors.push(
          `Rule ${rule.ruleId} sampleSize decreased from ${previousSampleSize} to ${rule.sampleSize}.`
        );
      }
    }

    for (const pattern of snapshot.patternStatistics) {
      const previousSampleSize = previousPatterns.get(pattern.patternId) ?? 0;
      if (pattern.sampleSize + SAMPLE_SIZE_EPSILON < previousSampleSize) {
        errors.push(
          `Pattern ${pattern.patternId} sampleSize decreased from ${previousSampleSize} to ${pattern.sampleSize}.`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateReplayRoiConsistency(
  snapshots: MarketKnowledgeSnapshot[],
  processedMatches: HistoricalMatchRecord[]
): ReplayValidationResult {
  const errors: string[] = [];
  const lastSnapshot = snapshots[snapshots.length - 1];
  if (!lastSnapshot) {
    return { valid: true, errors };
  }

  const rebuilt = buildMarketKnowledgeFromVerifiedMatches(processedMatches, {
    snapshotId: "validation-rebuild",
    generatedAt: lastSnapshot.generatedAt,
  });

  const rebuiltRules = new Map(rebuilt.ruleStatistics.map((item) => [item.ruleId, item]));
  for (const rule of lastSnapshot.ruleStatistics) {
    const expected = rebuiltRules.get(rule.ruleId);
    if (!expected) {
      errors.push(`Rebuild missing rule ${rule.ruleId}.`);
      continue;
    }
    if (Math.abs(expected.roi - rule.roi) > 0.0001) {
      errors.push(
        `Rule ${rule.ruleId} ROI mismatch: replay ${rule.roi}, rebuild ${expected.roi}.`
      );
    }
    if (expected.sampleSize !== rule.sampleSize) {
      errors.push(
        `Rule ${rule.ruleId} sampleSize mismatch: replay ${rule.sampleSize}, rebuild ${expected.sampleSize}.`
      );
    }
  }

  const observations = accumulateVerifiedMatchesForKnowledge(processedMatches);
  const observationBuilt = buildStatisticsFromObservations(
    observations,
    "validation-observations",
    lastSnapshot.generatedAt
  );
  const observationRules = new Map(
    observationBuilt.ruleStatistics.map((item) => [item.ruleId, item])
  );

  for (const rule of lastSnapshot.ruleStatistics) {
    const expected = observationRules.get(rule.ruleId);
    if (!expected) {
      continue;
    }
    if (Math.abs(expected.roi - rule.roi) > 0.0001) {
      errors.push(
        `Rule ${rule.ruleId} ROI mismatch with observation accumulation: ${rule.roi} vs ${expected.roi}.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateReplayResult(input: ReplayValidationInput): ReplayValidationResult {
  const snapshotValidation = validateReplaySnapshots(input.snapshots);
  const roiValidation = validateReplayRoiConsistency(
    input.snapshots,
    input.processedMatches
  );

  return {
    valid: snapshotValidation.valid && roiValidation.valid,
    errors: [...snapshotValidation.errors, ...roiValidation.errors],
  };
}

export { validateReplayResult as validateReplay };
