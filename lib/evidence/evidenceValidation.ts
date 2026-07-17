import type { MatchResult } from "@/lib/database/matchSchema";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type {
  EvidenceBreakdownItem,
  EvidenceCategory,
  EvidenceImpactDirection,
} from "@/lib/evidence/evidenceTypes";
import type { RecommendationEngineResult } from "@/lib/recommendation/recommendationTypes";
import type { RecommendationHistoryRecord } from "@/lib/learning/learningTypes";
import type { RecommendationLearningRecord } from "@/lib/recommendation/recommendationLearningTypes";

export interface EvidenceValidationEntry {
  evidenceId: string;
  category: EvidenceCategory;
  impact: EvidenceImpactDirection;
  adjustedScore: number;
  confidence: number;
  accurate: boolean;
}

export interface EvidenceValidationRecord {
  matchRecordId: string;
  evidenceScore: number | null;
  evidenceConfidence: number | null;
  evidenceBreakdown: EvidenceBreakdownItem[];
  recommendation: RecommendationEngineResult | null;
  actualResult: MatchResult;
  matchHit: boolean;
  entries: EvidenceValidationEntry[];
  validatedAt: string;
}

export interface EvidencePerformanceStats {
  category: EvidenceCategory;
  label: string;
  usageCount: number;
  hitCount: number;
  hitRate: number;
  averageImpactScore: number;
  averageConfidence: number;
  roi: number;
  totalProfit: number;
  totalStake: number;
}

export interface EvidencePerformanceReport {
  generatedAt: string;
  sampleSize: number;
  providers: EvidencePerformanceStats[];
  byAccuracy: EvidencePerformanceStats[];
  byConfidence: EvidencePerformanceStats[];
  byUsage: EvidencePerformanceStats[];
}

export const EVIDENCE_PROVIDER_LABELS: Record<EvidenceCategory, string> = {
  marketEngine: "Market Engine",
  h2h: "H2H",
  recent10Matches: "Recent Form",
  homeForm: "Home Form",
  awayForm: "Away Form",
  teamProfile: "Team Profile",
  teamEngine: "Team Engine",
  xg: "xG",
  xga: "xGA",
  leagueStrength: "League Strength",
  squadAvailability: "Squad Availability",
  matchContext: "Match Context",
};

export const TRACKED_EVIDENCE_CATEGORIES: EvidenceCategory[] = [
  "h2h",
  "recent10Matches",
  "xg",
  "xga",
  "leagueStrength",
  "squadAvailability",
  "matchContext",
];

function isEvidenceAccurate(
  impact: EvidenceImpactDirection,
  matchHit: boolean
): boolean {
  if (impact === "support") {
    return matchHit;
  }
  if (impact === "oppose") {
    return !matchHit;
  }
  return false;
}

function buildValidationEntries(
  breakdown: EvidenceBreakdownItem[],
  matchHit: boolean
): EvidenceValidationEntry[] {
  return breakdown
    .filter((item) => item.impact !== "neutral")
    .map((item) => ({
      evidenceId: item.evidenceId,
      category: item.category,
      impact: item.impact,
      adjustedScore: item.adjustedScore,
      confidence: item.confidence,
      accurate: isEvidenceAccurate(item.impact, matchHit),
    }));
}

export function buildEvidenceValidationRecord(input: {
  matchRecordId: string;
  recommendation: RecommendationEngineResult | null;
  actualResult: MatchResult;
  matchHit: boolean;
  validatedAt?: string;
}): EvidenceValidationRecord | null {
  if (!input.recommendation) {
    return null;
  }

  const evidenceBreakdown = input.recommendation.evidenceBreakdown ?? [];
  if (evidenceBreakdown.length === 0 && input.recommendation.evidenceScore === null) {
    return null;
  }

  return {
    matchRecordId: input.matchRecordId,
    evidenceScore: input.recommendation.evidenceScore,
    evidenceConfidence: input.recommendation.evidenceConfidence,
    evidenceBreakdown,
    recommendation: input.recommendation,
    actualResult: input.actualResult,
    matchHit: input.matchHit,
    entries: buildValidationEntries(evidenceBreakdown, input.matchHit),
    validatedAt: input.validatedAt ?? new Date().toISOString(),
  };
}

export function buildEvidenceValidationFromMatchRecord(
  record: HistoricalMatchRecord,
  matchHit: boolean
): EvidenceValidationRecord | null {
  if (record.status !== "VERIFIED" || !record.result) {
    return null;
  }

  const recommendation = record.analysisSnapshot?.recommendation?.result ?? null;
  return buildEvidenceValidationRecord({
    matchRecordId: record.id,
    recommendation,
    actualResult: record.result,
    matchHit,
    validatedAt: record.verificationResult?.verifiedAt ?? record.updatedAt,
  });
}

export function buildEvidenceValidationFromLearningRecord(
  record: RecommendationLearningRecord
): EvidenceValidationRecord | null {
  if (record.evidenceValidation) {
    return record.evidenceValidation;
  }

  return buildEvidenceValidationRecord({
    matchRecordId: record.matchRecordId,
    recommendation: record.recommendation,
    actualResult: record.actualResult,
    matchHit: record.hit,
    validatedAt: record.verifiedAt,
  });
}

interface ProviderAccumulator {
  usageCount: number;
  hitCount: number;
  impactSum: number;
  confidenceSum: number;
  totalProfit: number;
  totalStake: number;
}

