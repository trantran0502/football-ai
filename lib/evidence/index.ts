export * from "@/lib/evidence/evidenceEngine";
export {
  buildEvidenceBreakdown,
  buildEvidenceImpact,
  buildEvidenceSummaryLines,
  integrateEvidenceForSelection,
  integrateEvidenceGlobally,
  listAllEvidenceItems,
  EVIDENCE_NEUTRAL_THRESHOLD,
} from "@/lib/evidence/evidenceIntegration";
export type {
  EvidenceCategory,
  EvidenceBreakdownItem,
  EvidenceEngineInput,
  EvidenceImpactDirection,
  EvidenceIntegrationResult,
  EvidenceItem,
  EvidenceReport,
} from "@/lib/evidence/evidenceTypes";
export { EVIDENCE_CATEGORIES } from "@/lib/evidence/evidenceTypes";
export {
  attachEvidenceValidationToRecommendation,
  buildEvidencePerformanceFromHistory,
  buildEvidencePerformanceReport,
  buildEvidenceValidationFromLearningRecord,
  buildEvidenceValidationFromMatchRecord,
  buildEvidenceValidationRecord,
  EVIDENCE_PROVIDER_LABELS,
  EVIDENCE_VALIDATION_STORAGE_KEY,
  extractEvidenceValidationFromRecommendation,
  TRACKED_EVIDENCE_CATEGORIES,
} from "@/lib/evidence/evidenceValidation";
export type {
  EvidencePerformanceReport,
  EvidencePerformanceStats,
  EvidenceValidationEntry,
  EvidenceValidationRecord,
} from "@/lib/evidence/evidenceValidation";
