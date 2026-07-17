import { createEmptyRecommendationResult } from "@/lib/recommendation/recommendationTypes";
import type { RecommendationLearningRecord } from "@/lib/recommendation/recommendationLearningTypes";
import { DEFAULT_PROVIDER_WEIGHTS } from "@/lib/recommendation/providerWeights";
import {
  buildWeightOptimizerReport,
  getMaxWeightAdjustment,
  getWeightOptimizerStatus,
} from "@/lib/recommendation/weightOptimizer";
import {
  DEFAULT_MARKET_GROUP_WEIGHT,
  DEFAULT_TEAM_GROUP_WEIGHT,
  MAX_MARKET_GROUP_WEIGHT,
  MIN_MARKET_GROUP_WEIGHT,
} from "@/lib/recommendation/weightOptimizerTypes";
import type { ReplayProviderRecommendationDiagnostic } from "@/lib/replay/replayTypes";
import type { MatchResult } from "@/lib/database/matchSchema";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNear(actual: number, expected: number, message: string, tolerance = 1e-4): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ~${expected}, got ${actual}`);
  }
}

const BASE_RESULT: MatchResult = {
  fullTimeHomeGoals: 2,
  fullTimeAwayGoals: 1,
  halfTimeHomeGoals: 1,
  halfTimeAwayGoals: 0,
  winner: "home",
  totalGoals: 3,
  bothTeamsScored: true,
};

function buildDiagnostics(): ReplayProviderRecommendationDiagnostic[] {
  return [
    {
      providerKey: "recentForm",
      providerWeight: 0.24,
      providerContribution: 12,
      providerSource: "match-records",
      providerConfidence: 0.8,
    },
    {
      providerKey: "homeAway",
      providerWeight: 0.18,
      providerContribution: 8,
      providerSource: "match-records",
      providerConfidence: 0.75,
    },
    {
      providerKey: "goalsXg",
      providerWeight: 0.18,
      providerContribution: 7,
      providerSource: "google",
      providerConfidence: 0.7,
    },
  ];
}

function buildLearningRecord(input: {
  id: string;
  hit: boolean;
  profit: number;
  stake?: number;
  marketHit?: boolean;
  marketProfit?: number;
  createdAt?: string;
}): RecommendationLearningRecord {
  const stake = input.stake ?? 1;
  const marketHit = input.marketHit ?? input.hit;
  const marketProfit = input.marketProfit ?? input.profit;

  return {
    id: input.id,
    matchRecordId: input.id,
    fixtureId: 100,
    recommendation: createEmptyRecommendationResult({ globalPass: false }),
    actualResult: BASE_RESULT,
    hit: input.hit,
    providerDiagnostics: buildDiagnostics(),
    providerOverallConfidence: 0.75,
    marketOutcomes: [
      {
        marketKey: "1X2",
        hit: marketHit,
        profit: marketProfit,
        stake,
        confidence: "high",
        result: marketHit ? "WIN" : "LOSE",
      },
    ],
    totalProfit: input.profit,
    totalStake: stake,
    verifiedAt: input.createdAt ?? "2026-07-01T00:00:00.000Z",
    matchDate: "2026-07-01",
    league: "Premier League",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    createdAt: input.createdAt ?? "2026-07-01T00:00:00.000Z",
    updatedAt: input.createdAt ?? "2026-07-01T00:00:00.000Z",
  };
}

function buildRecordBatch(
  count: number,
  profile: {
    hitRate: number;
    marketRoi: number;
    teamRoi: number;
  }
): RecommendationLearningRecord[] {
  const records: RecommendationLearningRecord[] = [];

  for (let index = 0; index < count; index += 1) {
    const hit = index / count < profile.hitRate;
    const marketProfit = hit ? profile.marketRoi : -1;
    const teamProfit = hit ? profile.teamRoi : -1;

    records.push(
      buildLearningRecord({
        id: `record-${index}`,
        hit,
        profit: teamProfit,
        marketHit: hit,
        marketProfit,
        createdAt: `2026-07-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
      })
    );
  }

  return records;
}

function testInsufficientSampleDoesNotAdjust(): void {
  const report = buildWeightOptimizerReport(buildRecordBatch(80, { hitRate: 0.7, marketRoi: 0.2, teamRoi: 0.05 }));

  assert(report.overall.market.status === "insufficient_sample", "status should be insufficient_sample");
  assertNear(report.overall.market.suggestedWeight, DEFAULT_MARKET_GROUP_WEIGHT, "market weight should stay at 0.60");
  assertNear(report.overall.team.suggestedWeight, DEFAULT_TEAM_GROUP_WEIGHT, "team weight should stay at 0.40");
  assert(getMaxWeightAdjustment(80) === 0, "max adjustment should be 0 below 100");
}

function testMediumSampleCapsAtTwoPercent(): void {
  const records = buildRecordBatch(200, { hitRate: 0.2, marketRoi: -0.5, teamRoi: 0.3 });
  const report = buildWeightOptimizerReport(records);
  const delta = report.overall.market.suggestedWeight - report.overall.market.currentWeight;

  assert(report.overall.market.status === "analysis", "status should be analysis");
  assert(delta >= -0.02 - 1e-6, "market decrease should not exceed -2%");
  assert(delta <= 0.02 + 1e-6, "market increase should not exceed +2%");
  assert(getMaxWeightAdjustment(200) === 0.02, "max adjustment should be 0.02 for 100-299");
}

