import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildAdminDashboardResponse } from "@/lib/admin/adminDashboardService";
import type {
  OperationsDashboardArtifacts,
  OperationsDashboardSnapshot,
  OperationsDataCompletenessSection,
} from "@/lib/admin/operationsDashboardTypes";
import { isDecisionV3ShadowEnabled } from "@/lib/decision/v3/decisionConfig";
import { DECISION_V3_CATALOG_VERSION } from "@/lib/decision/v3/decisionTypes";
import { resolveDecisionEvidenceWeights } from "@/lib/decision/v3/decisionWeightLoader";
import { EVIDENCE_V3_CATALOG_VERSION } from "@/lib/evidence/v3/evidenceCatalog";
import { isEvidenceV3ShadowEnabled } from "@/lib/evidence/v3/evidenceConfig";
import { SUPPORTED_DECISION_V3_EVIDENCE_IDS } from "@/lib/decision/v3/decisionConfig";
import type { ProductionHealthCheckReport } from "@/lib/healthCheck/types";
import { loadAdminMatchRecords } from "@/lib/admin/adminRecordLoader";
import { loadRuntimeWeightConfigForProduction } from "@/lib/recommendation/runtimeWeightConfigLoader";
import { isRecommendationDualWriteEnabled } from "@/lib/recommendation/v3/recommendationDualWriteConfig";
import type { DecisionV3ReplayValidationReport } from "@/lib/replay/v3/decisionV3ReplayValidationTypes";
import { getSchedulerStatus } from "@/lib/scheduler/schedulerService";
import { isSchedulerEnabled } from "@/lib/scheduler/schedulerEnabled";
import type { SystemValidationReport } from "@/lib/systemValidation/systemValidationTypes";

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function readJsonArtifact<T>(relativePath: string): T | null {
  try {
    const filePath = resolve(/* turbopackIgnore: true */ process.cwd(), relativePath);
    if (!existsSync(filePath)) {
      return null;
    }
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function loadOperationsArtifacts(): OperationsDashboardArtifacts {
  return {
    replayValidation: readJsonArtifact<DecisionV3ReplayValidationReport>(
      "artifacts/decision-v3-replay-validation.json"
    ),
    healthCheck: readJsonArtifact<ProductionHealthCheckReport>(
      "artifacts/health-check-report.json"
    ),
    systemValidation: readJsonArtifact<SystemValidationReport>(
      "artifacts/system-validation-report.json"
    ),
  };
}

function resolveEnvironmentLabel(): string {
  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV;
  }
  return process.env.NODE_ENV ?? "development";
}

function resolveGitCommit(
  artifacts: OperationsDashboardArtifacts
): string | null {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ??
    artifacts.systemValidation?.gitCommit ??
    artifacts.healthCheck?.gitCommit ??
    null
  );
}

function resolveLastDeploy(artifacts: OperationsDashboardArtifacts): string | null {
  return (
    artifacts.systemValidation?.completedAt ??
    artifacts.healthCheck?.completedAt ??
    null
  );
}

function countVerifiedRecords(records: Awaited<ReturnType<typeof loadAdminMatchRecords>>): number {
  return records.filter((record) => record.status === "VERIFIED").length;
}

export function summarizeSchedulerExecutions(
  runDate: string,
  recentExecutions: Awaited<ReturnType<typeof getSchedulerStatus>>["recentExecutions"]
): {
  fixturesFetchedToday: number;
  successCount: number;
  failureCount: number;
  dataCompleteness: OperationsDataCompletenessSection;
} {
  const todayExecutions = recentExecutions.filter((entry) => {
    if (entry.runDate === runDate) {
      return true;
    }
    return entry.startedAt.startsWith(runDate);
  });

  let fixturesFetchedToday = 0;
  const dataCompleteness: OperationsDataCompletenessSection = {
    inserted: 0,
    duplicateSkipped: 0,
    historicalBackfillEnriched: 0,
    incompleteAnalysisRejected: 0,
    conflictingRecords: 0,
    oddsMissing: 0,
    settleableMarketMissing: 0,
    analysisSnapshotMissing: 0,
  };
  for (const entry of todayExecutions) {
    if (entry.jobName !== "daily_analysis") {
      continue;
    }
    const fixturesFetched = entry.context?.fixturesFetched;
    if (typeof fixturesFetched === "number" && Number.isFinite(fixturesFetched)) {
      fixturesFetchedToday += fixturesFetched;
    }
    const stats = entry.context?.dataCompleteness as
      | OperationsDataCompletenessSection
      | undefined;
    if (!stats) {
      continue;
    }
    dataCompleteness.inserted += stats.inserted ?? 0;
    dataCompleteness.duplicateSkipped += stats.duplicateSkipped ?? 0;
    dataCompleteness.historicalBackfillEnriched += stats.historicalBackfillEnriched ?? 0;
    dataCompleteness.incompleteAnalysisRejected += stats.incompleteAnalysisRejected ?? 0;
    dataCompleteness.conflictingRecords += stats.conflictingRecords ?? 0;
    dataCompleteness.oddsMissing += stats.oddsMissing ?? 0;
    dataCompleteness.settleableMarketMissing += stats.settleableMarketMissing ?? 0;
    dataCompleteness.analysisSnapshotMissing += stats.analysisSnapshotMissing ?? 0;
  }

  return {
    fixturesFetchedToday,
    successCount: todayExecutions.filter((entry) => entry.success).length,
    failureCount: todayExecutions.filter((entry) => !entry.success).length,
    dataCompleteness,
  };
}

