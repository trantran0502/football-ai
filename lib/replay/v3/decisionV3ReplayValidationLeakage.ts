import type { EvidenceCollectionResult } from "@/lib/evidence/v3/evidenceTypes";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  resolveEvidenceCapturedAt,
  resolveFixtureKickoffIso,
} from "@/lib/replay/v3/decisionV3ReplayValidationEligibility";
import type {
  DecisionV3ReplayExclusionReason,
  DecisionV3ReplayLeakageAudit,
} from "@/lib/replay/v3/decisionV3ReplayValidationTypes";

export interface DecisionV3ReplayLeakageCheckResult {
  passed: boolean;
  reason?: DecisionV3ReplayExclusionReason;
}

export function auditEvidenceLeakage(input: {
  record: HistoricalMatchRecord;
  evidence: EvidenceCollectionResult;
  assumedKickoffHourUtc?: number;
}): DecisionV3ReplayLeakageCheckResult {
  const kickoffIso = resolveFixtureKickoffIso(
    input.record,
    input.assumedKickoffHourUtc ?? 15
  );
  const kickoffMs = Date.parse(kickoffIso);

  const capturedAt =
    input.evidence.collectedAt ??
    resolveEvidenceCapturedAt(input.record) ??
    null;

  if (!capturedAt) {
    return { passed: false, reason: "CANNOT_PROVE_PRE_KICKOFF" };
  }

  if (Date.parse(capturedAt) >= kickoffMs) {
    return { passed: false, reason: "EVIDENCE_CAPTURED_AFTER_KICKOFF" };
  }

  for (const item of input.evidence.evidence) {
    const itemCapturedAt = item.metadata.capturedAt;
    if (!itemCapturedAt || Number.isNaN(Date.parse(itemCapturedAt))) {
      return { passed: false, reason: "CANNOT_PROVE_PRE_KICKOFF" };
    }

    if (Date.parse(itemCapturedAt) >= kickoffMs) {
      return { passed: false, reason: "EVIDENCE_CAPTURED_AFTER_KICKOFF" };
    }
  }

  return { passed: true };
}

export function createEmptyLeakageAudit(): DecisionV3ReplayLeakageAudit {
  return {
    checked: 0,
    passed: 0,
    excluded: 0,
    violationsByReason: {},
  };
}

export function incrementLeakageViolation(
  audit: DecisionV3ReplayLeakageAudit,
  reason: DecisionV3ReplayExclusionReason
): void {
  audit.excluded += 1;
  audit.violationsByReason[reason] = (audit.violationsByReason[reason] ?? 0) + 1;
}