function testLargeSampleCapsAtFivePercent(): void {
  const records = buildRecordBatch(350, { hitRate: 0.2, marketRoi: -0.8, teamRoi: 0.4 });
  const report = buildWeightOptimizerReport(records);
  const delta = report.overall.market.suggestedWeight - report.overall.market.currentWeight;

  assert(Math.abs(delta) <= 0.05 + 1e-6, "adjustment should not exceed ±5% for 300+ samples");
  assert(getMaxWeightAdjustment(350) === 0.05, "max adjustment should be 0.05 for 300+");
}

function testMarketWeightBoundsAndSum(): void {
  const scenarios = [
    buildRecordBatch(350, { hitRate: 0.9, marketRoi: 2, teamRoi: -1 }),
    buildRecordBatch(350, { hitRate: 0.1, marketRoi: -2, teamRoi: 1 }),
  ];

  for (const records of scenarios) {
    const report = buildWeightOptimizerReport(records);
    assert(report.overall.market.suggestedWeight >= MIN_MARKET_GROUP_WEIGHT - 1e-6, "market min bound");
    assert(report.overall.market.suggestedWeight <= MAX_MARKET_GROUP_WEIGHT + 1e-6, "market max bound");
    assertNear(
      report.overall.market.suggestedWeight + report.overall.team.suggestedWeight,
      1,
      "market + team should equal 1"
    );
  }
}

function testPoorRoiSuggestsDecrease(): void {
  const report = buildWeightOptimizerReport(
    buildRecordBatch(320, { hitRate: 0.15, marketRoi: -0.6, teamRoi: 0.25 })
  );

  assert(
    report.overall.market.suggestedWeight < report.overall.market.currentWeight,
    "poor market ROI should suggest lower market weight"
  );
  assert(
    report.overall.market.adjustmentReason.includes("降低 Market"),
    "adjustment reason should mention decreasing market weight"
  );
}

function testHighHitRateSmallSampleDoesNotIncrease(): void {
  const report = buildWeightOptimizerReport(
    buildRecordBatch(150, { hitRate: 0.85, marketRoi: 0.4, teamRoi: 0.05 })
  );

  const delta = report.overall.market.suggestedWeight - report.overall.market.currentWeight;
  assert(delta <= 0.02 + 1e-6, "small sample should cap market increase");
  assert(
    report.overall.market.adjustmentReason.includes("不足 300") ||
      delta <= 0.02 + 1e-6,
    "high hit rate with <300 sample should not allow large increase"
  );
}

function testDoesNotModifyProductionWeights(): void {
  const before = structuredClone(DEFAULT_PROVIDER_WEIGHTS);
  buildWeightOptimizerReport(buildRecordBatch(120, { hitRate: 0.5, marketRoi: 0.1, teamRoi: 0.1 }));

  for (const key of Object.keys(before) as Array<keyof typeof DEFAULT_PROVIDER_WEIGHTS>) {
    assertNear(DEFAULT_PROVIDER_WEIGHTS[key], before[key], `${key} production weight unchanged`);
  }
}

function testDoesNotPolluteInputRecords(): void {
  const records = buildRecordBatch(50, { hitRate: 0.5, marketRoi: 0.1, teamRoi: 0.1 });
  const snapshot = structuredClone(records);
  buildWeightOptimizerReport(records);

  assert(JSON.stringify(records) === JSON.stringify(snapshot), "input records should remain unchanged");
}

function testDiagnosticsMetadata(): void {
  const report = buildWeightOptimizerReport(buildRecordBatch(120, { hitRate: 0.5, marketRoi: 0.1, teamRoi: 0.1 }));

  assert(report.diagnostics.optimizerMode === "analysis", "optimizer mode should be analysis");
  assert(report.diagnostics.weightsApplied === false, "weightsApplied should be false");
  assert(report.diagnostics.recordsRead === 120, "recordsRead should match input");
  assert(report.diagnostics.recordsUsed === 120, "complete records should be used");
  assert(getWeightOptimizerStatus(80) === "insufficient_sample", "status helper for small sample");
  assert(getWeightOptimizerStatus(120) === "analysis", "status helper for sufficient sample");
}

function testByMarketTypeOutput(): void {
  const report = buildWeightOptimizerReport(
    buildRecordBatch(220, { hitRate: 0.45, marketRoi: -0.1, teamRoi: 0.12 })
  );

  assert(report.byMarketType.length === 4, "should include 4 market types");
  assert(
    report.byMarketType.every(
      (entry) =>
        entry.market.sampleSize >= 0 &&
        entry.team.sampleSize >= 0 &&
        entry.market.suggestedWeight + entry.team.suggestedWeight >= 0.999
    ),
    "each market type should expose market/team suggested weights"
  );
}

export function runWeightOptimizerTests(): void {
  testInsufficientSampleDoesNotAdjust();
  testMediumSampleCapsAtTwoPercent();
  testLargeSampleCapsAtFivePercent();
  testMarketWeightBoundsAndSum();
  testPoorRoiSuggestsDecrease();
  testHighHitRateSmallSampleDoesNotIncrease();
  testDoesNotModifyProductionWeights();
  testDoesNotPolluteInputRecords();
  testDiagnosticsMetadata();
  testByMarketTypeOutput();
  console.log("Weight optimizer tests passed.");
}

export {};
