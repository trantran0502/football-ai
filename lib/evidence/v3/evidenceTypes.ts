import type { MarketType } from "@/types/match";

export type EvidenceCategoryV3 =
  | "market"
  | "team"
  | "squad"
  | "context"
  | "meta";

export type EvidenceDirectionV3 =
  | "home"
  | "away"
  | "draw"
  | "over"
  | "under"
  | "neutral";

export interface EvidenceCatalogEntry {
  id: string;
  name: string;
  description: string;
  category: EvidenceCategoryV3;
  source: string;
  updateFrequency: string;
  weightOwner: string;
}

export interface EvidenceSourceRef {
  provider: string;
  resolutionChain?: string[];
  freshnessHours?: number;
}

export interface EvidenceMetadata {
  category: EvidenceCategoryV3;
  direction: EvidenceDirectionV3;
  source: EvidenceSourceRef;
  capturedAt: string;
  fixtureId?: number;
  marketType?: MarketType;
  rawMetrics?: Record<string, number>;
  flags?: string[];
}

export interface EvidenceResult {
  id: string;
  score: number;
  confidence: number;
  reason: string;
  metadata: EvidenceMetadata;
}

export interface EvidenceCollectionResult {
  evidence: EvidenceResult[];
  missing: string[];
  blocked: string[];
  catalogVersion: string;
  collectedAt: string;
}

export type EvidenceProviderOutcome =
  | { status: "collected"; result: EvidenceResult }
  | { status: "missing" }
  | { status: "blocked" };

export interface EvidenceProvider {
  id: string;
  collect(context: EvidenceCollectorContext): EvidenceProviderOutcome;
}

export interface EvidenceCollectorContext {
  homeTeam: string;
  awayTeam: string;
  league?: string;
  matchDate?: string;
  fixtureId?: number;
  marketSelections: import("@/types/match").MarketSelection[];
  providerAudit: import("@/lib/providers/teamProfile/teamProfileProviderPipeline").ProviderResolutionAudit | null;
  teamProfiles?: import("@/lib/teamProfile/teamProfileTypes").MatchTeamProfilesSnapshot | null;
  collectedAt?: string;
}

export interface EvidenceV3Observability {
  catalogVersion: string;
  collected: string[];
  missing: string[];
  blocked: string[];
}

export interface EvidenceV3ShadowContext {
  enabled: boolean;
  collectedAt: string;
  evidenceV3: EvidenceV3Observability;
}
