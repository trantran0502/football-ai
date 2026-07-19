import type { AnalysisSnapshot, HistoricalMatchRecord, MatchResult } from "@/lib/database/matchSchema";
import {
  buildHitRateTrend,
  buildPerformanceCenterReport,
  buildStreakStats,
  resolveBestHighlight,
} from "@/lib/performance/performanceAggregation";
import { enrichDailyRecommendation, resolvePlayType } from "@/lib/performance/performanceSettlement";
import { buildDailyRecommendationRecords } from "@/lib/dailyRecommendations/dailyRecommendationRanking";
import type { RecommendationCandidate } from "@/lib/recommendation/recommendationTypes";
import { evaluateRecommendationCandidate } from "@/lib/validation/validationEngine";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function buildCandidate(input: {
  marketType: RecommendationCandidate["marketType"];
  side: RecommendationCandidate["selection"]["side"];
  odds?: number;
}): RecommendationCandidate {
  return {
    marketType: input.marketType,
    selection: {
      marketType: input.marketType,
      title: "test",
      side: input.side,
      odds: input.odds ?? 1.95,
      line: input.marketType === "totalGoals" ? 2.5 : null,
      rawLine: input.marketType === "totalGoals" ? "2.5" : null,
      label: null,
    },
    confidence: "high",
    score: 88,
    expectedValue: 0.1,
    reasons: ["test reason"],
    supportingFeatures: [],
    ruleKeys: [],
  };
}

function buildVerifiedRecord(input: {
  id: string;
  matchDate: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  candidate: RecommendationCandidate;
  matchResult: MatchResult;
}): HistoricalMatchRecord {
  const validation = evaluateRecommendationCandidate(input.candidate, input.matchResult);
  const snapshot = {
    features: [],
    interpretations: [],
    marketAnalysis: {},
    combinedAnalysis: {},
    candidates: [],
    recommendation: {
      enabled: true,
      fusion: {
        overallScore: 50,
        overallConfidence: 0.92,
        strongestFactors: [],
        weakestFactors: [],
        warnings: [],
        categories: [],
      },
      result: {
        candidates: [input.candidate],
        globalPass: false,
        passReason: null,
        usableProviderCount: 3,
        unavailableProviderCount: 0,
        providerDiagnostics: [],
        providerOverallConfidence: 0.92,
        evidenceReport: null,
        evidenceScore: null,
        evidenceConfidence: null,
        evidenceSummary: [],
        evidenceBreakdown: [],
        weightConfig: null,
      },
      message: "",
    },
    replay: {
      version: "3" as const,
      capturedAt: "2026-07-19T10:00:00.000Z",
      match: {
        matchId: input.id,
        fixtureId: 123,
        league: input.league,
        leagueId: 39,
        season: 2026,
        matchTime: `${input.matchDate}T10:00:00.000Z`,
        homeTeam: input.homeTeam,
        awayTeam: input.awayTeam,
      },
      raw: {
        apiFootballRaw: null,
        googleGroundingRaw: null,
        citations: [],
        cacheSource: null,
      },
      providers: [],
      features: [],
      fusion: null,
      recommendation: null,
      decision: null,
      bettingIntelligence: null,
      teamProfiles: null,
      weightConfig: null,
    },
    bettingIntelligence: null,
    decision: null,
    capturedAt: "2026-07-19T10:00:00.000Z",
  } satisfies AnalysisSnapshot;

  return {
    id: input.id,
    date: input.matchDate,
    matchDate: input.matchDate,
    league: input.league,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    rawOdds: "",
    marketSelections: [input.candidate.selection],
    result: input.matchResult,
    analysisSnapshot: snapshot,
    candidates: [],
    status: "VERIFIED",
    verificationResult: {
      verifiedAt: `${input.matchDate}T18:00:00.000Z`,
      backtest: {} as HistoricalMatchRecord["verificationResult"] extends infer T
        ? T extends { backtest: infer B }
          ? B
          : never
        : never,
      ruleValidation: {} as HistoricalMatchRecord["verificationResult"] extends infer T
        ? T extends { ruleValidation: infer R }
          ? R
          : never
        : never,
      recommendationValidation: {
        entries: [
          {
            matchId: input.id,
            homeTeam: input.homeTeam,
            awayTeam: input.awayTeam,
            matchDate: input.matchDate,
            candidate: input.candidate,
            evaluation: validation,
            marketKey: "Moneyline",
            ruleKeys: [],
          },
        ],
        report: {
          totalMatches: 1,
          totalRecommendations: 1,
          hitRate: validation.hit ? 1 : 0,
          roi: validation.profit,
          byMarket: {} as never,
          byRule: {},
          byFeature: {},
          confidenceDistribution: {} as never,
          recommendationsToDisable: [],
          recommendationsToIncreaseWeight: [],
        },
      },
    },
    createdAt: `${input.matchDate}T08:00:00.000Z`,
    updatedAt: `${input.matchDate}T18:00:00.000Z`,
  };
}

