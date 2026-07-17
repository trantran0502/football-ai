import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { buildRecommendationLearningRecord } from "@/lib/recommendation/recommendationLearningBuilder";
import type { RecommendationLearningRecord } from "@/lib/recommendation/recommendationLearningTypes";

export type LearningPipelineStepId =
  | "recommendation_generated"
  | "validation_saved"
  | "learning_record_created"
  | "provider_diagnostics_saved"
  | "market_outcomes_saved"
  | "ready_for_weight_optimizer";

export type LearningPipelineStepStatus = "SUCCESS" | "FAILED";

export interface LearningPipelineStep {
  id: LearningPipelineStepId;
  label: string;
  status: LearningPipelineStepStatus;
  reason: string;
}

export interface LearningRecordCompleteness {
  complete: boolean;
  skipReasons: string[];
  missingFields: string[];
}

export interface LearningRecordDebugEntry {
  matchRecordId: string;
  fixtureId: number | null;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  matchStatus: string;
  learningRecordExists: boolean;
  completeness: LearningRecordCompleteness;
  pipeline: LearningPipelineStep[];
}

export interface RecommendationLearningDebugReport {
  generatedAt: string;
  recordsRead: number;
  recordsComplete: number;
  recordsSkipped: number;
  skipReasonCounts: Record<string, number>;
  entries: LearningRecordDebugEntry[];
}

const PIPELINE_LABELS: Record<LearningPipelineStepId, string> = {
  recommendation_generated: "Recommendation Generated",
  validation_saved: "Validation Saved",
  learning_record_created: "Learning Record Created",
  provider_diagnostics_saved: "Provider Diagnostics Saved",
  market_outcomes_saved: "Market Outcomes Saved",
  ready_for_weight_optimizer: "Ready For Weight Optimizer",
};

export function inspectLearningRecordCompleteness(
  record: RecommendationLearningRecord
): LearningRecordCompleteness {
  const skipReasons: string[] = [];
  const missingFields: string[] = [];

  if (!record.actualResult) {
    skipReasons.push("missing_actual_result");
    missingFields.push("actualResult");
  }
  if (record.recommendation === null) {
    skipReasons.push("missing_recommendation");
    missingFields.push("recommendation");
  }
  if (!record.providerDiagnostics || record.providerDiagnostics.length === 0) {
    skipReasons.push("missing_provider_diagnostics");
    missingFields.push("providerDiagnostics");
  } else {
    for (const diagnostic of record.providerDiagnostics) {
      if (diagnostic.providerWeight === undefined || diagnostic.providerWeight === null) {
        missingFields.push(`providerDiagnostics.${diagnostic.providerKey}.weight`);
      }
      if (diagnostic.providerContribution === undefined || diagnostic.providerContribution === null) {
        missingFields.push(`providerDiagnostics.${diagnostic.providerKey}.contribution`);
      }
      if (diagnostic.providerConfidence === undefined || diagnostic.providerConfidence === null) {
        missingFields.push(`providerDiagnostics.${diagnostic.providerKey}.confidence`);
      }
    }
  }
  const decisiveOutcomes = record.marketOutcomes.filter((outcome) => outcome.result !== "PUSH");
  if (decisiveOutcomes.length === 0 && record.totalStake <= 0) {
    skipReasons.push("missing_market_outcomes");
    missingFields.push("marketOutcomes");
  } else {
    for (const outcome of decisiveOutcomes) {
      if (!outcome.marketKey) {
        missingFields.push("marketOutcomes.marketKey");
      }
      if (!outcome.result) {
        missingFields.push(`marketOutcomes.${outcome.marketKey}.result`);
      }
    }
  }
  if (record.providerOverallConfidence === null) {
    skipReasons.push("missing_provider_overall_confidence");
    missingFields.push("providerOverallConfidence");
  }

  return {
    complete: skipReasons.length === 0,
    skipReasons,
    missingFields: [...new Set(missingFields)],
  };
}

export function filterCompleteLearningRecords(records: RecommendationLearningRecord[]): {
  used: RecommendationLearningRecord[];
  skipped: Array<{ record: RecommendationLearningRecord; reason: string; missingFields: string[] }>;
} {
  const used: RecommendationLearningRecord[] = [];
  const skipped: Array<{
    record: RecommendationLearningRecord;
    reason: string;
    missingFields: string[];
  }> = [];

  for (const record of records) {
    const completeness = inspectLearningRecordCompleteness(record);
    if (completeness.complete) {
      used.push(record);
      continue;
    }

    skipped.push({
      record,
      reason: completeness.skipReasons[0] ?? "incomplete_record",
      missingFields: completeness.missingFields,
    });
  }

  return { used, skipped };
}

function step(
  id: LearningPipelineStepId,
  status: LearningPipelineStepStatus,
  reason: string
): LearningPipelineStep {
  return {
    id,
    label: PIPELINE_LABELS[id],
    status,
    reason,
  };
}

