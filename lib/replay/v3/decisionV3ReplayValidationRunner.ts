import { buildRecommendationComparison } from "@/lib/recommendation/v3/recommendationComparisonEngine";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  evaluateDecisionV3ReplayEligibility,
} from "@/lib/replay/v3/decisionV3ReplayValidationEligibility";
import {
  auditEvidenceLeakage,
  createEmptyLeakageAudit,
  incrementLeakageViolation,
} from "@/lib/replay/v3/decisionV3ReplayValidationLeakage";
import {
  buildAgreementMetrics,
  buildGroupedReport,
  buildHeadToHeadMetrics,
  buildPerformanceMetrics,
  resolveValidationVerdict,
} from "@/lib/replay/v3/decisionV3ReplayValidationMetrics";
import {
  buildEvidenceCollectorContext,
  rebuildDecisionV3,
  rebuildLegacyRecommendation,
  resolveFixtureKey,
  resolveProviderConfidence,
  resolveValidationDataSource,
} from "@/lib/replay/v3/decisionV3ReplayValidationRebuild";
import {
  DECISION_V3_REPLAY_DEFAULT_STAKE,
  settleDecisionOutcome,
  settleLegacyRecommendation,
} from "@/lib/replay/v3/decisionV3ReplayValidationSettlement";
import type {
  DecisionV3ReplayDatasetSummary,
  DecisionV3ReplayExclusionReason,
  DecisionV3ReplayMatchResult,
  DecisionV3ReplayValidationOptions,
  DecisionV3ReplayValidationReport,
  DecisionV3ReplayValidationRunResult,
} from "@/lib/replay/v3/decisionV3ReplayValidationTypes";
import { DECISION_V3_REPLAY_VALIDATION_SCHEMA } from "@/lib/replay/v3/decisionV3ReplayValidationTypes";

function normalizeOptions(
  options: DecisionV3ReplayValidationOptions = {}
): Required<DecisionV3ReplayValidationOptions> {
  return {
    includeMockFixtures: options.includeMockFixtures ?? false,
    flatStake: options.flatStake ?? DECISION_V3_REPLAY_DEFAULT_STAKE,
    assumedKickoffHourUtc: options.assumedKickoffHourUtc ?? 15,
  };
}

function incrementExclusion(
  summary: DecisionV3ReplayDatasetSummary,
  reason: DecisionV3ReplayExclusionReason
): void {
  summary.excludedRecords += 1;
  summary.exclusionReasons[reason] = (summary.exclusionReasons[reason] ?? 0) + 1;
}

function processRecord(
  record: HistoricalMatchRecord,
  options: Required<DecisionV3ReplayValidationOptions>,
  dataset: DecisionV3ReplayDatasetSummary,
  leakageAudit: ReturnType<typeof createEmptyLeakageAudit>
): DecisionV3ReplayMatchResult | null {
  const eligibility = evaluateDecisionV3ReplayEligibility(record, options);
  if (!eligibility.eligible) {
    incrementExclusion(dataset, eligibility.reason!);
    return null;
  }

  leakageAudit.checked += 1;

  let legacyRecommendation = null;
  try {
    legacyRecommendation = rebuildLegacyRecommendation(record);
  } catch {
    incrementExclusion(dataset, "LEGACY_UNAVAILABLE");
    return null;
  }

  if (!legacyRecommendation) {
    incrementExclusion(dataset, "LEGACY_UNAVAILABLE");
    return null;
  }

  let rebuilt;
  try {
    rebuilt = rebuildDecisionV3({
      record,
      collectorContext: buildEvidenceCollectorContext(record),
    });
  } catch {
    incrementExclusion(dataset, "DECISION_COMPUTE_FAILED");
    return null;
  }

  const leakage = auditEvidenceLeakage({
    record,
    evidence: rebuilt.evidence,
    assumedKickoffHourUtc: options.assumedKickoffHourUtc,
  });

  if (!leakage.passed) {
    incrementExclusion(dataset, leakage.reason ?? "LEAKAGE_VIOLATION");
    incrementLeakageViolation(leakageAudit, leakage.reason ?? "LEAKAGE_VIOLATION");
    return null;
  }

  leakageAudit.passed += 1;

  if (!record.result) {
    incrementExclusion(dataset, "NO_RESULT");
    return null;
  }

  const comparison = buildRecommendationComparison({
    legacyRecommendation,
    decisionOutcome: rebuilt.outcome,
  });

  const legacySettlement = settleLegacyRecommendation(
    legacyRecommendation,
    record.result,
    options.flatStake
  );
  const decisionSettlement = settleDecisionOutcome(
    rebuilt.outcome,
    record.marketSelections,
    record.result,
    options.flatStake
  );

  return {
    matchId: record.id,
    fixtureKey: resolveFixtureKey(record),
    league: record.league,
    matchDate: record.matchDate,
    legacyRecommendation,
    decisionOutcome: rebuilt.outcome,
    comparison,
    legacySettlement,
    decisionSettlement,
    evidenceCollectedCount: rebuilt.evidence.evidence.length,
    evidenceMissingCount: rebuilt.evidence.missing.length,
    providerConfidence: resolveProviderConfidence(rebuilt.evidence),
    runtimeWeightSource: rebuilt.outcome.decisionWeightSource,
    dataSource: resolveValidationDataSource(record),
  };
}

export function runDecisionV3ReplayValidation(input: {
  records: HistoricalMatchRecord[];
  options?: DecisionV3ReplayValidationOptions;
}): DecisionV3ReplayValidationRunResult {
  const options = normalizeOptions(input.options);
  const dataset: DecisionV3ReplayDatasetSummary = {
    totalRecords: input.records.length,
    eligibleRecords: 0,
    excludedRecords: 0,
    exclusionReasons: {},
  };
  const leakageAudit = createEmptyLeakageAudit();
  const matchResults: DecisionV3ReplayMatchResult[] = [];

  for (const record of input.records) {
    const result = processRecord(record, options, dataset, leakageAudit);
    if (result) {
      matchResults.push(result);
    }
  }

  dataset.eligibleRecords = matchResults.length;

  const performance = buildPerformanceMetrics(matchResults);
  const grouped = buildGroupedReport(matchResults);
  const verdict = resolveValidationVerdict({
    eligibleRecords: dataset.eligibleRecords,
    legacy: performance.legacy,
    decisionV3: performance.decisionV3,
    grouped,
    leakageExcluded: leakageAudit.excluded,
  });

  const report: DecisionV3ReplayValidationReport = {
    schemaVersion: DECISION_V3_REPLAY_VALIDATION_SCHEMA,
    generatedAt: new Date(0).toISOString(),
    dataset,
    legacy: performance.legacy,
    decisionV3: performance.decisionV3,
    agreement: buildAgreementMetrics(matchResults),
    headToHead: buildHeadToHeadMetrics(matchResults),
    grouped,
    leakageAudit,
    verdict: verdict.verdict,
    verdictNotes: verdict.notes,
    options,
  };

  return { report, matchResults };
}

export function stampDecisionV3ReplayValidationReport(
  report: DecisionV3ReplayValidationReport,
  generatedAt = new Date().toISOString()
): DecisionV3ReplayValidationReport {
  return {
    ...report,
    generatedAt,
  };
}
