import type {
  MarketKnowledgeSnapshot,
  RuleStatistics,
} from "../marketKnowledgeTypes";
import { isPush } from "../marketKnowledgeAccumulator";
import type { MarketKnowledgeObservation } from "../marketKnowledgeAccumulator";
import type { MarketKnowledgeIncrementalReport } from "./marketKnowledgeIncrementalReport";
import { MarketKnowledgeIncrementalValidationError } from "./marketKnowledgeIncrementalTypes";

function findRule(
  snapshot: MarketKnowledgeSnapshot | null,
  ruleId: string
): RuleStatistics | undefined {
  return snapshot?.ruleStatistics.find((rule) => rule.ruleId === ruleId);
}

function assertSampleSizeIncreased(
  label: string,
  previousSize: number,
  nextSize: number,
  errors: string[]
): void {
  if (nextSize < previousSize) {
    errors.push(`${label} sampleSize decreased from ${previousSize} to ${nextSize}.`);
  }
}

function validateRuleUpdates(
  previousSnapshot: MarketKnowledgeSnapshot | null,
  nextSnapshot: MarketKnowledgeSnapshot,
  observations: MarketKnowledgeObservation[],
  errors: string[]
): void {
  const ruleObservationCounts = new Map<string, number>();
  for (const observation of observations) {
    if (!observation.ruleId) {
      continue;
    }
    ruleObservationCounts.set(
      observation.ruleId,
      (ruleObservationCounts.get(observation.ruleId) ?? 0) + 1
    );
  }

  for (const [ruleId, delta] of ruleObservationCounts.entries()) {
    const previous = findRule(previousSnapshot, ruleId);
    const next = findRule(nextSnapshot, ruleId);
    const previousSize = previous?.sampleSize ?? 0;
    const nextSize = next?.sampleSize ?? 0;

    assertSampleSizeIncreased(`Rule ${ruleId}`, previousSize, nextSize, errors);
    if (nextSize !== previousSize + delta) {
      errors.push(
        `Rule ${ruleId} sampleSize expected ${previousSize + delta}, got ${nextSize}.`
      );
    }

    if (!next) {
      errors.push(`Rule ${ruleId} missing from next snapshot.`);
      continue;
    }

    const totalOutcomes = next.hitCount + next.missCount + next.pushCount;
    if (totalOutcomes !== next.sampleSize) {
      errors.push(
        `Rule ${ruleId} hit/miss/push (${totalOutcomes}) must equal sampleSize (${next.sampleSize}).`
      );
    }

    if (previous) {
      let expectedHits = previous.hitCount;
      let expectedMisses = previous.missCount;
      let expectedPushes = previous.pushCount;
      let expectedProfit = previous.roi * previous.sampleSize;

      for (const observation of observations) {
        if (observation.ruleId !== ruleId) {
          continue;
        }
        expectedProfit += observation.profit;
        if (isPush(observation.outcome)) {
          expectedPushes += 1;
        } else if (observation.hit) {
          expectedHits += 1;
        } else {
          expectedMisses += 1;
        }
      }

      if (next.hitCount !== expectedHits) {
        errors.push(`Rule ${ruleId} hitCount expected ${expectedHits}, got ${next.hitCount}.`);
      }
      if (next.missCount !== expectedMisses) {
        errors.push(
          `Rule ${ruleId} missCount expected ${expectedMisses}, got ${next.missCount}.`
        );
      }
      if (next.pushCount !== expectedPushes) {
        errors.push(
          `Rule ${ruleId} pushCount expected ${expectedPushes}, got ${next.pushCount}.`
        );
      }

      const expectedRoi = next.sampleSize > 0 ? expectedProfit / next.sampleSize : 0;
      if (Math.abs(next.roi - expectedRoi) > 1e-9) {
        errors.push(`Rule ${ruleId} roi expected ${expectedRoi}, got ${next.roi}.`);
      }
    }
  }
}

export function validateIncrementalUpdate(input: {
  previousSnapshot: MarketKnowledgeSnapshot | null;
  nextSnapshot: MarketKnowledgeSnapshot;
  observations: MarketKnowledgeObservation[];
  report: MarketKnowledgeIncrementalReport;
}): void {
  const errors: string[] = [];

  if (input.report.parentSnapshotId !== (input.previousSnapshot?.id ?? null)) {
    errors.push("Incremental report parentSnapshotId does not match previous snapshot.");
  }

  if (input.report.newSnapshotId !== input.nextSnapshot.id) {
    errors.push("Incremental report newSnapshotId does not match next snapshot.");
  }

  if (input.previousSnapshot && input.previousSnapshot.id === input.nextSnapshot.id) {
    errors.push("Next snapshot must not reuse the previous snapshot id.");
  }

  if (
    input.nextSnapshot.metadata?.parentSnapshotId &&
    input.nextSnapshot.metadata.parentSnapshotId !== input.previousSnapshot?.id
  ) {
    errors.push("Next snapshot metadata parentSnapshotId mismatch.");
  }

  validateRuleUpdates(
    input.previousSnapshot,
    input.nextSnapshot,
    input.observations,
    errors
  );

  for (const pattern of input.nextSnapshot.patternStatistics) {
    const previousSize =
      input.previousSnapshot?.patternStatistics.find(
        (entry) => entry.patternId === pattern.patternId
      )?.sampleSize ?? 0;
    assertSampleSizeIncreased(
      `Pattern ${pattern.patternId}`,
      previousSize,
      pattern.sampleSize,
      errors
    );
  }

  for (const league of input.nextSnapshot.leagueStatistics) {
    const key = `${league.leagueId}|${league.marketType}`;
    const previousSize =
      input.previousSnapshot?.leagueStatistics.find(
        (entry) => `${entry.leagueId}|${entry.marketType}` === key
      )?.sampleSize ?? 0;
    assertSampleSizeIncreased(`League ${key}`, previousSize, league.sampleSize, errors);
  }

  for (const marketType of Object.keys(input.nextSnapshot.marketStatistics) as Array<
    keyof typeof input.nextSnapshot.marketStatistics
  >) {
    const nextEntry = input.nextSnapshot.marketStatistics[marketType];
    const previousSize =
      input.previousSnapshot?.marketStatistics[marketType].sampleSize ?? 0;
    assertSampleSizeIncreased(
      `Market ${marketType}`,
      previousSize,
      nextEntry.sampleSize,
      errors
    );
  }

  if (errors.length > 0) {
    throw new MarketKnowledgeIncrementalValidationError(errors.join(" "));
  }
}
