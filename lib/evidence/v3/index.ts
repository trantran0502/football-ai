export {
  EVIDENCE_V3_CATALOG,
  EVIDENCE_V3_CATALOG_IDS,
  EVIDENCE_V3_CATALOG_VERSION,
  getEvidenceCatalogEntry,
} from "@/lib/evidence/v3/evidenceCatalog";
export {
  buildEvidenceV3Observability,
  collectEvidenceV3,
} from "@/lib/evidence/v3/evidenceCollector";
export { isEvidenceV3ShadowEnabled } from "@/lib/evidence/v3/evidenceConfig";
export {
  getEvidenceV3ProviderById,
  getEvidenceV3Providers,
} from "@/lib/evidence/v3/evidenceRegistry";
export { getEvidenceV3ShadowContext } from "@/lib/evidence/v3/evidenceShadowStore";
export { runEvidenceV3ShadowIfEnabled } from "@/lib/evidence/v3/evidenceShadowMode";
export {
  clearShadowRun,
  createShadowRunId,
  getShadowRunRecord,
  resetShadowRunsForTests,
} from "@/lib/shadow/shadowRunScope";
export type {
  EvidenceCatalogEntry,
  EvidenceCategoryV3,
  EvidenceCollectionResult,
  EvidenceCollectorContext,
  EvidenceDirectionV3,
  EvidenceMetadata,
  EvidenceProvider,
  EvidenceProviderOutcome,
  EvidenceResult,
  EvidenceSourceRef,
  EvidenceV3Observability,
  EvidenceV3ShadowContext,
} from "@/lib/evidence/v3/evidenceTypes";
