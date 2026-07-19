import {
  assessRecommendationDataCompleteness,
  assessSnapshotRecommendationEligibility,
  isEligibleForDailyRecommendation,
} from "@/lib/analysis/analysisDataCompleteness";
import type { AnalysisReport } from "@/lib/analysis/types";
import type { AnalysisSnapshot, HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { TeamProfile } from "@/lib/teamProfile/teamProfileTypes";
import { normalizeFeatureAvailability } from "@/lib/analysis/featureScore/featureAvailability";
import type { FeatureScore } from "@/lib/analysis/featureScore/types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function buildProfile(overrides: Partial<TeamProfile> = {}): TeamProfile {
  return {
    teamId: 1,
    teamName: "Team A",
    leagueId: 39,
    leagueName: "Premier League",
    season: 2026,
    requestedSeason: 2026,
    isHistoricalBaseline: false,
    stalenessYears: 0,
    sampleSize: 10,
    recent10Wins: 6,
    recent10Draws: 2,
    recent10Losses: 2,
    recent10PointsPerGame: 2,
    recent10AvgGoals: 1.8,
    recent10AvgConceded: 1.1,
    home5Matches: 5,
    home5WinRate: 0.6,
    home5AvgGoals: 2,
    home5AvgConceded: 1,
    away5Matches: 5,
    away5WinRate: 0.4,
    away5AvgGoals: 1.5,
    away5AvgConceded: 1.2,
    bttsRate: 0.5,
    over25Rate: 0.5,
    over35Rate: 0.2,
    under25Rate: 0.5,
    cleanSheetRate: 0.3,
    failedToScoreRate: 0.2,
    avgShots: 12,
    avgShotsOnTarget: 5,
    avgPossession: 52,
    avgXg: 1.5,
    avgXga: 1.1,
    formScore: 70,
    momentumScore: 65,
    source: "api-football",
    dataCompleteness: 85,
    calculatedAt: "2026-07-19T10:00:00.000Z",
    ...overrides,
  };
}

function buildReport(overrides: Partial<AnalysisReport> = {}): AnalysisReport {
  return {
    match: {
      homeTeam: "Home FC",
      awayTeam: "Away FC",
      league: "Premier League",
    },
    markets: [
      {
        marketType: "moneyline",
        marketFamily: "moneyline",
        title: "Moneyline",
        period: "full",
        side: "home",
        line: null,
        rawLine: null,
        modifier: null,
        odds: 1.95,
        impliedProbability: 0.51,
      },
    ],
    interpretations: [],
    crossMarketValidation: {
      status: "notImplemented",
      reason: "test",
      rules: [],
    },
    candidates: [],
    betaRecommendation: { enabled: false, message: "" },
    recommendation: { enabled: true, message: "" },
    bettingIntelligence: null,
    decision: null,
    teamProfiles: {
      home: buildProfile({ teamId: 1, teamName: "Home FC" }),
      away: buildProfile({ teamId: 2, teamName: "Away FC" }),
      completeness: 85,
      warnings: [],
    },
    ...overrides,
  };
}

function testCompleteProfilesEligible(): void {
  const assessment = assessRecommendationDataCompleteness({
    report: buildReport(),
    matchId: "match-1",
    rawSources: {
      apiFootballRaw: { source: "api-football-normalized" },
      googleGroundingRaw: null,
      citations: [],
      cacheSource: "api-football",
    },
  });
  assert(assessment.eligibleForRecommendation, "complete profiles should be eligible");
}

function testHalfProfileMissingIneligible(): void {
  const assessment = assessRecommendationDataCompleteness({
    report: buildReport({
      teamProfiles: {
        home: buildProfile(),
        away: buildProfile({
          sampleSize: 0,
          source: "incomplete",
          dataCompleteness: 0,
          recent10AvgGoals: null,
          recent10AvgConceded: null,
        }),
        completeness: 40,
        warnings: ["quota exhausted"],
      },
      analysisContext: {
        profileDiagnostics: [
          {
            teamId: 2,
            teamName: "Away FC",
            side: "away",
            matchLabel: "Home FC vs Away FC",
            skippedReason: "quota_exhausted",
            quotaExhausted: true,
            quotaAvailable: false,
            apiConfigured: true,
            rawResponseCount: 0,
            afterGoalFilterCount: 0,
            normalizedMatchCount: 0,
            requestedSeason: 2026,
            dataSeason: null,
            isHistoricalBaseline: false,
            stalenessYears: null,
            source: "incomplete",
            sampleSize: 0,
            warnings: [],
            attempts: [],
          },
        ],
      },
    }),
    matchId: "match-2",
  });
  assert(!assessment.eligibleForRecommendation, "half profile should be ineligible");
  assert(assessment.profileDeferred, "quota exhausted should mark deferred");
}

function testLegacySnapshotReason(): void {
  const snapshot = {
    features: [],
    interpretations: [],
    marketAnalysis: {},
    combinedAnalysis: {},
    candidates: [],
    recommendation: null,
    replay: {
      version: "3" as const,
      capturedAt: "2026-07-19T10:00:00.000Z",
      match: {
        matchId: "legacy-1",
        fixtureId: 1,
        league: "Premier League",
        leagueId: 39,
        season: 2026,
        matchTime: "2026-07-19T15:00:00.000Z",
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
  } as AnalysisSnapshot;

  const assessment = assessSnapshotRecommendationEligibility(snapshot);
  assert(!assessment.eligibleForRecommendation, "legacy snapshot without metadata should fail");
}

function testDailyRecommendationEligibility(): void {
  const eligibleRecord = {
    id: "eligible",
    matchDate: "2026-07-19",
    analysisSnapshot: {
      dataCompleteness: { eligibleForRecommendation: true },
    },
  } as HistoricalMatchRecord;
  const ineligibleRecord = {
    id: "ineligible",
    matchDate: "2026-07-19",
    analysisSnapshot: {
      dataCompleteness: { eligibleForRecommendation: false },
    },
  } as HistoricalMatchRecord;

  assert(isEligibleForDailyRecommendation(eligibleRecord), "eligible record should pass");
  assert(!isEligibleForDailyRecommendation(ineligibleRecord), "ineligible record should fail");
}

function runTests(): void {
  testCompleteProfilesEligible();
  testHalfProfileMissingIneligible();
  testLegacySnapshotReason();
  testDailyRecommendationEligibility();
  console.log("analysisDataCompleteness.test.ts passed");
}

runTests();