export function buildMatchRecordLearningPipelineTrace(
  matchRecord: HistoricalMatchRecord,
  learningRecord: RecommendationLearningRecord | null
): LearningPipelineStep[] {
  const steps: LearningPipelineStep[] = [];

  const recommendation = matchRecord.analysisSnapshot?.recommendation?.result ?? null;
  if (recommendation) {
    steps.push(
      step(
        "recommendation_generated",
        "SUCCESS",
        `Recommendation exists with ${recommendation.candidates.length} candidate(s).`
      )
    );
  } else {
    steps.push(
      step(
        "recommendation_generated",
        "FAILED",
        "analysis_snapshot.recommendation.result is missing."
      )
    );
  }

  const validationEntries =
    matchRecord.verificationResult?.recommendationValidation?.entries ?? [];
  if (matchRecord.verificationResult && validationEntries.length > 0) {
    steps.push(
      step(
        "validation_saved",
        "SUCCESS",
        `Validation saved with ${validationEntries.length} market entr${validationEntries.length === 1 ? "y" : "ies"}.`
      )
    );
  } else if (matchRecord.status === "VERIFIED" && matchRecord.result) {
    steps.push(
      step(
        "validation_saved",
        "FAILED",
        "Match is VERIFIED but verificationResult.recommendationValidation.entries is empty."
      )
    );
  } else {
    steps.push(
      step(
        "validation_saved",
        "FAILED",
        `Match status is ${matchRecord.status}; validation runs after result update.`
      )
    );
  }

  if (learningRecord) {
    steps.push(
      step(
        "learning_record_created",
        "SUCCESS",
        `Learning record exists for match_record_id=${learningRecord.matchRecordId}.`
      )
    );
  } else if (matchRecord.status === "VERIFIED" && matchRecord.result) {
    steps.push(
      step(
        "learning_record_created",
        "FAILED",
        "VERIFIED match has no recommendation_learning row (persistRecommendationLearningForVerifiedMatch not run or failed)."
      )
    );
  } else {
    steps.push(
      step(
        "learning_record_created",
        "FAILED",
        "Learning record is only created after VERIFIED + actual_result."
      )
    );
  }

  const providerDiagnostics =
    learningRecord?.providerDiagnostics ??
    matchRecord.analysisSnapshot?.replay?.recommendation?.providerDiagnostics ??
    [];
  if (providerDiagnostics.length > 0) {
    steps.push(
      step(
        "provider_diagnostics_saved",
        "SUCCESS",
        `${providerDiagnostics.length} provider diagnostic(s) available.`
      )
    );
  } else {
    steps.push(
      step(
        "provider_diagnostics_saved",
        "FAILED",
        "provider_diagnostics is empty on learning record and replay snapshot."
      )
    );
  }

  const marketOutcomes =
    learningRecord?.marketOutcomes ??
    (matchRecord.verificationResult?.recommendationValidation?.entries ?? []).map((entry) => ({
      marketKey: entry.marketKey,
      result: entry.evaluation.result,
    }));
  const decisive = Array.isArray(marketOutcomes)
    ? marketOutcomes.filter(
        (outcome) =>
          typeof outcome === "object" &&
          outcome !== null &&
          "result" in outcome &&
          outcome.result !== "PUSH"
      )
    : [];

  if (decisive.length > 0) {
    steps.push(
      step(
        "market_outcomes_saved",
        "SUCCESS",
        `${decisive.length} decisive market outcome(s) available.`
      )
    );
  } else {
    steps.push(
      step(
        "market_outcomes_saved",
        "FAILED",
        "No decisive market_outcomes; recommendation validation may not have run."
      )
    );
  }

  const completeness = learningRecord
    ? inspectLearningRecordCompleteness(learningRecord)
    : {
        complete: false,
        skipReasons: ["missing_learning_record"],
        missingFields: ["recommendation_learning"],
      };

  if (completeness.complete) {
    steps.push(step("ready_for_weight_optimizer", "SUCCESS", "Record passes filterCompleteLearningRecords()."));
  } else {
    steps.push(
      step(
        "ready_for_weight_optimizer",
        "FAILED",
        completeness.skipReasons.join(", ") || "Incomplete learning record."
      )
    );
  }

  return steps;
}

export function buildRecommendationLearningDebugReport(input: {
  matchRecords: HistoricalMatchRecord[];
  learningRecords: RecommendationLearningRecord[];
}): RecommendationLearningDebugReport {
  const learningByMatchId = new Map(
    input.learningRecords.map((record) => [record.matchRecordId, record])
  );

  const entries: LearningRecordDebugEntry[] = input.matchRecords.map((matchRecord) => {
    const learningRecord = learningByMatchId.get(matchRecord.id) ?? null;
    const builtLearningRecord =
      learningRecord ?? buildRecommendationLearningRecord(matchRecord);
    const completeness = builtLearningRecord
      ? inspectLearningRecordCompleteness(builtLearningRecord)
      : {
          complete: false,
          skipReasons: ["learning_record_not_buildable"],
          missingFields: ["recommendation_learning"],
        };

    return {
      matchRecordId: matchRecord.id,
      fixtureId: matchRecord.fixtureId ?? null,
      matchDate: matchRecord.matchDate,
      homeTeam: matchRecord.homeTeam,
      awayTeam: matchRecord.awayTeam,
      matchStatus: matchRecord.status,
      learningRecordExists: learningRecord !== null,
      completeness,
      pipeline: buildMatchRecordLearningPipelineTrace(matchRecord, learningRecord),
    };
  });

  const skipReasonCounts: Record<string, number> = {};
  let recordsComplete = 0;
  let recordsSkipped = 0;

  for (const entry of entries) {
    if (entry.completeness.complete) {
      recordsComplete += 1;
      continue;
    }
    recordsSkipped += 1;
    for (const reason of entry.completeness.skipReasons) {
      skipReasonCounts[reason] = (skipReasonCounts[reason] ?? 0) + 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    recordsRead: entries.length,
    recordsComplete,
    recordsSkipped,
    skipReasonCounts,
    entries,
  };
}
