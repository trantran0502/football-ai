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
