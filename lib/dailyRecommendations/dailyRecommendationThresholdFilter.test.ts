import type { AnalysisSnapshot, HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  buildDailyRecommendationRecords,
  rankDailyRecommendationEntries,
  selectDailyRecommendationEntries,
} from "@/lib/dailyRecommendations/dailyRecommendationRanking";
import {
  assessDailyRecommendationThreshold,
  filterQualifiedDailyRecommendations,
  isEligibleDailyRecommendationEntry,
} from "@/lib/dailyRecommendations/dailyRecommendationThresholdFilter";
import {
  DAILY_RECOMMENDATION_CONFIDENCE_THRESHOLD,
  DAILY_RECOMMENDATION_SCORE_THRESHOLD,
  type DailyRecommendationRecord,
} from "@/lib/dailyRecommendations/dailyRecommendationTypes";
import type { RecommendationCandidate } from "@/lib/recommendation/recommendationTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function buildCandidate(score: number): RecommendationCandidate {
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
    score,
    marketScore: score,
    evidenceScore: 10,
    reasons: ["主隊近況佳"],
    warnings: [],
    supportingFeatures: ["Recent Form"],
  };
}

function buildRecord(input: {
  id: string;
  candidateScore?: number;
  fusionConfidence?: number;
  complete?: boolean;
}): HistoricalMatchRecord {
  const complete = input.complete ?? true;
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
        candidates: [buildCandidate(input.candidateScore ?? 88)],
        globalPass: false,
        passReason: null,
        usableProviderCount: 3,
        unavailableProviderCount: 0,
        providerDiagnostics: [],
        providerOverallConfidence: input.fusionConfidence ?? 0.9,
        evidenceReport: null,
        evidenceScore: null,
        evidenceConfidence: null,
        evidenceSummary: ["xG 優勢"],
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
        league: "Premier League",
        leagueId: 39,
        season: 2026,
        matchTime: "2026-07-20T03:00:00.000Z",
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
    dataCompleteness: complete
      ? {
          status: "complete" as const,
          eligibleForRecommendation: true,
        }
      : {
          status: "incomplete" as const,
          eligibleForRecommendation: false,
          completenessReasons: ["home_team_profile_unavailable"],
        },
    capturedAt: "2026-07-19T10:00:00.000Z",
  } as AnalysisSnapshot;

  return {
    id: input.id,
    date: "2026-07-19",
    matchDate: "2026-07-19",
    league: "Premier League",
    homeTeam: "Home FC",
    awayTeam: "Away FC",
    rawOdds: "sample",
    marketSelections: [buildCandidate(input.candidateScore ?? 88).selection],
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

function buildRecommendationRecord(input: {
  score: number;
  confidence: number;
  grade: string;
  complete?: boolean;
}): DailyRecommendationRecord {
  return {
    id: "rec-1",
    schedulerRun: "run-1",
    fixtureId: 123,
    matchDate: "2026-07-19",
    kickoffTime: "2026-07-20T03:00:00.000Z",
    leagueId: 39,
    leagueName: "Premier League",
    country: "",
    homeTeam: "Home FC",
    awayTeam: "Away FC",
    market: "讓分",
    recommendation: "主 -0.5",
    odds: 1.93,
    confidence: input.confidence,
    score: input.score,
    rank: 1,
    grade: input.grade,
    reasoning: ["test"],
    analysisSnapshot: {
      dataCompleteness: input.complete === false
        ? { status: "incomplete", eligibleForRecommendation: false }
        : { status: "complete", eligibleForRecommendation: true },
    } as AnalysisSnapshot,
    matchRecordId: "match-1",
    createdAt: "2026-07-19T12:00:00.000Z",
  };
}

function testLowScoreAndConfidenceRejected(): void {
  const assessment = assessDailyRecommendationThreshold({ score: 6, confidence: 20 });
  assert(!assessment.eligible, "score=6 and confidence=20% should not qualify");
  assert(assessment.rejectedByScore, "should reject by score");
  assert(assessment.rejectedByConfidence, "should reject by confidence");
}

function testQualifiedScoreAndConfidenceAccepted(): void {
  const assessment = assessDailyRecommendationThreshold({ score: 70, confidence: 60 });
  assert(assessment.eligible, "score=70 and confidence=60% should qualify");
}

function testOnlyLowCandidatesProduceNoRecommendations(): void {
  const lowA = buildRecord({ id: "low-a", candidateScore: 40, fusionConfidence: 0.4 });
  const lowB = buildRecord({ id: "low-b", candidateScore: 35, fusionConfidence: 0.35 });
  const ranked = rankDailyRecommendationEntries([lowA, lowB]);
  const selected = selectDailyRecommendationEntries(ranked);
  assert(selected.length === 0, "only low-score candidates should produce no recommendations");
}

function testIncompleteHighScoreRejected(): void {
  const incompleteHigh = buildRecord({
    id: "incomplete-high",
    candidateScore: 95,
    fusionConfidence: 0.95,
    complete: false,
  });
  const ranked = rankDailyRecommendationEntries([incompleteHigh]);
  assert(
    ranked.every((entry) => !isEligibleDailyRecommendationEntry(entry)),
    "incomplete high-score match should not be eligible"
  );
  const built = buildDailyRecommendationRecords({
    matchDate: "2026-07-19",
    schedulerRunId: "scheduler-run-1",
    records: [incompleteHigh],
    now: () => new Date("2026-07-19T12:00:00.000Z"),
  });
  assert(built.length === 0, "incomplete high-score match should not become Top 1");
}

function testQualifiedCandidateCanRankTop1(): void {
  const qualified = buildRecord({
    id: "qualified",
    candidateScore: 88,
    fusionConfidence: 0.75,
  });
  const built = buildDailyRecommendationRecords({
    matchDate: "2026-07-19",
    schedulerRunId: "scheduler-run-1",
    records: [qualified],
    now: () => new Date("2026-07-19T12:00:00.000Z"),
  });
  assert(built.length === 1, "qualified candidate should be recommended");
  assert(built[0]?.rank === 1, "qualified candidate should rank Top 1");
  assert(
    built[0]?.score >= DAILY_RECOMMENDATION_SCORE_THRESHOLD,
    "Top 1 should meet score threshold"
  );
  assert(
    built[0]?.confidence >= DAILY_RECOMMENDATION_CONFIDENCE_THRESHOLD,
    "Top 1 should meet confidence threshold"
  );
  assert(built[0]?.grade !== "—", "Top 1 should have valid grade");
}

function testApiFilterBlocksUnqualifiedRows(): void {
  const qualified = buildRecommendationRecord({ score: 70, confidence: 60, grade: "C" });
  const unqualified = buildRecommendationRecord({ score: 6, confidence: 20, grade: "—" });
  const filtered = filterQualifiedDailyRecommendations([qualified, unqualified]);
  assert(filtered.length === 1, "API defense should keep only qualified rows");
  assert(filtered[0]?.score === 70, "qualified row should remain");
}

function runTests(): void {
  testLowScoreAndConfidenceRejected();
  testQualifiedScoreAndConfidenceAccepted();
  testOnlyLowCandidatesProduceNoRecommendations();
  testIncompleteHighScoreRejected();
  testQualifiedCandidateCanRankTop1();
  testApiFilterBlocksUnqualifiedRows();
  console.log("dailyRecommendationThresholdFilter.test.ts passed");
}

runTests();
