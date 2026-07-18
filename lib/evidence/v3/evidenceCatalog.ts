import type { EvidenceCatalogEntry } from "@/lib/evidence/v3/evidenceTypes";

export const EVIDENCE_V3_CATALOG_VERSION = "evidence-catalog-v3.0";

export const EVIDENCE_V3_CATALOG: readonly EvidenceCatalogEntry[] = [
  {
    id: "ODDS_IMPLIED_VALUE",
    name: "Implied Value Gap",
    description:
      "Moneyline implied probability gap between favorite and second selection.",
    category: "market",
    source: "parser + normalized markets",
    updateFrequency: "per match",
    weightOwner: "decision.weights.market",
  },
  {
    id: "FORM_RECENT_10",
    name: "Recent 10 Form",
    description:
      "Recent 10-match form edge from team profile snapshots (no mock fallback).",
    category: "team",
    source: "teamProfile provider",
    updateFrequency: "daily / per fixture",
    weightOwner: "decision.weights.form",
  },
  {
    id: "PROVIDER_CONFIDENCE",
    name: "Provider Confidence",
    description:
      "Aggregate provider resolution confidence from provider audit.",
    category: "meta",
    source: "provider resolution audit",
    updateFrequency: "per match",
    weightOwner: "decision.weights.meta",
  },
] as const;

export type EvidenceV3CatalogId = (typeof EVIDENCE_V3_CATALOG)[number]["id"];

export const EVIDENCE_V3_CATALOG_IDS: readonly EvidenceV3CatalogId[] =
  EVIDENCE_V3_CATALOG.map((entry) => entry.id);

export function getEvidenceCatalogEntry(
  id: string
): EvidenceCatalogEntry | undefined {
  return EVIDENCE_V3_CATALOG.find((entry) => entry.id === id);
}