export async function buildOperationsDashboardSnapshot(
  now = new Date()
): Promise<OperationsDashboardSnapshot> {
  const runDate = todayKey(now);
  const artifacts = loadOperationsArtifacts();
  const [dashboard, scheduler, records, runtimeWeightConfig] = await Promise.all([
    buildAdminDashboardResponse(now),
    getSchedulerStatus({
      runDate,
      listRecords: loadAdminMatchRecords,
    }),
    loadAdminMatchRecords(),
    loadRuntimeWeightConfigForProduction().catch(() => null),
  ]);

  const executionSummary = summarizeSchedulerExecutions(
    runDate,
    scheduler.recentExecutions
  );
  const resolvedDecisionWeights = resolveDecisionEvidenceWeights(runtimeWeightConfig);
  const replayVerdict = artifacts.replayValidation?.verdict ?? "UNKNOWN";
  const agreementRate =
    artifacts.replayValidation?.agreement?.overallAgreementRate ?? null;
  const legacyAnalyzedToday = dashboard.analysis.analyzedToday;
  const shadowEnabled =
    isEvidenceV3ShadowEnabled() ||
    isDecisionV3ShadowEnabled() ||
    isRecommendationDualWriteEnabled();

  return {
    scheduler: {
      runDate,
      fixturesFetchedToday: executionSummary.fixturesFetchedToday,
      successCount: executionSummary.successCount,
      failureCount: executionSummary.failureCount,
      nextDailyRun: scheduler.nextRun.daily,
      nextResultRun: scheduler.nextRun.result,
      enabled: isSchedulerEnabled(),
      health: artifacts.healthCheck?.schedulerStatus ?? "UNKNOWN",
      dataCompleteness: executionSummary.dataCompleteness,
    },
    production: {
      legacyAnalyzedToday,
      decisionShadowAnalyzedToday: shadowEnabled ? legacyAnalyzedToday : 0,
      agreementPercent:
        agreementRate === null ? null : Math.round(agreementRate * 10000) / 100,
      dualWriteEnabled: isRecommendationDualWriteEnabled(),
      decisionShadowEnabled: isDecisionV3ShadowEnabled(),
      evidenceShadowEnabled: isEvidenceV3ShadowEnabled(),
    },
    replay: {
      eligibleRecords: artifacts.replayValidation?.dataset.eligibleRecords ?? 0,
      verifiedTotal: countVerifiedRecords(records),
      replayVerdict,
      replayGeneratedAt: artifacts.replayValidation?.generatedAt ?? null,
      totalRecords: artifacts.replayValidation?.dataset.totalRecords ?? records.length,
    },
    provider: {
      apiFootball: {
        usedToday: scheduler.apiUsage.usedToday,
        remainingToday: scheduler.apiUsage.remainingToday,
        minuteUsed: scheduler.apiUsage.minuteUsed,
        minuteLimit: scheduler.apiUsage.minuteLimit,
        health: artifacts.healthCheck?.apiFootballStatus ?? "UNKNOWN",
      },
      googleSearch: {
        searchesToday: scheduler.googleUsage.searchesToday,
        remainingToday: scheduler.googleUsage.remainingToday,
        dailyLimit: scheduler.googleUsage.dailyLimit,
        health: artifacts.healthCheck?.geminiStatus ?? "UNKNOWN",
      },
      supabase: {
        configured: dashboard.system.supabase.configured,
        connected: dashboard.system.supabase.connected,
        health: artifacts.healthCheck?.supabaseStatus ?? "UNKNOWN",
        matchRecords: dashboard.system.supabase.tables.match_records,
      },
      scheduler: {
        enabled: isSchedulerEnabled(),
        health: artifacts.healthCheck?.schedulerStatus ?? "UNKNOWN",
      },
    },
    decision: {
      shadowEnabled: isDecisionV3ShadowEnabled(),
      dualWriteEnabled: isRecommendationDualWriteEnabled(),
      weightVersion:
        runtimeWeightConfig?.activeVersion?.version ??
        resolvedDecisionWeights.version,
      weightSource: resolvedDecisionWeights.source,
      catalogVersion: DECISION_V3_CATALOG_VERSION,
    },
    evidence: {
      catalogVersion: EVIDENCE_V3_CATALOG_VERSION,
      shadowEnabled: isEvidenceV3ShadowEnabled(),
      supportedEvidenceIds: [...SUPPORTED_DECISION_V3_EVIDENCE_IDS],
      collectedLabel: SUPPORTED_DECISION_V3_EVIDENCE_IDS.join(", "),
      missingLabel: "Per-run shadow only",
      blockedLabel: "Per-run shadow only",
    },
    system: {
      version: "v1.0 Beta",
      gitCommit: resolveGitCommit(artifacts),
      buildStatus: artifacts.systemValidation?.build.status ?? "UNKNOWN",
      lastDeploy: resolveLastDeploy(artifacts),
      environment: resolveEnvironmentLabel(),
      systemValidationStatus: artifacts.systemValidation?.overallStatus ?? null,
      generatedAt: now.toISOString(),
    },
  };
}

export { loadOperationsArtifacts };
