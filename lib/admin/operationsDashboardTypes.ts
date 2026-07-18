import type { ProductionHealthCheckReport } from "@/lib/healthCheck/types";
import type { DecisionV3ReplayValidationReport } from "@/lib/replay/v3/decisionV3ReplayValidationTypes";
import type { SystemValidationReport } from "@/lib/systemValidation/systemValidationTypes";

export interface OperationsSchedulerSection {
  runDate: string;
  fixturesFetchedToday: number;
  successCount: number;
  failureCount: number;
  nextDailyRun: string | null;
  nextResultRun: string | null;
  enabled: boolean;
  health: string;
  dataCompleteness: OperationsDataCompletenessSection;
}

export interface OperationsDataCompletenessSection {
  inserted: number;
  duplicateSkipped: number;
  historicalBackfillEnriched: number;
  incompleteAnalysisRejected: number;
  conflictingRecords: number;
  oddsMissing: number;
  settleableMarketMissing: number;
  analysisSnapshotMissing: number;
}

export interface OperationsProductionSection {
  legacyAnalyzedToday: number;
  decisionShadowAnalyzedToday: number;
  agreementPercent: number | null;
  dualWriteEnabled: boolean;
  decisionShadowEnabled: boolean;
  evidenceShadowEnabled: boolean;
}

export interface OperationsReplaySection {
  eligibleRecords: number;
  verifiedTotal: number;
  replayVerdict:
    | "INSUFFICIENT_DATA"
    | "PRELIMINARY"
    | "DECISION_CANDIDATE"
    | "LEGACY_REMAINS_PRIMARY"
    | "UNKNOWN";
  replayGeneratedAt: string | null;
  totalRecords: number;
}

export interface OperationsProviderSection {
  apiFootball: {
    usedToday: number;
    remainingToday: number;
    minuteUsed: number;
    minuteLimit: number;
    health: string;
  };
  googleSearch: {
    searchesToday: number;
    remainingToday: number | null;
    dailyLimit: number | null;
    health: string;
  };
  supabase: {
    configured: boolean;
    connected: boolean;
    health: string;
    matchRecords: number;
  };
  scheduler: {
    enabled: boolean;
    health: string;
  };
}

export interface OperationsDecisionSection {
  shadowEnabled: boolean;
  dualWriteEnabled: boolean;
  weightVersion: number | null;
  weightSource: "runtime" | "fallback" | "shadow" | "unknown";
  catalogVersion: string;
}

export interface OperationsEvidenceSection {
  catalogVersion: string;
  shadowEnabled: boolean;
  supportedEvidenceIds: string[];
  collectedLabel: string;
  missingLabel: string;
  blockedLabel: string;
}

export interface OperationsSystemSection {
  version: string;
  gitCommit: string | null;
  buildStatus: string;
  lastDeploy: string | null;
  environment: string;
  systemValidationStatus: string | null;
  generatedAt: string;
}

export interface OperationsDashboardSnapshot {
  scheduler: OperationsSchedulerSection;
  production: OperationsProductionSection;
  replay: OperationsReplaySection;
  provider: OperationsProviderSection;
  decision: OperationsDecisionSection;
  evidence: OperationsEvidenceSection;
  system: OperationsSystemSection;
}

export interface OperationsDashboardArtifacts {
  replayValidation: DecisionV3ReplayValidationReport | null;
  healthCheck: ProductionHealthCheckReport | null;
  systemValidation: SystemValidationReport | null;
}