function runTests(): void {
  assert(resolvePlayType("獨贏", "主勝") === "主勝", "play type home win");
  assert(resolvePlayType("讓分", "主 -0.5") === "讓球", "play type handicap");
  assert(resolvePlayType("大小球", "大 2.5") === "大小球", "play type total");
  assert(resolvePlayType("雙方進球", "BTTS 是") === "BTTS", "play type btts");

  const homeWinCandidate = buildCandidate({
    marketType: "moneyline",
    side: "home",
    odds: 1.92,
  });
  const verifiedRecord = buildVerifiedRecord({
    id: "match-1",
    matchDate: "2026-07-18",
    league: "Premier League",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    candidate: homeWinCandidate,
    matchResult: {
      fullTimeHomeGoals: 2,
      fullTimeAwayGoals: 1,
      halfTimeHomeGoals: 1,
      halfTimeAwayGoals: 0,
      winner: "home",
      totalGoals: 3,
      bothTeamsScored: true,
    },
  });

  const pendingRecord: HistoricalMatchRecord = {
    ...verifiedRecord,
    id: "match-2",
    status: "PENDING",
    result: null,
    verificationResult: null,
  };

  const recommendations = buildDailyRecommendationRecords({
    matchDate: "2026-07-18",
    schedulerRunId: "run-1",
    records: [verifiedRecord, pendingRecord],
    now: () => new Date("2026-07-19T01:00:00.000Z"),
  });

  assert(recommendations.length >= 1, "should build recommendations");

  const enriched = recommendations.map((recommendation) =>
    enrichDailyRecommendation(
      recommendation,
      recommendation.matchRecordId === verifiedRecord.id ? verifiedRecord : pendingRecord
    )
  );

  const hitItem = enriched.find((item) => item.recommendation.matchRecordId === "match-1");
  const pendingItem = enriched.find((item) => item.recommendation.matchRecordId === "match-2");
  assert(hitItem?.outcome === "hit", "verified home win should hit");
  assert(Math.abs((hitItem?.profit ?? 0) - 0.92) < 0.001, "hit profit should be +0.92");
  assert(pendingItem?.outcome === "pending", "pending match should stay pending");

  const report = buildPerformanceCenterReport({
    items: enriched,
    now: new Date("2026-07-19T01:00:00.000Z"),
  });

  assert(report.total.recommendations === enriched.length, "total recommendations");
  assert(report.total.hits === 1, "total hits");
  assert(report.total.misses === 0, "total misses");
  assert(Math.abs((report.total.roi ?? 0) - 0.92) < 0.001, "total roi should be +92%");
  assert(report.yesterday.recommendations === enriched.length, "yesterday bucket");
  assert(report.byLeague.some((item) => item.label === "Premier League"), "league bucket");
  assert(report.byMarket.some((item) => item.label === "主勝"), "market bucket");
  assert(report.recent.length <= 20, "recent picks capped at 20");
  assert(report.streaks.currentWinStreak === 1, "current win streak");
  assert(report.streaks.maxWinStreak === 1, "max win streak");

  const streakItems = [
    ...enriched,
    enrichDailyRecommendation(
      {
        ...recommendations[0]!,
        id: "rec-2",
        matchRecordId: "match-3",
        matchDate: "2026-07-17",
      },
      buildVerifiedRecord({
        id: "match-3",
        matchDate: "2026-07-17",
        league: "La Liga",
        homeTeam: "Barca",
        awayTeam: "Madrid",
        candidate: buildCandidate({ marketType: "handicap", side: "home", odds: 1.9 }),
        matchResult: {
          fullTimeHomeGoals: 0,
          fullTimeAwayGoals: 2,
          halfTimeHomeGoals: 0,
          halfTimeAwayGoals: 1,
          winner: "away",
          totalGoals: 2,
          bothTeamsScored: false,
        },
      })
    ),
  ];

  const streakReport = buildStreakStats(streakItems);
  assert(streakReport.currentWinStreak === 1, "current streak resets after latest miss");
  assert(streakReport.maxWinStreak === 1, "max streak remains 1");

  const trend = buildHitRateTrend(
    { recommendations: 4, hits: 3, misses: 1, pending: 0, hitRate: 0.75, profit: 1, totalStake: 4, roi: 0.25 },
    { recommendations: 4, hits: 2, misses: 2, pending: 0, hitRate: 0.5, profit: 0, totalStake: 4, roi: 0 }
  );
  assert(trend.direction === "up", "trend should be up");
  assert(Math.abs((trend.delta ?? 0) - 0.25) < 0.001, "trend delta");

  const bestLeague = resolveBestHighlight([
    {
      key: "a",
      label: "Premier League",
      recommendations: 5,
      hits: 4,
      misses: 1,
      pending: 0,
      hitRate: 0.8,
      profit: 1,
      totalStake: 5,
      roi: 0.2,
    },
    {
      key: "b",
      label: "La Liga",
      recommendations: 4,
      hits: 2,
      misses: 2,
      pending: 0,
      hitRate: 0.5,
      profit: 0,
      totalStake: 4,
      roi: 0,
    },
  ]);
  assert(bestLeague?.label === "Premier League", "best league highlight");

  console.log("performanceAggregation.test.ts: all tests passed");
}

runTests();
