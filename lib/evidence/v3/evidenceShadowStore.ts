import { getShadowRunRecord } from "@/lib/shadow/shadowRunScope";
import type { EvidenceV3ShadowContext } from "@/lib/evidence/v3/evidenceTypes";

/**
 * @deprecated Use getShadowRunRecord(runId)?.evidenceV3 for run-scoped reads.
 */
export function getEvidenceV3ShadowContext(
  runId?: string
): EvidenceV3ShadowContext | null {
  if (!runId) {
    return null;
  }
  return getShadowRunRecord(runId)?.evidenceV3 ?? null;
}

/** @deprecated Use resetShadowRunsForTests from lib/shadow/shadowRunScope. */
export function resetEvidenceV3ShadowContextForTests(): void {
  // Kept for backward-compatible test imports; shadow scope reset is centralized.
}

/** @deprecated Use setShadowRunEvidenceV3 via runEvidenceV3ShadowIfEnabled. */
export function setEvidenceV3ShadowContext(): void {
  // No-op: singleton store removed in Phase 3-2 isolation fix.
}
