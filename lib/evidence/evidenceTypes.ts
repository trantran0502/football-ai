export type EvidenceCategory =
  | "marketEngine"
  | "h2h"
  | "recent10Matches"
  | "homeForm"
  | "awayForm"
  | "teamProfile"
  | "teamEngine"
  | "xg"
  | "xga"
  | "leagueStrength"
  | "squadAvailability"
  | "matchContext";

export const EVIDENCE_CATEGORIES: readonly EvidenceCategory[] = [
  "marketEngine",
  "h2h",
  "recent10Matches",
  "homeForm",
  "awayForm",
  "teamProfile",
  "teamEngine",
  "xg",
  "xga",
  "leagueStrength",
  "squadAvailability",
  "matchContext",
] as const;

export interface EvidenceItem {
  evidenceId: string;
  category: EvidenceCategory;
  score: number;
  confidence: number;
  source: string;
  summary: string;
  details: Record<string, unknown>;
}

export type EvidenceImpactDirection = "support" | "oppose" | "neutral";

export interface EvidenceBreakdownItem {
  evidenceId: string;
  category: EvidenceCategory;
  rawScore: number;
  adjustedScore: number;
  confidence: number;
  impact: EvidenceImpactDirection;
  source: string;
  summary: string;
}

export interface EvidenceIntegrationResult {
  evidenceScore: number;
  evidenceConfidence: number;
  evidenceSummary: string[];
  evidenceBreakdown: EvidenceBreakdownItem[];
}

export interface EvidenceReport {
  overallEvidenceScore: number;
  overallConfidence: number;
  positiveEvidence: EvidenceItem[];
  negativeEvidence: EvidenceItem[];
  missingEvidence: EvidenceCategory[];
}

export interface EvidenceEngineInput {
  fusion: import("@/lib/analysis/featureScore/fusion/fusionTypes").FeatureFusionResult;
  features?: import("@/lib/analysis/featureScore/types").FeatureScore[];
  marketSelections: import("@/types/match").MarketSelection[];
  providerAudit?: import("@/lib/providers/teamProfile/teamProfileProviderPipeline").ProviderResolutionAudit | null;
  teamProfiles?: import("@/lib/teamProfile/teamProfileTypes").MatchTeamProfilesSnapshot | null;
}
