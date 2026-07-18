import { EVIDENCE_V3_CATALOG_VERSION } from "@/lib/evidence/v3/evidenceCatalog";
import { getEvidenceV3Providers } from "@/lib/evidence/v3/evidenceRegistry";
import type {
  EvidenceCollectionResult,
  EvidenceCollectorContext,
  EvidenceV3Observability,
} from "@/lib/evidence/v3/evidenceTypes";

export function collectEvidenceV3(
  context: EvidenceCollectorContext,
  providers = getEvidenceV3Providers()
): EvidenceCollectionResult {
  const collectedAt = context.collectedAt ?? new Date().toISOString();
  const evidence: EvidenceCollectionResult["evidence"] = [];
  const missing: string[] = [];
  const blocked: string[] = [];

  for (const provider of providers) {
    try {
      const outcome = provider.collect({
        ...context,
        collectedAt,
      });

      if (outcome.status === "collected") {
        evidence.push(outcome.result);
        continue;
      }

      if (outcome.status === "blocked") {
        blocked.push(provider.id);
        continue;
      }

      missing.push(provider.id);
    } catch {
      missing.push(provider.id);
    }
  }

  return {
    evidence,
    missing,
    blocked,
    catalogVersion: EVIDENCE_V3_CATALOG_VERSION,
    collectedAt,
  };
}

export function buildEvidenceV3Observability(
  result: EvidenceCollectionResult
): EvidenceV3Observability {
  return {
    catalogVersion: result.catalogVersion,
    collected: result.evidence.map((item) => item.id),
    missing: [...result.missing],
    blocked: [...result.blocked],
  };
}
