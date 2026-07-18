export function isEvidenceV3ShadowEnabled(): boolean {
  const value = process.env.USE_EVIDENCE_V3_SHADOW?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}
