import {
  getPipelineStepEvents,
  recordPipelineFailure,
  recordPipelineSuccess,
  type PipelineStepKey,
} from "@/lib/admin/pipelineEventStore";
import { withSupabaseRetry, type RetryAttemptLog } from "@/lib/admin/supabaseRetry";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { buildRecommendationLearningRecord } from "@/lib/recommendation/recommendationLearningBuilder";
import {
  buildRecommendationLearningDebugReport,
  inspectLearningRecordCompleteness,
} from "@/lib/recommendation/recommendationLearningDiagnostics";
import {
  runRecommendationLearningBackfill,
  scanRecommendationLearningBackfillCandidates,
  type RecommendationLearningBackfillResult,
  type RecommendationLearningBackfillScanResult,
} from "@/lib/recommendation/recommendationLearningBackfill";
import type { RecommendationLearningRecord } from "@/lib/recommendation/recommendationLearningTypes";
import { buildWeightOptimizerReport } from "@/lib/recommendation/weightOptimizer";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { listMatchRecordsFromSupabase } from "@/lib/supabase/queries/matchRecords";
import { listRecommendationLearningFromSupabase } from "@/lib/supabase/services/recommendationLearningService";

export type HealthStatus = "healthy" | "warning" | "failed";

export interface SystemHealthItem {
  name: string;
  status: HealthStatus;
  reason: string;
}

export interface LearningStatistics {
  totalVerified: number;
  learningRecords: number;
  completeRecords: number;
  incompleteRecords: number;
  coveragePercent: number;
  missingProviderDiagnostics: number;
  missingRecommendation: number;
  missingMarketOutcomes: number;
  missingOverallConfidence: number;
}

export interface PipelineInspectorStep {
  id: PipelineStepKey;
  label: string;
  status: "SUCCESS" | "WARNING" | "FAILED";
  reason: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
}

export interface WeightOptimizerDiagnosticsSummary {
  waiting: boolean;
  recordsRead: number;
  recordsUsed: number;
  recordsComplete: number;
  currentMarketWeight: number;
  suggestedMarketWeight: number;
  sampleSize: number;
  hitRate: number;
  roi: number;
  sampleReliability: number;
  status: string;
  missingCounts: {
    providerDiagnostics: number;
    marketOutcomes: number;
    recommendation: number;
    providerOverallConfidence: number;
  };
  skipReasons: Record<string, number>;
}

export interface AutomatedLearningPipelineResult {
  generatedAt: string;
  scan: RecommendationLearningBackfillScanResult | null;
  backfill: RecommendationLearningBackfillResult | null;
  statistics: LearningStatistics;
  health: SystemHealthItem[];
  pipeline: PipelineInspectorStep[];
  weightOptimizer: WeightOptimizerDiagnosticsSummary;
  retryLogs: RetryAttemptLog[];
  errors: string[];
}

function listVerified(records: HistoricalMatchRecord[]): HistoricalMatchRecord[] {
  return records.filter((record) => record.status === "VERIFIED" && record.result !== null);
}

function countVerifiedMissing(
  verified: HistoricalMatchRecord[],
  predicate: (built: RecommendationLearningRecord) => boolean
): number {
  let count = 0;
  for (const record of verified) {
    const built = buildRecommendationLearningRecord(record);
    if (!built) {
      count += 1;
      continue;
    }
    if (predicate(built)) {
      count += 1;
    }
  }
  return count;
}

export function buildLearningStatistics(input: {
  matchRecords: HistoricalMatchRecord[];
  learningRecords: RecommendationLearningRecord[];
}): LearningStatistics {
  const verified = listVerified(input.matchRecords);
  let completeRecords = 0;
  let missingProviderDiagnostics = 0;
  let missingRecommendation = 0;
  let missingMarketOutcomes = 0;
  let missingOverallConfidence = 0;

  for (const record of input.learningRecords) {
    const completeness = inspectLearningRecordCompleteness(record);
    if (completeness.complete) {
      completeRecords += 1;
    }
    if (completeness.skipReasons.includes("missing_provider_diagnostics")) {
      missingProviderDiagnostics += 1;
    }
    if (completeness.skipReasons.includes("missing_recommendation")) {
      missingRecommendation += 1;
    }
    if (completeness.skipReasons.includes("missing_market_outcomes")) {
      missingMarketOutcomes += 1;
    }
    if (completeness.skipReasons.includes("missing_provider_overall_confidence")) {
      missingOverallConfidence += 1;
    }
  }

  const verifiedMissingProvider = countVerifiedMissing(
    verified,
    (built) =>
      !built.providerDiagnostics ||
      built.providerDiagnostics.length === 0 ||
      inspectLearningRecordCompleteness(built).skipReasons.includes("missing_provider_diagnostics")
  );
  const verifiedMissingRecommendation = countVerifiedMissing(
    verified,
    (built) => built.recommendation === null
  );
  const verifiedMissingMarket = countVerifiedMissing(verified, (built) => {
    const decisive = built.marketOutcomes.filter((o) => o.result !== "PUSH");
    return decisive.length === 0 && built.totalStake <= 0;
  });
  const verifiedMissingConfidence = countVerifiedMissing(
    verified,
    (built) => built.providerOverallConfidence === null
  );

  return {
    totalVerified: verified.length,
    learningRecords: input.learningRecords.length,
    completeRecords,
    incompleteRecords: input.learningRecords.length - completeRecords,
    coveragePercent:
      verified.length > 0
        ? Math.round((input.learningRecords.length / verified.length) * 1000) / 10
        : 0,
    missingProviderDiagnostics: Math.max(missingProviderDiagnostics, verifiedMissingProvider),
    missingRecommendation: Math.max(missingRecommendation, verifiedMissingRecommendation),
    missingMarketOutcomes: Math.max(missingMarketOutcomes, verifiedMissingMarket),
    missingOverallConfidence: Math.max(missingOverallConfidence, verifiedMissingConfidence),
  };
}

