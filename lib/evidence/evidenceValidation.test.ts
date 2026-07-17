import { createEmptyRecommendationResult } from "@/lib/recommendation/recommendationTypes";
import type { RecommendationLearningRecord } from "@/lib/recommendation/recommendationLearningTypes";
import type { EvidenceBreakdownItem } from "@/lib/evidence/evidenceTypes";
import {
  attachEvidenceValidationToRecommendation,
  buildEvidencePerformanceReport,
  buildEvidenceValidationRecord,
  extractEvidenceValidationFromRecommendation,
} from "@/lib/evidence/evidenceValidation";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const BASE_RESULT = {
  fullTimeHomeGoals: 2,
  fullTimeAwayGoals: 1,
  halfTimeHomeGoals: 1,
  halfTimeAwayGoals: 0,
  winner: "home" as const,
  totalGoals: 3,
  bothTeamsScored: true,
};

function breakdownItem(
  overrides: Partial<EvidenceBreakdownItem> & Pick<EvidenceBreakdownItem, "category" | "impact">
): EvidenceBreakdownItem {
  return {
    evidenceId: `${overrides.category}-${overrides.impact}`,
    rawScore: 10,
    adjustedScore: 8,
    confidence: 0.7,
    source: "test",
    summary: "test evidence",
    ...overrides,
  };
}

function testValidationAccuracy(): void {
  const recommendation = {
    ...createEmptyRecommendationResult({ globalPass: true }),
    evidenceScore: 72,
    evidenceConfidence: 0.68,
    evidenceBreakdown: [
      breakdownItem({ category: "h2h", impact: "support" }),
      breakdownItem({ category: "xg", impact: "oppose", adjustedScore: -5, confidence: 0.6 }),
      breakdownItem({ category: "xga", impact: "neutral" }),
    ],
  };

  const hitRecord = buildEvidenceValidationRecord({
    matchRecordId: "match-hit",
    recommendation,
    actualResult: BASE_RESULT,
    matchHit: true,
  });

  assert(hitRecord !== null, "validation record should be created");
  assert(hitRecord!.entries.length === 2, "neutral evidence should be excluded");
  assert(
    hitRecord!.entries.find((entry) => entry.category === "h2h")?.accurate === true,
    "support + hit should be accurate"
  );
  assert(
    hitRecord!.entries.find((entry) => entry.category === "xg")?.accurate === false,
    "oppose + hit should be inaccurate"
  );

  const missRecord = buildEvidenceValidationRecord({
    matchRecordId: "match-miss",
    recommendation,
    actualResult: BASE_RESULT,
    matchHit: false,
  });

  assert(
    missRecord!.entries.find((entry) => entry.category === "xg")?.accurate === true,
    "oppose + miss should be accurate"
  );
}

function testPerformanceAggregation(): void {
  const recommendation = {
    ...createEmptyRecommendationResult({ globalPass: true }),
    evidenceScore: 70,
    evidenceConfidence: 0.65,
    evidenceBreakdown: [
      breakdownItem({ category: "h2h", impact: "support", adjustedScore: 10, confidence: 0.8 }),
      breakdownItem({ category: "recent10Matches", impact: "support", adjustedScore: 6, confidence: 0.7 }),
    ],
  };

  const baseRecord: Omit<RecommendationLearningRecord, "id" | "matchRecordId" | "hit" | "totalProfit"> = {
    fixtureId: 1,
    recommendation,
    actualResult: BASE_RESULT,
    providerDiagnostics: [],
    providerOverallConfidence: 0.7,
    marketOutcomes: [],
    totalStake: 1,
    verifiedAt: "2026-07-01T00:00:00.000Z",
    matchDate: "2026-07-01",
    league: "Premier League",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    evidenceValidation: null,
  };

  const records: RecommendationLearningRecord[] = [
    { ...baseRecord, id: "1", matchRecordId: "1", hit: true, totalProfit: 0.5 },
    { ...baseRecord, id: "2", matchRecordId: "2", hit: false, totalProfit: -1 },
  ];

  const report = buildEvidencePerformanceReport(records);

  assert(report.sampleSize === 2, "sample size should match verified records");
  assert(report.providers.length === 2, "should aggregate distinct providers");

  const h2h = report.providers.find((provider) => provider.category === "h2h");
  assert(h2h !== undefined, "h2h provider should exist");
  assert(h2h!.usageCount === 2, "h2h usage should be 2");
  assert(h2h!.hitRate === 0.5, "h2h hit rate should be 50%");
  assert(h2h!.averageImpactScore === 10, "h2h average impact should be 10");

  assert(
    report.byAccuracy[0]!.hitRate >= report.byAccuracy[report.byAccuracy.length - 1]!.hitRate,
    "byAccuracy should be sorted descending"
  );
  assert(
    report.byUsage[0]!.usageCount >= report.byUsage[report.byUsage.length - 1]!.usageCount,
    "byUsage should be sorted descending"
  );
}

function testRecommendationStorageRoundTrip(): void {
  const recommendation = {
    ...createEmptyRecommendationResult({ globalPass: true }),
    evidenceScore: 55,
    evidenceConfidence: 0.5,
    evidenceBreakdown: [breakdownItem({ category: "matchContext", impact: "support" })],
  };

  const validation = buildEvidenceValidationRecord({
    matchRecordId: "round-trip",
    recommendation,
    actualResult: BASE_RESULT,
    matchHit: true,
  });

  const stored = attachEvidenceValidationToRecommendation(recommendation, validation);
  const extracted = extractEvidenceValidationFromRecommendation(stored);

  assert(extracted?.matchRecordId === "round-trip", "stored validation should round-trip");
  assert(extracted?.evidenceScore === 55, "evidence score should round-trip");
}

export function runEvidenceValidationTests(): void {
  testValidationAccuracy();
  testPerformanceAggregation();
  testRecommendationStorageRoundTrip();
  console.log("Evidence validation tests passed.");
}

runEvidenceValidationTests();
