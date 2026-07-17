import type { EvidenceCategory } from "@/lib/evidence/evidenceTypes";
import { TRACKED_EVIDENCE_CATEGORIES } from "@/lib/evidence/evidenceValidation";

export type TrackedEvidenceCategory = (typeof TRACKED_EVIDENCE_CATEGORIES)[number];

function buildEqualWeights(
  categories: readonly EvidenceCategory[]
): Record<TrackedEvidenceCategory, number> {
  const weight = categories.length > 0 ? 1 / categories.length : 0;
  return Object.fromEntries(
    categories.map((category) => [category, weight])
  ) as Record<TrackedEvidenceCategory, number>;
}

export const DEFAULT_EVIDENCE_WEIGHTS: Record<TrackedEvidenceCategory, number> =
  buildEqualWeights(TRACKED_EVIDENCE_CATEGORIES);

export function sumEvidenceWeights(
  weights: Record<TrackedEvidenceCategory, number>
): number {
  return TRACKED_EVIDENCE_CATEGORIES.reduce(
    (sum, category) => sum + weights[category],
    0
  );
}
