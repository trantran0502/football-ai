import type { AnalysisSnapshot, HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  buildDailyRecommendationRecords,
  computeDailyRecommendationScore,
  rankDailyRecommendationEntries,
  selectDailyRecommendationEntries,
} from "@/lib/dailyRecommendations/dailyRecommendationRanking";
import {
  DAILY_RECOMMENDATION_CONFIDENCE_THRESHOLD,
  DAILY_RECOMMENDATION_SCORE_THRESHOLD,
} from "@/lib/dailyRecommendations/dailyRecommendationTypes";
import type { RecommendationCandidate } from "@/lib/recommendation/recommendationTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function buildRecord(input: {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league?: string;
  candidate: RecommendationCandidate;
  fusionConfidence?: number;
}): HistoricalMatchRecord {
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
        overallConfidence: input.fusionConfidence ?? 0.9,
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
        providerOverallConfidence: input.fusionConfidence ?? 0.9,
        evidenceReport: null,
        evidenceScore: null,
        evidenceConfidence: null,
        evidenceSummary: ["xG 優勢", "主場勝率高"],
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
        league: input.league ?? "Premier League",
        leagueId: 39,
        season: 2026,
        matchTime: "2026-07-20T03:00:00.000Z",
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
      marketReplay: null,
      decisionReplay: null,
      validation: null,
    },
    bettingIntelligence: null,
    decision: null,
    dataCompleteness: {
      status: "complete" as const,
      eligibleForRecommendation: true,
    },
    capturedAt: "2026-07-19T10:00:00.000Z",
  } as AnalysisSnapshot;

  return {
    id: input.id,
    date: "2026-07-19",
    matchDate: "2026-07-19",
    league: input.league ?? "Premier League",
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    rawOdds: "sample",
    marketSelections: [input.candidate.selection],
    result: null,
    analysisSnapshot: snapshot,
    candidates: [],
    status: "PENDING",
    verificationResult: null,
    fixtureId: 123,
    leagueId: 39,
    season: 2026,
    homeTeamId: 1,
    awayTeamId: 2,
    createdAt: "2026-07-19T10:00:00.000Z",
    updatedAt: "2026-07-19T10:00:00.000Z",
  };
}

function buildCandidate(score: number, confidence: RecommendationCandidate["confidence"]): RecommendationCandidate {
  return {
    marketType: "handicap",
    selection: {
      marketType: "handicap",
      marketFamily: "handicap",
      title: "讓分",
      period: "full",
      side: "home",
      line: -0.5,
      rawLine: "-0.5",
      modifier: null,
      odds: 1.93,
      impliedProbability: 0.52,
    },
    confidence,
    expectedValue: 0.08,
    score,
    marketScore: score,
    evidenceScore: 10,
    reasons: ["主隊近況佳", "xG 優勢", "賠率有價值"],
    warnings: [],
    supportingFeatures: ["Recent Form"],
  };
}

async function runDailyRecommendationRankingTests(): Promise<void> {
  const high = buildRecord({
    id: "high-match",
    homeTeam: "Liverpool",
    awayTeam: "Arsenal",
    candidate: buildCandidate(88, "high"),
    fusionConfidence: 0.91,
  });
  const medium = buildRecord({
    id: "medium-match",
    homeTeam: "Barcelona",
    awayTeam: "Real Madrid",
    candidate: buildCandidate(72, "medium"),
    fusionConfidence: 0.75,
  });
  const low = buildRecord({
    id: "low-match",
    homeTeam: "Team A",
    awayTeam: "Team B",
    candidate: buildCandidate(55, "low"),
    fusionConfidence: 0.6,
  });

  const ranked = rankDailyRecommendationEntries([medium, low, high]);
  assert(ranked[0]?.matchRecord.id === "high-match", "highest score should rank first");

  const selectedQualified = selectDailyRecommendationEntries(ranked);
  assert(
    selectedQualified.every(
      (entry) =>
        entry.score >= DAILY_RECOMMENDATION_SCORE_THRESHOLD &&
        entry.confidence >= DAILY_RECOMMENDATION_CONFIDENCE_THRESHOLD
    ),
    "qualified selection should meet score and confidence thresholds"
  );
  assert(selectedQualified.length <= 3, "should keep at most three picks");

  const onlyLow = rankDailyRecommendationEntries([
    buildRecord({
      id: "low-a",
      homeTeam: "Team C",
      awayTeam: "Team D",
      candidate: buildCandidate(40, "low"),
      fusionConfidence: 0.4,
    }),
    buildRecord({
      id: "low-b",
      homeTeam: "Team E",
      awayTeam: "Team F",
      candidate: buildCandidate(35, "low"),
      fusionConfidence: 0.35,
    }),
  ]);
  const noFallback = selectDailyRecommendationEntries(onlyLow);
  assert(noFallback.length === 0, "should not fallback to low-score picks when none meet threshold");

  const built = buildDailyRecommendationRecords({
    matchDate: "2026-07-19",
    schedulerRunId: "scheduler-run-1",
    records: [high, medium, low],
    now: () => new Date("2026-07-19T12:00:00.000Z"),
  });
  assert(built.length >= 1, "should build at least one recommendation when qualified candidates exist");
  assert(built[0]?.rank === 1, "first built record should be rank 1");
  assert(built[0]?.homeTeam === "Liverpool", "top record should map match teams");
  assert(built[0]?.recommendation.includes("主"), "recommendation label should be localized");

  const score = computeDailyRecommendationScore(buildCandidate(88, "high"), 0.91);
  assert(score >= DAILY_RECOMMENDATION_SCORE_THRESHOLD, "high candidate should produce display score above threshold");

  console.log("Daily recommendation ranking tests passed.");
}

void runDailyRecommendationRankingTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