function deriveRecommendationStatus(
  matchRecords: HistoricalMatchRecord[]
): { status: "SUCCESS" | "WARNING" | "FAILED"; reason: string } {
  const withRecommendation = matchRecords.filter(
    (record) => record.analysisSnapshot?.recommendation?.result !== null &&
      record.analysisSnapshot?.recommendation?.result !== undefined
  );
  if (withRecommendation.length === 0) {
    return { status: "FAILED", reason: "No match_records with analysis_snapshot.recommendation.result" };
  }
  if (withRecommendation.length < matchRecords.length * 0.5) {
    return {
      status: "WARNING",
      reason: `${withRecommendation.length}/${matchRecords.length} records have recommendation snapshots`,
    };
  }
  return {
    status: "SUCCESS",
    reason: `${withRecommendation.length} records with recommendation snapshots`,
  };
}

function deriveValidationStatus(
  verified: HistoricalMatchRecord[]
): { status: "SUCCESS" | "WARNING" | "FAILED"; reason: string } {
  if (verified.length === 0) {
    return { status: "WARNING", reason: "No VERIFIED match_records yet" };
  }
  const withValidation = verified.filter(
    (record) =>
      (record.verificationResult?.recommendationValidation?.entries?.length ?? 0) > 0 ||
      (record.analysisSnapshot?.replay?.validation?.entries?.length ?? 0) > 0
  );
  if (withValidation.length === 0) {
    return { status: "FAILED", reason: "VERIFIED records missing validation entries" };
  }
  if (withValidation.length < verified.length) {
    return {
      status: "WARNING",
      reason: `${withValidation.length}/${verified.length} VERIFIED records have validation entries`,
    };
  }
  return {
    status: "SUCCESS",
    reason: `${withValidation.length} VERIFIED records with validation`,
  };
}

export function buildPipelineInspector(input: {
  matchRecords: HistoricalMatchRecord[];
  learningRecords: RecommendationLearningRecord[];
  statistics: LearningStatistics;
  weightOptimizer: WeightOptimizerDiagnosticsSummary;
}): PipelineInspectorStep[] {
  const events = getPipelineStepEvents();
  const verified = listVerified(input.matchRecords);
  const recommendation = deriveRecommendationStatus(input.matchRecords);
  const validation = deriveValidationStatus(verified);

  let learningStatus: "SUCCESS" | "WARNING" | "FAILED" = "FAILED";
  let learningReason = "No recommendation_learning records";
  if (input.statistics.learningRecords > 0 && input.statistics.completeRecords === 0) {
    learningStatus = "WARNING";
    learningReason = `${input.statistics.learningRecords} learning records, 0 complete`;
  } else if (input.statistics.completeRecords > 0) {
    learningStatus = "SUCCESS";
    learningReason = `${input.statistics.completeRecords} complete learning records`;
  } else if (input.statistics.learningRecords > 0) {
    learningStatus = "WARNING";
    learningReason = `${input.statistics.incompleteRecords} incomplete learning records`;
  }

  let optimizerStatus: "SUCCESS" | "WARNING" | "FAILED" = "FAILED";
  let optimizerReason = "Weight Optimizer waiting for complete records";
  if (input.weightOptimizer.recordsUsed > 0) {
    optimizerStatus = "SUCCESS";
    optimizerReason = `Analyzing ${input.weightOptimizer.recordsUsed} complete records`;
  } else if (input.statistics.completeRecords > 0) {
    optimizerStatus = "WARNING";
    optimizerReason = "Complete records exist but optimizer sample filter removed all";
  } else if (input.statistics.learningRecords > 0) {
    optimizerStatus = "WARNING";
    optimizerReason = "Learning records exist but none pass completeness filter";
  }

  return [
    {
      id: "recommendation",
      label: "Recommendation",
      status: recommendation.status,
      reason: recommendation.reason,
      ...events.recommendation,
    },
    {
      id: "validation",
      label: "Validation",
      status: validation.status,
      reason: validation.reason,
      ...events.validation,
    },
    {
      id: "learning",
      label: "Learning",
      status: learningStatus,
      reason: learningReason,
      ...events.learning,
    },
    {
      id: "weight_optimizer",
      label: "Weight Optimizer",
      status: optimizerStatus,
      reason: optimizerReason,
      ...events.weight_optimizer,
    },
  ];
}

