import { buildRoiPerformanceResponse } from "@/lib/admin/roiPerformanceService";
import type { AnalysisSnapshot, HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { RecommendationCandidate } from "@/lib/recommendation/recommendationTypes";
import type { MarketSelection } from "@/types/match";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function almostEqual(left: number, right: number, epsilon = 1e-9): boolean {
  return Math.abs(left - right) < epsilon;
}

function buildSelection(overrides: Partial<MarketSelection> = {}): MarketSelection {
  return {
    marketType: "moneyline",
    marketFamily: "moneyline",
    title: "Home",
    period: "full",
    side: "home",
    rawLine: null,
    line: null,
    modifier: null,
    odds: 2.0,
    ...overrides,
  };
}

function buildCandidate(
  overrides: Partial<RecommendationCandidate> & { odds?: number } = {}
): RecommendationCandidate {
  const { odds, selection, ...rest } = overrides;
  return {
    marketType: selection?.marketType ?? rest.marketType ?? "moneyline",
    selection: selection ?? buildSelection({ odds: odds ?? 2.0 }),
    confidence: "high",
    expectedValue: 0.1,
    score: 72,
    marketScore: 70,
    evidenceScore: 65,
    reasons: ["test"],
    warnings: [],
    supportingFeatures: [],
    ...rest,
  };
}

function buildSnapshot(input: {
  candidates: RecommendationCandidate[];
  weightVersion: string;
  globalPass?: boolean;
}): AnalysisSnapshot {
  return {
    features: [],
    interpretations: [],
    marketAnalysis: {
      status: "notImplemented",
      reason: "test",
    },
    combinedAnalysis: {
      status: "notImplemented",
      reason: "test",
    },
    candidates: [],
    recommendation: {
      enabled: true,
      fusion: null,
      result: {
        candidates: input.candidates,
        globalPass: input.globalPass ?? false,
        passReason: input.globalPass ? "no edge" : null,
        usableProviderCount: 1,
        unavailableProviderCount: 0,
        providerDiagnostics: [],
        providerOverallConfidence: 0.8,
        evidenceReport: null,
        evidenceScore: null,
        evidenceConfidence: null,
        evidenceSummary: [],
        evidenceBreakdown: [],
        weightConfig: {
          versionId: input.weightVersion,
          version: 1,
          versionLabel: input.weightVersion,
          source: "production_baseline",
          loadedAt: "2026-07-20T00:00:00.000Z",
        },
      },
      message: "",
    },
    replay: null,
    bettingIntelligence: null,
    decision: null,
    weightConfig: {
      versionId: input.weightVersion,
      version: 1,
      versionLabel: input.weightVersion,
      source: "production_baseline",
      loadedAt: "2026-07-20T00:00:00.000Z",
    },
    dataCompleteness: {
      eligibleForRecommendation: true,
    },
    capturedAt: "2026-07-20T00:00:00.000Z",
  };
}

function buildRecord(input: {
  id: string;
  matchDate?: string;
  league?: string;
  status?: HistoricalMatchRecord["status"];
  candidates?: RecommendationCandidate[];
  fullTimeHomeGoals?: number;
  fullTimeAwayGoals?: number;
  weightVersion?: string;
  fixtureId?: number;
  result?: HistoricalMatchRecord["result"];
  analysisSnapshot?: AnalysisSnapshot | null;
}): HistoricalMatchRecord {
  const candidates = input.candidates ?? [buildCandidate()];
  const homeGoals = input.fullTimeHomeGoals ?? 2;
  const awayGoals = input.fullTimeAwayGoals ?? 1;
  const weightVersion = input.weightVersion ?? "v-test";
  const matchDate = input.matchDate ?? "2026-07-20";

  return {
    id: input.id,
    date: matchDate,
    matchDate,
    league: input.league ?? "Premier League",
    homeTeam: "Arsenal",
    awayTeam: "Liverpool",
    rawOdds: "home 2.0",
    marketSelections: candidates.map((candidate) => candidate.selection),
    result:
      input.result === null
        ? null
        : (input.result ?? {
            fullTimeHomeGoals: homeGoals,
            fullTimeAwayGoals: awayGoals,
            halfTimeHomeGoals: 1,
            halfTimeAwayGoals: 0,
            winner: homeGoals === awayGoals ? "draw" : homeGoals > awayGoals ? "home" : "away",
            totalGoals: homeGoals + awayGoals,
            bothTeamsScored: homeGoals > 0 && awayGoals > 0,
          }),
    analysisSnapshot:
      input.analysisSnapshot === null
        ? null
        : (input.analysisSnapshot ??
          buildSnapshot({
            candidates,
            weightVersion,
            globalPass: candidates.length === 0,
          })),
    candidates: [],
    status: input.status ?? "VERIFIED",
    verificationResult: null,
    fixtureId: input.fixtureId ?? 101,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
  };
}

function testVerifiedCountNotEqualRoiEligible(): void {
  const records = [
    buildRecord({
      id: "m1",
      matchDate: "2026-07-20",
      candidates: [buildCandidate({ odds: 2.0 })],
      fullTimeHomeGoals: 2,
      fullTimeAwayGoals: 1,
    }),
    buildRecord({
      id: "m2",
      matchDate: "2026-07-19",
      candidates: [],
    }),
    buildRecord({
      id: "m3",
      matchDate: "2026-07-18",
      candidates: [buildCandidate({ odds: 0.9 })],
    }),
  ];

  const response = buildRoiPerformanceResponse(records, {
    fromDate: "2026-07-01",
    toDate: "2026-07-31",
  });

  assert(response.summary.verifiedCount === 3, "verifiedCount should be 3");
  assert(
    response.summary.roiEligibleCount === 1,
    `only one ROI eligible bet, got ${response.summary.roiEligibleCount}`
  );
  assert(
    response.summary.verifiedCount !== response.summary.roiEligibleCount,
    "verifiedCount must not equal roiEligibleCount"
  );
  assert(response.excludedReasonCounts.no_recommendation === 1, "no_recommendation counted");
  assert(response.excludedReasonCounts.invalid_odds === 1, "invalid_odds counted");
}

function testWinLossPushVoidAndDenominator(): void {
  const records = [
    buildRecord({
      id: "win",
      matchDate: "2026-07-20",
      candidates: [buildCandidate({ odds: 2.5 })],
      fullTimeHomeGoals: 2,
      fullTimeAwayGoals: 0,
    }),
    buildRecord({
      id: "loss",
      matchDate: "2026-07-20",
      candidates: [
        buildCandidate({
          odds: 1.8,
          selection: buildSelection({ side: "away", title: "Away", odds: 1.8 }),
        }),
      ],
      fullTimeHomeGoals: 2,
      fullTimeAwayGoals: 0,
    }),
    buildRecord({
      id: "push",
      matchDate: "2026-07-20",
      candidates: [
        buildCandidate({
          marketType: "handicap",
          score: 68,
          selection: buildSelection({
            marketType: "handicap",
            marketFamily: "asianHandicap",
            side: "home",
            title: "Home 0",
            line: 0,
            rawLine: "0",
            modifier: "plain",
            handicap: 0,
            odds: 1.9,
          }),
        }),
      ],
      fullTimeHomeGoals: 1,
      fullTimeAwayGoals: 1,
    }),
    buildRecord({
      id: "void",
      matchDate: "2026-07-20",
      status: "CANCELLED",
      candidates: [buildCandidate({ odds: 2.0 })],
    }),
  ];

  const response = buildRoiPerformanceResponse(records, {
    fromDate: "2026-07-01",
    toDate: "2026-07-31",
  });

  assert(response.summary.winCount === 1, `winCount should be 1, got ${response.summary.winCount}`);
  assert(response.summary.lossCount === 1, `lossCount should be 1, got ${response.summary.lossCount}`);
  assert(response.summary.pushCount === 1, `pushCount should be 1, got ${response.summary.pushCount}`);
  assert(response.summary.voidCount === 1, `voidCount should be 1, got ${response.summary.voidCount}`);
  assert(response.summary.roiEligibleCount === 2, "push/void excluded from denominator");
  assert(
    almostEqual(response.summary.totalProfit, 1.5 - 1),
    `profit should be 0.5, got ${response.summary.totalProfit}`
  );
  assert(
    almostEqual(response.summary.cumulativeRoi ?? 0, 0.5 / 2),
    `ROI should be 0.25, got ${response.summary.cumulativeRoi}`
  );
  assert(response.excludedReasonCounts.push === 1, "push exclusion counted");
  assert(response.excludedReasonCounts.void === 1, "void exclusion counted");
}

function testInvalidOddsExcluded(): void {
  const records = [
    buildRecord({
      id: "bad-odds",
      candidates: [buildCandidate({ odds: 0 })],
    }),
  ];
  const response = buildRoiPerformanceResponse(records, {
    fromDate: "2026-07-01",
    toDate: "2026-07-31",
  });
  assert(response.summary.roiEligibleCount === 0, "invalid odds not eligible");
  assert(response.excludedReasonCounts.invalid_odds === 1, "invalid odds reason");
}

function testFilters(): void {
  const records = [
    buildRecord({
      id: "pl",
      league: "Premier League",
      weightVersion: "w1",
      candidates: [buildCandidate({ odds: 2.0 })],
      fullTimeHomeGoals: 1,
      fullTimeAwayGoals: 0,
    }),
    buildRecord({
      id: "ll",
      league: "La Liga",
      weightVersion: "w2",
      candidates: [
        buildCandidate({
          marketType: "btts",
          odds: 1.9,
          selection: buildSelection({
            marketType: "btts",
            marketFamily: "btts",
            side: "yes",
            title: "BTTS Yes",
            odds: 1.9,
          }),
        }),
      ],
      fullTimeHomeGoals: 1,
      fullTimeAwayGoals: 1,
    }),
  ];

  const filtered = buildRoiPerformanceResponse(records, {
    fromDate: "2026-07-01",
    toDate: "2026-07-31",
    league: "Premier League",
    onlyRoiEligible: true,
  });

  assert(filtered.pagination.totalRecords === 1, "league filter should keep one record");
  assert(filtered.records[0]?.league === "Premier League", "filtered league");
  assert(filtered.records.every((row) => row.roiEligible), "only eligible filter");
}

function testApiResponseSchema(): void {
  const response = buildRoiPerformanceResponse(
    [
      buildRecord({
        id: "schema",
        candidates: [buildCandidate({ odds: 2.1 })],
        fullTimeHomeGoals: 3,
        fullTimeAwayGoals: 1,
      }),
    ],
    { fromDate: "2026-07-01", toDate: "2026-07-31" }
  );

  assert(typeof response.summary.verifiedCount === "number", "summary.verifiedCount");
  assert(typeof response.summary.roiEligibleCount === "number", "summary.roiEligibleCount");
  assert(Array.isArray(response.breakdowns.byMarket), "breakdowns.byMarket");
  assert(Array.isArray(response.breakdowns.byLeague), "breakdowns.byLeague");
  assert(Array.isArray(response.breakdowns.byGrade), "breakdowns.byGrade");
  assert(Array.isArray(response.breakdowns.byWeightVersion), "breakdowns.byWeightVersion");
  assert(Array.isArray(response.records), "records");
  assert(typeof response.excludedReasonCounts.no_recommendation === "number", "excluded");
  assert(typeof response.pagination.page === "number", "pagination");
  assert(response.records[0]?.recommendationGrade.length > 0, "grade present");
  assert(response.records[0]?.weightVersion === "v-test", "weight version present");
}

function runTests(): void {
  testVerifiedCountNotEqualRoiEligible();
  testWinLossPushVoidAndDenominator();
  testInvalidOddsExcluded();
  testFilters();
  testApiResponseSchema();
  console.log("roiPerformanceService.test.ts passed");
}

runTests();
