import type { DecisionV3ShadowContext } from "@/lib/decision/v3/decisionTypes";
import type { EvidenceV3ShadowContext } from "@/lib/evidence/v3/evidenceTypes";
import type { RecommendationComparisonShadowContext } from "@/lib/recommendation/v3/recommendationComparisonTypes";

export interface ShadowRunRecord {
  runId: string;
  fixtureKey: string;
  createdAt: string;
  evidenceV3: EvidenceV3ShadowContext | null;
  decisionV3: DecisionV3ShadowContext | null;
  recommendationComparison: RecommendationComparisonShadowContext | null;
}

const shadowRuns = new Map<string, ShadowRunRecord>();
const MAX_SHADOW_RUNS = 32;

function trimShadowRuns(): void {
  while (shadowRuns.size > MAX_SHADOW_RUNS) {
    const oldest = shadowRuns.keys().next().value;
    if (oldest) {
      shadowRuns.delete(oldest);
    } else {
      break;
    }
  }
}

export function createShadowRunId(input: {
  fixtureId?: number;
  homeTeam: string;
  awayTeam: string;
}): string {
  const fixtureKey =
    input.fixtureId !== undefined
      ? String(input.fixtureId)
      : `${input.homeTeam.trim()}::${input.awayTeam.trim()}`;
  const runId = `${fixtureKey}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

  shadowRuns.set(runId, {
    runId,
    fixtureKey,
    createdAt: new Date().toISOString(),
    evidenceV3: null,
    decisionV3: null,
    recommendationComparison: null,
  });
  trimShadowRuns();

  return runId;
}

export function getShadowRunRecord(runId: string): ShadowRunRecord | null {
  return shadowRuns.get(runId) ?? null;
}

export function setShadowRunEvidenceV3(
  runId: string,
  context: EvidenceV3ShadowContext | null
): void {
  const record = shadowRuns.get(runId);
  if (!record) {
    return;
  }
  record.evidenceV3 = context;
}

export function setShadowRunDecisionV3(
  runId: string,
  context: DecisionV3ShadowContext | null
): void {
  const record = shadowRuns.get(runId);
  if (!record) {
    return;
  }
  record.decisionV3 = context;
}

export function setShadowRunRecommendationComparison(
  runId: string,
  context: RecommendationComparisonShadowContext | null
): void {
  const record = shadowRuns.get(runId);
  if (!record) {
    return;
  }
  record.recommendationComparison = context;
}

export function clearShadowRun(runId: string): void {
  shadowRuns.delete(runId);
}

export function resetShadowRunsForTests(): void {
  shadowRuns.clear();
}
