import { SETTLEMENT_TEST_CASES } from "@/lib/backtest/mockData";
import { runMatchVerification } from "@/lib/database/matchVerification";
import {
  buildRecommendationLearningDashboardData,
  sortRecommendationLearningRecords,
} from "@/lib/recommendation/recommendationLearningAnalytics";
import { buildRecommendationLearningRecord } from "@/lib/recommendation/recommendationLearningBuilder";
import {
  clearRecommendationLearningMemory,
  getRecommendationLearningFromMemory,
  listRecommendationLearningFromMemory,
} from "@/lib/recommendation/recommendationLearningMemoryStore";
import { persistRecommendationLearningLocally } from "@/lib/recommendation/recommendationLearningPersistence";
import { enrichRecordWithReplayValidation } from "@/lib/replay/replayBuilder";
import { createEmptyRecommendationResult } from "@/lib/recommendation/recommendationTypes";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { ReplayProviderRecommendationDiagnostic } from "@/lib/replay/replayTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function buildVerifiedRecord(input: {
  id: string;
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  diagnostics: ReplayProviderRecommendationDiagnostic[];
  globalPass?: boolean;
}): HistoricalMatchRecord {
  const winCase = SETTLEMENT_TEST_CASES.find(
    (item) => item.expected === "WIN" && item.selection.marketType === "moneyline"
  );
  assert(Boolean(winCase), "settlement fixture should include WIN case");

  const recommendation = createEmptyRecommendationResult({
    globalPass: input.globalPass ?? false,
    candidates: input.globalPass
      ? []
      : [
          {
            marketType: winCase!.selection.marketType,
            selection: winCase!.selection,
            confidence: "high",
            expectedValue: 0.08,
            score: 70,
            reasons: ["Recent form"],
            warnings: [],
            supportingFeatures: ["recentForm"],
          },
        ],
    providerDiagnostics: input.diagnostics.map((entry) => ({
      providerKey: entry.providerKey,
      providerWeight: entry.providerWeight,
      providerContribution: entry.providerContribution,
      providerSource:
        entry.providerSource === "match-records"
          ? "matchRecords"
          : entry.providerSource === "google"
            ? "googleSearch"
            : entry.providerSource === "team-profile"
              ? "teamProfile"
              : "unavailable",
      providerConfidence: entry.providerConfidence,
    })),
    usableProviderCount: input.diagnostics.filter((entry) => entry.providerSource !== "unavailable")
      .length,
    unavailableProviderCount: input.diagnostics.filter(
      (entry) => entry.providerSource === "unavailable"
    ).length,
    providerOverallConfidence: 0.75,
  });

  const pending: HistoricalMatchRecord = {
    id: input.id,
    date: "2026-07-16",
    matchDate: "2026-07-16",
    league: "Premier League",
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    rawOdds: "test",
    marketSelections: [],
    result: null,
    analysisSnapshot: {
      features: [],
      interpretations: [],
      marketAnalysis: {} as HistoricalMatchRecord["analysisSnapshot"] extends infer T
        ? T extends { marketAnalysis: infer M }
          ? M
          : never
        : never,
      combinedAnalysis: {} as HistoricalMatchRecord["analysisSnapshot"] extends infer T
        ? T extends { combinedAnalysis: infer M }
          ? M
          : never
        : never,
      candidates: [],
      recommendation: {
        enabled: true,
        fusion: null,
        result: recommendation,
        message: "",
      },
      replay: null,
      bettingIntelligence: null,
      decision: null,
      capturedAt: new Date().toISOString(),
    },
    candidates: [],
    status: "PENDING",
    verificationResult: null,
    fixtureId: input.fixtureId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const withResult = {
    ...pending,
    result: winCase!.result,
  };

  const verificationResult = runMatchVerification(withResult, [withResult]);
  return enrichRecordWithReplayValidation({
    ...withResult,
    status: "VERIFIED",
    verificationResult,
    updatedAt: new Date().toISOString(),
  });
}

function runTests(): void {
  clearRecommendationLearningMemory();

  const diagnostics: ReplayProviderRecommendationDiagnostic[] = [
    {
      providerKey: "recentForm",
      providerWeight: 0.4,
      providerContribution: 30,
      providerSource: "match-records",
      providerConfidence: 0.8,
    },
    {
      providerKey: "h2h",
      providerWeight: 0.3,
      providerContribution: 20,
      providerSource: "google",
      providerConfidence: 0.7,
    },
    {
      providerKey: "squadAvailability",
      providerWeight: 0,
      providerContribution: 0,
      providerSource: "unavailable",
      providerConfidence: 0.1,
    },
  ];

  const verified = buildVerifiedRecord({
    id: "11111111-1111-1111-1111-111111111111",
    fixtureId: 9001,
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    homeGoals: 2,
    awayGoals: 1,
    diagnostics,
  });

  const learningRecord = buildRecommendationLearningRecord(verified);
  assert(Boolean(learningRecord), "verified record should produce learning record");
  assert(learningRecord!.fixtureId === 9001, "fixture_id should be preserved");
  assert(learningRecord!.providerOverallConfidence === 0.75, "providerOverallConfidence preserved");
  assert(learningRecord!.providerDiagnostics.length === 3, "providerDiagnostics preserved");
  assert(learningRecord!.hit === true, "win recommendation should hit");
  assert(learningRecord!.marketOutcomes.some((item) => item.marketKey === "1X2"), "1X2 outcome exists");

  persistRecommendationLearningLocally(verified);
  const stored = getRecommendationLearningFromMemory(verified.id);
  assert(Boolean(stored), "learning record should persist in memory");
  assert(stored!.matchRecordId === verified.id, "match_record_id should match");

  const verifiedLose = buildVerifiedRecord({
    id: "22222222-2222-2222-2222-222222222222",
    fixtureId: 9002,
    homeTeam: "Liverpool",
    awayTeam: "Spurs",
    homeGoals: 0,
    awayGoals: 2,
    diagnostics: [
      {
        providerKey: "recentForm",
        providerWeight: 0.5,
        providerContribution: 40,
        providerSource: "team-profile",
        providerConfidence: 0.65,
      },
    ],
  });
  persistRecommendationLearningLocally(verifiedLose);

  const dashboard = buildRecommendationLearningDashboardData(
    listRecommendationLearningFromMemory()
  );
  assert(dashboard.totalRecords === 2, "dashboard should include two records");
  assert(dashboard.last100.sampleSize === 2, "last100 should include both records");
  assert(dashboard.overall.providerRanking.length >= 2, "provider ranking should exist");
  assert(
    dashboard.overall.providerRanking.some((item) => item.providerKey === "recentForm"),
    "recentForm should appear in provider ranking"
  );
  assert(
    dashboard.overall.marketStats.some((item) => item.marketKey === "1X2"),
    "market stats should include 1X2"
  );

  const sorted = sortRecommendationLearningRecords(listRecommendationLearningFromMemory());
  assert(sorted.length === 2, "sorted records should preserve count");

  console.log("Recommendation Learning tests passed.");
}

runTests();

export {};