function createProviderAccumulator(): ProviderAccumulator {
  return {
    usageCount: 0,
    hitCount: 0,
    impactSum: 0,
    confidenceSum: 0,
    totalProfit: 0,
    totalStake: 0,
  };
}

function finalizeProviderStats(
  category: EvidenceCategory,
  accumulator: ProviderAccumulator
): EvidencePerformanceStats {
  const usageCount = accumulator.usageCount;
  return {
    category,
    label: EVIDENCE_PROVIDER_LABELS[category],
    usageCount,
    hitCount: accumulator.hitCount,
    hitRate: usageCount > 0 ? accumulator.hitCount / usageCount : 0,
    averageImpactScore:
      usageCount > 0 ? accumulator.impactSum / usageCount : 0,
    averageConfidence:
      usageCount > 0 ? accumulator.confidenceSum / usageCount : 0,
    roi:
      accumulator.totalStake > 0
        ? accumulator.totalProfit / accumulator.totalStake
        : 0,
    totalProfit: accumulator.totalProfit,
    totalStake: accumulator.totalStake,
  };
}

export function buildEvidencePerformanceReport(
  records: RecommendationLearningRecord[]
): EvidencePerformanceReport {
  const items = records
    .map((record) => {
      const validation = buildEvidenceValidationFromLearningRecord(record);
      if (!validation) {
        return null;
      }
      return {
        validation,
        totalProfit: record.totalProfit,
        totalStake: record.totalStake,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return aggregateEvidencePerformance(items);
}

export function buildEvidencePerformanceFromHistory(
  history: RecommendationHistoryRecord[]
): EvidencePerformanceReport {
  const items = history
    .map((entry) => {
      const validation = buildEvidenceValidationRecord({
        matchRecordId: entry.matchId,
        recommendation: entry.recommendation,
        actualResult: {
          fullTimeHomeGoals: 0,
          fullTimeAwayGoals: 0,
          halfTimeHomeGoals: 0,
          halfTimeAwayGoals: 0,
          winner: "draw",
          totalGoals: 0,
          bothTeamsScored: false,
        },
        matchHit: resolveHistoryMatchHit(entry),
        validatedAt: entry.matchDate,
      });
      if (!validation) {
        return null;
      }

      const totals = entry.validationEntries.reduce(
        (sum, validationEntry) => ({
          totalProfit: sum.totalProfit + validationEntry.evaluation.profit,
          totalStake: sum.totalStake + validationEntry.evaluation.stake,
        }),
        { totalProfit: 0, totalStake: 0 }
      );

      return {
        validation,
        totalProfit: totals.totalProfit,
        totalStake: totals.totalStake,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return aggregateEvidencePerformance(items);
}

function resolveHistoryMatchHit(entry: RecommendationHistoryRecord): boolean {
  const decisive = entry.validationEntries.filter(
    (validationEntry) => validationEntry.evaluation.result !== "PUSH"
  );
  if (decisive.length === 0) {
    return false;
  }
  return decisive.some((validationEntry) => validationEntry.evaluation.hit);
}

function aggregateEvidencePerformance(
  items: Array<{
    validation: EvidenceValidationRecord;
    totalProfit: number;
    totalStake: number;
  }>
): EvidencePerformanceReport {
  const accumulators = new Map<EvidenceCategory, ProviderAccumulator>();

  for (const item of items) {
    for (const entry of item.validation.entries) {
      const accumulator =
        accumulators.get(entry.category) ?? createProviderAccumulator();
      accumulator.usageCount += 1;
      if (entry.accurate) {
        accumulator.hitCount += 1;
      }
      accumulator.impactSum += entry.adjustedScore;
      accumulator.confidenceSum += entry.confidence;
      accumulator.totalProfit += item.totalProfit;
      accumulator.totalStake += item.totalStake;
      accumulators.set(entry.category, accumulator);
    }
  }

  const providers = [...accumulators.entries()]
    .map(([category, accumulator]) =>
      finalizeProviderStats(category, accumulator)
    )
    .sort((left, right) => right.usageCount - left.usageCount);

  return {
    generatedAt: new Date().toISOString(),
    sampleSize: items.length,
    providers,
    byAccuracy: [...providers].sort((left, right) => right.hitRate - left.hitRate),
    byConfidence: [...providers].sort(
      (left, right) => right.averageConfidence - left.averageConfidence
    ),
    byUsage: [...providers].sort((left, right) => right.usageCount - left.usageCount),
  };
}

export const EVIDENCE_VALIDATION_STORAGE_KEY = "__evidenceValidation";

export function attachEvidenceValidationToRecommendation(
  recommendation: RecommendationEngineResult | null,
  evidenceValidation: EvidenceValidationRecord | null
): RecommendationEngineResult | null {
  if (!recommendation) {
    return null;
  }

  return {
    ...recommendation,
    [EVIDENCE_VALIDATION_STORAGE_KEY]: evidenceValidation,
  } as RecommendationEngineResult;
}

export function extractEvidenceValidationFromRecommendation(
  recommendation: RecommendationEngineResult | null
): EvidenceValidationRecord | null {
  if (!recommendation) {
    return null;
  }

  const stored = (
    recommendation as RecommendationEngineResult & {
      __evidenceValidation?: EvidenceValidationRecord | null;
    }
  ).__evidenceValidation;

  return stored ?? null;
}
