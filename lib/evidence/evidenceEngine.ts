import { clampConfidence, clampScore } from "@/lib/analysis/featureScore/oddsConversion";
import {
  collectAwayFormEvidence,
  collectH2hEvidence,
  collectHomeFormEvidence,
  collectLeagueStrengthEvidence,
  collectMarketEngineEvidence,
  collectMatchContextEvidence,
  collectRecent10MatchesEvidence,
  collectSquadAvailabilityEvidence,
  collectTeamEngineEvidence,
  collectTeamProfileEvidence,
  collectXgEvidence,
  collectXgaEvidence,
} from "@/lib/evidence/evidenceProviders";
import type {
  EvidenceCategory,
  EvidenceEngineInput,
  EvidenceItem,
  EvidenceReport,
} from "@/lib/evidence/evidenceTypes";
import { EVIDENCE_CATEGORIES } from "@/lib/evidence/evidenceTypes";
import { runMarketEngineForRecommendations } from "@/lib/recommendation/marketEngineIntegration";

export class EvidenceEngine {
  collect(input: EvidenceEngineInput): EvidenceReport {
    return buildEvidenceReport(input);
  }
}

export function buildEvidenceReport(input: EvidenceEngineInput): EvidenceReport {
  const marketSnapshot = runMarketEngineForRecommendations(input.marketSelections);

  const collectors: Array<EvidenceItem | null> = [
    collectMarketEngineEvidence(input.marketSelections, marketSnapshot),
    collectH2hEvidence(input.fusion, input.providerAudit),
    collectRecent10MatchesEvidence(
      input.fusion,
      input.features,
      input.providerAudit
    ),
    collectHomeFormEvidence(input.fusion, input.features, input.providerAudit),
    collectAwayFormEvidence(input.fusion, input.features, input.providerAudit),
    collectTeamProfileEvidence(input.teamProfiles),
    collectTeamEngineEvidence(input.teamProfiles),
    collectXgEvidence(input.fusion, input.features, input.providerAudit),
    collectXgaEvidence(input.fusion, input.features, input.providerAudit),
    collectLeagueStrengthEvidence(input.fusion, input.providerAudit),
    collectSquadAvailabilityEvidence(input.fusion, input.providerAudit),
    collectMatchContextEvidence(input.fusion, input.providerAudit),
  ];

  const availableItems = collectors.filter(
    (item): item is EvidenceItem => item !== null
  );
  const availableCategories = new Set(
    availableItems.map((item) => item.category)
  );
  const missingEvidence = EVIDENCE_CATEGORIES.filter(
    (category) => !availableCategories.has(category)
  );

  const totalWeight = availableItems.reduce(
    (sum, item) => sum + item.confidence,
    0
  );
  const overallEvidenceScore =
    totalWeight > 0
      ? clampScore(
          availableItems.reduce(
            (sum, item) => sum + item.score * item.confidence,
            0
          ) / totalWeight
        )
      : 0;
  const overallConfidence =
    availableItems.length > 0
      ? clampConfidence(totalWeight / availableItems.length)
      : 0;

  const positiveEvidence = availableItems.filter((item) => item.score > 0);
  const negativeEvidence = availableItems.filter((item) => item.score < 0);

  return {
    overallEvidenceScore,
    overallConfidence,
    positiveEvidence,
    negativeEvidence,
    missingEvidence,
  };
}

export function collectEvidence(input: EvidenceEngineInput): EvidenceReport {
  return new EvidenceEngine().collect(input);
}

export function summarizeEvidenceCategories(
  report: EvidenceReport
): Record<EvidenceCategory, "available" | "missing"> {
  const summary = Object.fromEntries(
    EVIDENCE_CATEGORIES.map((category) => [category, "missing" as const])
  ) as Record<EvidenceCategory, "available" | "missing">;

  for (const category of EVIDENCE_CATEGORIES) {
    if (!report.missingEvidence.includes(category)) {
      summary[category] = "available";
    }
  }

  return summary;
}
