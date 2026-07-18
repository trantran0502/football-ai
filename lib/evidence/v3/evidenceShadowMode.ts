import {
  buildEvidenceV3Observability,
  collectEvidenceV3,
} from "@/lib/evidence/v3/evidenceCollector";
import { isEvidenceV3ShadowEnabled } from "@/lib/evidence/v3/evidenceConfig";
import type {
  EvidenceCollectionResult,
  EvidenceCollectorContext,
} from "@/lib/evidence/v3/evidenceTypes";
import { setShadowRunEvidenceV3 } from "@/lib/shadow/shadowRunScope";

export function runEvidenceV3ShadowIfEnabled(
  runId: string,
  context: EvidenceCollectorContext
): EvidenceCollectionResult | null {
  if (!isEvidenceV3ShadowEnabled()) {
    setShadowRunEvidenceV3(runId, null);
    return null;
  }

  try {
    const collection = collectEvidenceV3(context);
    setShadowRunEvidenceV3(runId, {
      enabled: true,
      collectedAt: collection.collectedAt,
      evidenceV3: buildEvidenceV3Observability(collection),
    });
    return collection;
  } catch {
    setShadowRunEvidenceV3(runId, null);
    return null;
  }
}
