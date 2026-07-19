import {
  assessRecommendationDataCompleteness,
  assessSnapshotRecommendationEligibility,
  buildAnalysisDataCompletenessMetadata,
  isEligibleForDailyRecommendation,
  mapCompletenessToIncompleteReason,
  type RecommendationDataCompletenessAssessment,
} from "@/lib/analysis/analysisDataCompleteness";
import type {
  AnalysisSnapshot,
  HistoricalMatchRecord,
  SaveMatchInput,
} from "@/lib/database/matchSchema";
import { hasSettleableMarket } from "@/lib/replay/v3/decisionV3ReplayValidationEligibility";
import type { MarketSelection } from "@/types/match";

export const HISTORICAL_BACKFILL_SOURCE = "historical_backfill";

export interface AnalysisCompletenessInput {
  rawOdds: string;
  marketSelections: MarketSelection[];
  analysisSnapshot: AnalysisSnapshot | null;
}

export type IncompleteAnalysisReason =
  | "oddsMissing"
  | "settleableMarketMissing"
  | "analysisSnapshotMissing"
  | "dataCompletenessInsufficient"
  | "profileDeferred"
  | "profileUnavailable"
  | "groundingUnavailable";

export interface DataCompletenessRejectReason {
  kind: "incomplete_analysis_rejected";
  reason: IncompleteAnalysisReason;
}

export interface DataCompletenessConflictReason {
  kind: "conflicting_record";
  reason: string;
}

export function isRawOddsPresent(rawOdds: string | null | undefined): boolean {
  return Boolean(rawOdds?.trim());
}

export function isMarketSelectionsEmpty(
  marketSelections: MarketSelection[] | null | undefined
): boolean {
  return !marketSelections || marketSelections.length === 0;
}

export function isAnalysisSnapshotPresent(
  analysisSnapshot: AnalysisSnapshot | null | undefined
): boolean {
  return analysisSnapshot !== null && analysisSnapshot !== undefined;
}

export function assessAnalysisCompleteness(
  input: AnalysisCompletenessInput
): IncompleteAnalysisReason | null {
  if (!isRawOddsPresent(input.rawOdds)) {
    return "oddsMissing";
  }
  if (!hasSettleableMarket(input.marketSelections)) {
    return "settleableMarketMissing";
  }
  if (!isAnalysisSnapshotPresent(input.analysisSnapshot)) {
    return "analysisSnapshotMissing";
  }
  return null;
}

export function assessProductionRecommendationCompleteness(
  snapshot: AnalysisSnapshot | null | undefined
): IncompleteAnalysisReason | null {
  const recommendationAssessment = assessSnapshotRecommendationEligibility(snapshot);
  if (!recommendationAssessment.eligibleForRecommendation) {
    return mapCompletenessToIncompleteReason(recommendationAssessment);
  }
  return null;
}

export function buildSnapshotDataCompleteness(
  assessment: RecommendationDataCompletenessAssessment,
  capturedAt: string
): AnalysisSnapshot["dataCompleteness"] {
  return buildAnalysisDataCompletenessMetadata(assessment, capturedAt);
}

export { isEligibleForDailyRecommendation };

export function hasCompleteAnalysisRecord(record: HistoricalMatchRecord): boolean {
  return (
    assessAnalysisCompleteness({
      rawOdds: record.rawOdds,
      marketSelections: record.marketSelections,
      analysisSnapshot: record.analysisSnapshot,
    }) === null
  );
}

export function isIncompleteHistoricalBackfillRecord(
  record: HistoricalMatchRecord,
  source = record.source
): boolean {
  if (source !== HISTORICAL_BACKFILL_SOURCE) {
    return false;
  }

  return (
    !isRawOddsPresent(record.rawOdds) &&
    isMarketSelectionsEmpty(record.marketSelections) &&
    !isAnalysisSnapshotPresent(record.analysisSnapshot)
  );
}

export function isConflictingEnrichmentTarget(
  record: HistoricalMatchRecord,
  source = record.source
): DataCompletenessConflictReason | null {
  if (hasCompleteAnalysisRecord(record)) {
    return null;
  }

  if (isIncompleteHistoricalBackfillRecord(record, source)) {
    return null;
  }

  if (source === HISTORICAL_BACKFILL_SOURCE) {
    const hasPartialAnalysis =
      isRawOddsPresent(record.rawOdds) ||
      !isMarketSelectionsEmpty(record.marketSelections) ||
      isAnalysisSnapshotPresent(record.analysisSnapshot);

    if (hasPartialAnalysis) {
      return {
        kind: "conflicting_record",
        reason:
          "Historical backfill record contains partial analysis data and cannot be enriched safely.",
      };
    }
  }

  if (
    isRawOddsPresent(record.rawOdds) ||
    !isMarketSelectionsEmpty(record.marketSelections) ||
    isAnalysisSnapshotPresent(record.analysisSnapshot)
  ) {
    return {
      kind: "conflicting_record",
      reason:
        "Existing record contains partial analysis data and cannot be enriched safely.",
    };
  }

  return null;
}

export function buildEnrichedHistoricalBackfillRecord(
  existing: HistoricalMatchRecord,
  input: SaveMatchInput,
  analysisSnapshot: AnalysisSnapshot,
  now = new Date().toISOString()
): HistoricalMatchRecord {
  const enrichedSnapshot: AnalysisSnapshot = {
    ...structuredClone(analysisSnapshot),
    dataCompleteness: {
      analysisEnriched: true,
      analysisEnrichedAt: now,
      enrichedFrom: existing.source ?? HISTORICAL_BACKFILL_SOURCE,
    },
  };

  return {
    ...existing,
    league: input.league,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    rawOdds: input.rawOdds,
    marketSelections: structuredClone(input.marketSelections),
    candidates: structuredClone(input.candidates ?? enrichedSnapshot.candidates ?? []),
    analysisSnapshot: enrichedSnapshot,
    fixtureId: input.fixtureId ?? existing.fixtureId ?? null,
    leagueId: input.leagueId ?? existing.leagueId ?? null,
    season: input.season ?? existing.season ?? null,
    homeTeamId: input.homeTeamId ?? existing.homeTeamId ?? null,
    awayTeamId: input.awayTeamId ?? existing.awayTeamId ?? null,
    source: existing.source ?? HISTORICAL_BACKFILL_SOURCE,
    createdAt: existing.createdAt,
    updatedAt: now,
    result: existing.result,
    status: existing.status,
    verificationResult: existing.verificationResult,
  };
}
