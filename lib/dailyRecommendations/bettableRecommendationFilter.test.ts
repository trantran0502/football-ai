import type { DailyRecommendationRecord } from "@/lib/dailyRecommendations/dailyRecommendationTypes";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { buildDailyRecommendationRecords } from "@/lib/dailyRecommendations/dailyRecommendationRanking";
import {
  filterBettableDailyRecommendations,
  isBettableDailyRecommendation,
  isBettableMatchRecordForRecommendation,
} from "@/lib/dailyRecommendations/bettableRecommendationFilter";
import type { RecommendationCandidate } from "@/lib/recommendation/recommendationTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function buildCandidate(): RecommendationCandidate {
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
    confidence: "high",
    expectedValue: 0.08,
    score: 88,
    marketScore: 88,
    evidenceScore: 10,
    reasons: ["主隊近況佳"],
    warnings: [],
    supportingFeatures: ["Recent Form"],
  };
}

function buildMatchRecord(input: {
  id: string;
  matchTime: string;
  matchDate?: string;
  status?: HistoricalMatchRecord["status"];
}): HistoricalMatchRecord {
  return {
    id: input.id,
    date: input.matchDate ?? "2026-07-19",
    matchDate: input.matchDate ?? "2026-07-19",
    league: "Premier League",
    homeTeam: "Home FC",
    awayTeam: "Away FC",
    rawOdds: "sample",
    marketSelections: [buildCandidate().selection],
    result: input.status === "VERIFIED" ? { homeScore: 2, awayScore: 1 } : null,
    analysisSnapshot: {
      features: [],
      interpretations: [],
      marketAnalysis: {},
      combinedAnalysis: {},
      candidates: [],
      recommendation: {
        enabled: true,
        fusion: {
          overallScore: 50,
          overallConfidence: 0.9,
          strongestFactors: [],
          weakestFactors: [],
          warnings: [],
          categories: [],
        },
        result: {
          candidates: [buildCandidate()],
          globalPass: false,
          passReason: null,
          usableProviderCount: 3,
          unavailableProviderCount: 0,
          providerDiagnostics: [],
          providerOverallConfidence: 0.9,
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
        version: "3",
        capturedAt: "2026-07-19T10:00:00.000Z",
        match: {
          matchId: input.id,
          fixtureId: 123,
          league: "Premier League",
          leagueId: 39,
          season: 2026,
          matchTime: input.matchTime,
          homeTeam: "Home FC",
          awayTeam: "Away FC",
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
      capturedAt: "2026-07-19T10:00:00.000Z",
    },
    candidates: [],
    status: input.status ?? "PENDING",
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

function buildRecommendation(kickoffTime: string): DailyRecommendationRecord {
  return {
    id: "rec-1",
    schedulerRun: "run-1",
    fixtureId: 123,
    matchDate: "2026-07-19",
    kickoffTime,
    leagueId: 39,
    leagueName: "Premier League",
    country: "",
    homeTeam: "Home FC",
    awayTeam: "Away FC",
    market: "讓分",
    recommendation: "主 -0.5",
    odds: 1.93,
    confidence: 90,
    score: 88,
    rank: 1,
    grade: "A",
    reasoning: ["test"],
    analysisSnapshot: null,
    matchRecordId: "match-1",
    createdAt: "2026-07-19T12:05:00.000Z",
  };
}

function testApiAndUiHidePastKickoff(): void {
  const now = new Date("2026-07-19T12:05:00.000Z");
  const bettable = buildRecommendation("2026-07-19T15:00:00.000Z");
  const expired = buildRecommendation("2026-07-19T07:30:00.000Z");
  const tooSoon = buildRecommendation("2026-07-19T12:10:00.000Z");

  assert(isBettableDailyRecommendation(bettable, now), "future kickoff should be bettable");
  assert(!isBettableDailyRecommendation(expired, now), "past kickoff should not be bettable");
  assert(!isBettableDailyRecommendation(tooSoon, now), "kickoff within buffer should not be bettable");

  const filtered = filterBettableDailyRecommendations([bettable, expired, tooSoon], now);
  assert(filtered.length === 1 && filtered[0]?.id === bettable.id, "API/UI filter should keep only bettable rows");
}

function testBuildDailyRecommendationsExcludePastKickoff(): void {
  const now = new Date("2026-07-19T12:05:00.000Z");
  const upcoming = buildMatchRecord({
    id: "upcoming",
    matchTime: "2026-07-19T15:00:00.000Z",
  });
  const expired = buildMatchRecord({
    id: "expired",
    matchTime: "2026-07-19T05:00:00.000Z",
  });

  assert(
    isBettableMatchRecordForRecommendation(upcoming, now),
    "upcoming match record should remain bettable"
  );
  assert(
    !isBettableMatchRecordForRecommendation(expired, now),
    "expired match record should not be bettable"
  );

  const built = buildDailyRecommendationRecords({
    matchDate: "2026-07-19",
    schedulerRunId: "scheduler-run-1",
    records: [upcoming, expired],
    now: () => now,
  });

  assert(built.length === 1, "rebuild should exclude past-kickoff records");
  assert(built[0]?.matchRecordId === "upcoming", "only upcoming record should be recommended");
}

function testVerifiedRecordsStillExistForResultUpdate(): void {
  const verified = buildMatchRecord({
    id: "verified-old",
    matchTime: "2026-07-19T05:00:00.000Z",
    status: "VERIFIED",
  });

  assert(verified.status === "VERIFIED", "verified records should remain untouched by bettable filter");
  assert(
    !isBettableMatchRecordForRecommendation(verified, new Date("2026-07-19T12:05:00.000Z")),
    "verified old kickoff should not appear as bettable recommendation"
  );
}

function testUtcCrossDayBettableFilter(): void {
  const now = new Date("2026-07-19T23:50:00.000Z");
  const crossDay = buildRecommendation("2026-07-20T00:30:00.000Z");
  assert(isBettableDailyRecommendation(crossDay, now), "cross-day kickoff should use UTC ISO comparison");
}

function runTests(): void {
  testApiAndUiHidePastKickoff();
  testBuildDailyRecommendationsExcludePastKickoff();
  testVerifiedRecordsStillExistForResultUpdate();
  testUtcCrossDayBettableFilter();
  console.log("bettableRecommendationFilter.test.ts passed");
}

runTests();