export function buildSystemHealth(input: {
  statistics: LearningStatistics;
  pipeline: PipelineInspectorStep[];
  supabaseConfigured: boolean;
  retryErrors: string[];
}): SystemHealthItem[] {
  const supabaseStatus: SystemHealthItem = !input.supabaseConfigured
    ? { name: "Supabase", status: "failed", reason: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing" }
    : input.retryErrors.length > 0
      ? {
          name: "Supabase",
          status: "warning",
          reason: `Connected with retry recovery: ${input.retryErrors.at(-1)}`,
        }
      : { name: "Supabase", status: "healthy", reason: "Connection available" };

  const learningStep = input.pipeline.find((step) => step.id === "learning");
  const optimizerStep = input.pipeline.find((step) => step.id === "weight_optimizer");

  const learningHealth: SystemHealthItem = {
    name: "Recommendation Learning",
    status:
      learningStep?.status === "SUCCESS"
        ? "healthy"
        : learningStep?.status === "WARNING"
          ? "warning"
          : "failed",
    reason: learningStep?.reason ?? "Unknown",
  };

  const optimizerHealth: SystemHealthItem = {
    name: "Weight Optimizer",
    status:
      optimizerStep?.status === "SUCCESS"
        ? "healthy"
        : optimizerStep?.status === "WARNING"
          ? "warning"
          : "failed",
    reason: optimizerStep?.reason ?? "Unknown",
  };

  const matchRecordsHealth: SystemHealthItem = {
    name: "Match Records",
    status:
      input.statistics.totalVerified === 0
        ? "warning"
        : input.statistics.coveragePercent >= 50
          ? "healthy"
          : "warning",
    reason:
      input.statistics.totalVerified === 0
        ? "No VERIFIED match_records"
        : `${input.statistics.totalVerified} VERIFIED, ${input.statistics.coveragePercent}% learning coverage`,
  };

  return [supabaseStatus, matchRecordsHealth, learningHealth, optimizerHealth];
}

export function buildWeightOptimizerDiagnosticsSummary(input: {
  learningRecords: RecommendationLearningRecord[];
  matchRecords: HistoricalMatchRecord[];
  statistics: LearningStatistics;
}): WeightOptimizerDiagnosticsSummary {
  const report = buildWeightOptimizerReport(input.learningRecords);
  const verified = listVerified(input.matchRecords);

  return {
    waiting: report.diagnostics.recordsUsed === 0,
    recordsRead: report.diagnostics.recordsRead,
    recordsUsed: report.diagnostics.recordsUsed,
    recordsComplete: input.statistics.completeRecords,
    currentMarketWeight: report.overall.market.currentWeight,
    suggestedMarketWeight: report.overall.market.suggestedWeight,
    sampleSize: report.overall.market.sampleSize,
    hitRate: report.overall.market.hitRate,
    roi: report.overall.market.roi,
    sampleReliability: report.overall.market.sampleReliability,
    status: report.overall.market.status,
    missingCounts: {
      providerDiagnostics: input.statistics.missingProviderDiagnostics,
      marketOutcomes: input.statistics.missingMarketOutcomes,
      recommendation: input.statistics.missingRecommendation,
      providerOverallConfidence: input.statistics.missingOverallConfidence,
    },
    skipReasons: report.diagnostics.skipReasons,
  };
}

async function fetchMatchRecordsWithRetry(): Promise<{
  records: HistoricalMatchRecord[];
  attempts: RetryAttemptLog[];
  error: string | null;
}> {
  const result = await withSupabaseRetry(
    "list_match_records",
    "GET match_records",
    () => listMatchRecordsFromSupabase().then((payload) => payload.records)
  );
  if (!result.ok) {
    recordPipelineFailure("recommendation", result.error);
    return { records: [], attempts: result.attempts, error: result.error };
  }
  recordPipelineSuccess("recommendation");
  recordPipelineSuccess("validation");
  return { records: result.value, attempts: result.attempts, error: null };
}

async function fetchLearningRecordsWithRetry(): Promise<{
  records: RecommendationLearningRecord[];
  attempts: RetryAttemptLog[];
  error: string | null;
}> {
  const result = await withSupabaseRetry(
    "list_recommendation_learning",
    "GET recommendation_learning",
    () => listRecommendationLearningFromSupabase()
  );
  if (!result.ok) {
    recordPipelineFailure("learning", result.error);
    return { records: [], attempts: result.attempts, error: result.error };
  }
  recordPipelineSuccess("learning");
  return { records: result.value, attempts: result.attempts, error: null };
}

export async function runAutomatedLearningPipeline(): Promise<AutomatedLearningPipelineResult> {
  const generatedAt = new Date().toISOString();
  const retryLogs: RetryAttemptLog[] = [];
  const errors: string[] = [];

  if (!hasSupabaseEnv()) {
    const statistics: LearningStatistics = {
      totalVerified: 0,
      learningRecords: 0,
      completeRecords: 0,
      incompleteRecords: 0,
      coveragePercent: 0,
      missingProviderDiagnostics: 0,
      missingRecommendation: 0,
      missingMarketOutcomes: 0,
      missingOverallConfidence: 0,
    };
    const weightOptimizer = buildWeightOptimizerDiagnosticsSummary({
      learningRecords: [],
      matchRecords: [],
      statistics,
    });
    const pipeline = buildPipelineInspector({
      matchRecords: [],
      learningRecords: [],
      statistics,
      weightOptimizer,
    });
    return {
      generatedAt,
      scan: null,
      backfill: null,
      statistics,
      health: buildSystemHealth({
        statistics,
        pipeline,
        supabaseConfigured: false,
        retryErrors: ["supabase_not_configured"],
      }),
      pipeline,
      weightOptimizer,
      retryLogs,
      errors: ["supabase_not_configured"],
    };
  }

  let scan: RecommendationLearningBackfillScanResult | null = null;
  let backfill: RecommendationLearningBackfillResult | null = null;

  const scanResult = await withSupabaseRetry(
    "scan_verified_backfill",
    "scanRecommendationLearningBackfillCandidates",
    () => scanRecommendationLearningBackfillCandidates()
  );
  retryLogs.push(...scanResult.attempts);
  if (scanResult.ok) {
    scan = scanResult.value;
  } else {
    errors.push(scanResult.error);
  }

  const backfillResult = await withSupabaseRetry(
    "run_learning_backfill",
    "runRecommendationLearningBackfill",
    () => runRecommendationLearningBackfill()
  );
  retryLogs.push(...backfillResult.attempts);
  if (backfillResult.ok) {
    backfill = backfillResult.value;
    if (backfill.created > 0) {
      recordPipelineSuccess("learning");
    }
    if (backfill.failed > 0) {
      recordPipelineFailure("learning", `backfill_failed:${backfill.failed}`);
    }
  } else {
    errors.push(backfillResult.error);
    recordPipelineFailure("learning", backfillResult.error);
  }

  const matchFetch = await fetchMatchRecordsWithRetry();
  retryLogs.push(...matchFetch.attempts);
  if (matchFetch.error) {
    errors.push(matchFetch.error);
  }

  const learningFetch = await fetchLearningRecordsWithRetry();
  retryLogs.push(...learningFetch.attempts);
  if (learningFetch.error) {
    errors.push(learningFetch.error);
  }

  const statistics = buildLearningStatistics({
    matchRecords: matchFetch.records,
    learningRecords: learningFetch.records,
  });

  const weightOptimizer = buildWeightOptimizerDiagnosticsSummary({
    learningRecords: learningFetch.records,
    matchRecords: matchFetch.records,
    statistics,
  });

  if (weightOptimizer.recordsUsed > 0) {
    recordPipelineSuccess("weight_optimizer");
  } else {
    recordPipelineFailure(
      "weight_optimizer",
      weightOptimizer.waiting ? "waiting_for_complete_records" : "no_records_used"
    );
  }

  const pipeline = buildPipelineInspector({
    matchRecords: matchFetch.records,
    learningRecords: learningFetch.records,
    statistics,
    weightOptimizer,
  });

  return {
    generatedAt,
    scan,
    backfill,
    statistics,
    health: buildSystemHealth({
      statistics,
      pipeline,
      supabaseConfigured: true,
      retryErrors: errors,
    }),
    pipeline,
    weightOptimizer,
    retryLogs,
    errors,
  };
}

export async function buildSystemHealthSnapshot(): Promise<AutomatedLearningPipelineResult> {
  return runAutomatedLearningPipeline();
}
