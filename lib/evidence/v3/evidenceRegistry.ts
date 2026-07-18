import type { EvidenceProvider } from "@/lib/evidence/v3/evidenceTypes";
import { collectFormRecent10Evidence } from "@/lib/evidence/v3/providers/formRecent10Provider";
import { collectOddsImpliedValueEvidence } from "@/lib/evidence/v3/providers/oddsImpliedValueProvider";
import { collectProviderConfidenceEvidence } from "@/lib/evidence/v3/providers/providerConfidenceProvider";

const DEFAULT_PROVIDERS: EvidenceProvider[] = [
  {
    id: "ODDS_IMPLIED_VALUE",
    collect: collectOddsImpliedValueEvidence,
  },
  {
    id: "FORM_RECENT_10",
    collect: collectFormRecent10Evidence,
  },
  {
    id: "PROVIDER_CONFIDENCE",
    collect: collectProviderConfidenceEvidence,
  },
];

export function getEvidenceV3Providers(
  providers: EvidenceProvider[] = DEFAULT_PROVIDERS
): EvidenceProvider[] {
  return [...providers];
}

export function getEvidenceV3ProviderById(
  id: string,
  providers: EvidenceProvider[] = DEFAULT_PROVIDERS
): EvidenceProvider | undefined {
  return providers.find((provider) => provider.id === id);
}
