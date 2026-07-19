import { canSettleMarketSelection, settleBet } from "@/lib/backtest/settlement";
import type { AnalysisSnapshot, HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { buildMatchResult } from "@/lib/database/matchSchema";
import { evaluateRecommendationCandidate } from "@/lib/validation/validationEngine";
import {
  buildResultUpdatesFromFixturesWithDiagnostics,
  normalizeResultUpdateMatchDate,
  normalizeResultUpdateTeamName,
} from "@/lib/production/resultUpdatePipeline";
import {
  attachScoresToFinishedFixtures,
  buildResultUpdatesFromFinishedFixturesWithDiagnostics,
} from "@/lib/scheduler/resultIntake";
import { intakeApiFixtures } from "@/lib/scheduler/fixtureMapping";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import type { MarketSelection } from "@/types/match";
import type { RecommendationCandidate } from "@/lib/recommendation/recommendationTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const MINIMAL_SNAPSHOT = {
  features: [],
  interpretations: [],
  marketAnalysis: { status: "notImplemented", reason: "test" },
  combinedAnalysis: { status: "notImplemented", reason: "test" },
  candidates: [],
  recommendation: null,
  replay: null,
  bettingIntelligence: null,
  decision: null,
  capturedAt: "2026-07-19T10:00:00.000Z",
} as AnalysisSnapshot;

function buildPending(
  overrides: Partial<HistoricalMatchRecord> = {}
): HistoricalMatchRecord {
  return {
    id: overrides.id ?? "pending-1",
    date: overrides.matchDate ?? "2026-07-19",
    matchDate: overrides.matchDate ?? "2026-07-19",
    league: "Test League",
    homeTeam: overrides.homeTeam ?? "Arsenal",
    awayTeam: overrides.awayTeam ?? "Chelsea",
    rawOdds: "sample odds",
    marketSelections: [],
    result: null,
    analysisSnapshot: MINIMAL_SNAPSHOT,
    candidates: [],
    status: "PENDING",
    verificationResult: null,
    fixtureId: overrides.fixtureId ?? 123,
    leagueId: 39,
    season: 2026,
    homeTeamId: 1,
    awayTeamId: 2,
    source: "app",
    createdAt: "2026-07-19T10:00:00.000Z",
    updatedAt: "2026-07-19T10:00:00.000Z",
    ...overrides,
  };
}

function buildApiFixture(
  overrides: Partial<ApiFootballFixtureRecord> = {}
): ApiFootballFixtureRecord {
  return {
    fixtureId: 123,
    date: "2026-07-19",
    kickoffTime: "2026-07-19T12:00:00.000Z",
    league: "Premier League",
    leagueId: 39,
    season: 2026,
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    homeTeamId: 1,
    awayTeamId: 2,
    status: "FT",
    homeGoals: 2,
    awayGoals: 1,
    halfTimeHome: 1,
    halfTimeAway: 0,
    venue: null,
    neutralVenue: false,
    ...overrides,
  };
}

function buildFinishedOnly(apiFixture: ApiFootballFixtureRecord) {
  return intakeApiFixtures([apiFixture]).fixtures[0]!;
}

function testFixtureIdMatch(): void {
  const pending = [
    buildPending({
      id: "by-id",
      fixtureId: 999,
      homeTeam: "Stored Home",
      awayTeam: "Stored Away",
    }),
  ];
  const outcome = buildResultUpdatesFromFixturesWithDiagnostics(pending, [
    {
      fixtureId: 999,
      homeTeam: "API Home",
      awayTeam: "API Away",
      matchDate: "2026-07-19",
      fullTimeHomeGoals: 2,
      fullTimeAwayGoals: 0,
      halfTimeHomeGoals: 1,
      halfTimeAwayGoals: 0,
    },
  ]);

  assert(outcome.updates.length === 1, "fixtureId match should build one update");
  assert(outcome.updates[0]?.matchId === "by-id", "fixtureId match should bind pending record");
  assert(outcome.diagnostics.matchedByFixtureId === 1, "should count fixtureId match");
}

function testFixtureIdOverridesTeamNameMismatch(): void {
  const outcome = buildResultUpdatesFromFixturesWithDiagnostics(
    [buildPending({ fixtureId: 555, homeTeam: "Alpha FC", awayTeam: "Beta FC" })],
    [
      {
        fixtureId: 555,
        homeTeam: "Totally Different",
        awayTeam: "Also Different",
        matchDate: "2026-07-19",
        fullTimeHomeGoals: 3,
        fullTimeAwayGoals: 2,
        halfTimeHomeGoals: null,
        halfTimeAwayGoals: null,
      },
    ]
  );

  assert(outcome.updates.length === 1, "fixtureId should match despite team name mismatch");
  assert(outcome.diagnostics.matchedByFixtureId === 1, "fixtureId path should be used");
}

function testFallbackNormalization(): void {
  const outcome = buildResultUpdatesFromFixturesWithDiagnostics(
    [
      buildPending({
        fixtureId: null,
        homeTeam: "  Real  Madrid ",
        awayTeam: "Barcelona.",
        matchDate: "2026-07-19T00:00:00.000Z",
      }),
    ],
    [
      {
        fixtureId: null,
        homeTeam: "real madrid",
        awayTeam: "barcelona",
        matchDate: "2026-07-19",
        fullTimeHomeGoals: 1,
        fullTimeAwayGoals: 1,
        halfTimeHomeGoals: 0,
        halfTimeAwayGoals: 1,
      },
    ]
  );

  assert(outcome.updates.length === 1, "normalized fallback should match");
  assert(outcome.diagnostics.matchedByFallback === 1, "fallback match should be counted");
  assert(
    normalizeResultUpdateMatchDate("2026-07-19T00:00:00.000Z") === "2026-07-19",
    "date normalization should keep YYYY-MM-DD"
  );
  assert(
    normalizeResultUpdateTeamName("  Real  Madrid ") === "real madrid",
    "team normalization should trim and lowercase"
  );
}

function testNullHalfTimeStillBuildsUpdate(): void {
  const apiFixture = buildApiFixture({
    halfTimeHome: null,
    halfTimeAway: null,
    homeGoals: 2,
    awayGoals: 2,
  });
  const finishedOnly = buildFinishedOnly(apiFixture);
  const attachOutcome = attachScoresToFinishedFixtures([finishedOnly], [apiFixture]);

  assert(attachOutcome.fixtures.length === 1, "missing half time should not drop fixture");
  assert(attachOutcome.missingHalfTimeScoreCount === 1, "should count missing half time");
  assert(attachOutcome.fixtures[0]?.halfTimeHomeGoals === null, "half time should remain null");
  assert(attachOutcome.fixtures[0]?.halfTimeAwayGoals === null, "half time should remain null");

  const buildOutcome = buildResultUpdatesFromFinishedFixturesWithDiagnostics(
    [buildPending({ fixtureId: 123 })],
    attachOutcome.fixtures
  );
  assert(buildOutcome.updates.length === 1, "null half time should still build update");
  assert(
    buildOutcome.updates[0]?.halfTimeHomeGoals === null &&
      buildOutcome.updates[0]?.halfTimeAwayGoals === null,
    "update should preserve null half time"
  );
}

function testFullTimeMarketsSettleWithNullHalfTime(): void {
  const result = buildMatchResult({
    fullTimeHomeGoals: 2,
    fullTimeAwayGoals: 1,
    halfTimeHomeGoals: null,
    halfTimeAwayGoals: null,
  });

  const fullTimeMarkets: MarketSelection[] = [
    {
      marketType: "moneyline",
      marketFamily: "moneyline",
      title: "Moneyline",
      period: "full",
      side: "home",
      line: null,
      rawLine: null,
      modifier: null,
      odds: 1.9,
      impliedProbability: 0.526,
    },
    {
      marketType: "handicap",
      marketFamily: "asianHandicap",
      title: "Handicap",
      period: "full",
      side: "home",
      line: -0.5,
      rawLine: "-0.5",
      modifier: "half",
      handicap: -0.5,
      odds: 1.9,
      impliedProbability: 0.526,
    },
    {
      marketType: "totalGoals",
      marketFamily: "asianOverUnder",
      title: "Total Goals",
      period: "full",
      side: "over",
      line: 2.5,
      rawLine: "2.5",
      modifier: "plain",
      odds: 1.9,
      impliedProbability: 0.526,
    },
    {
      marketType: "btts",
      marketFamily: "btts",
      title: "BTTS",
      period: "full",
      side: "yes",
      line: null,
      rawLine: null,
      modifier: null,
      odds: 1.9,
      impliedProbability: 0.526,
    },
  ];

  for (const selection of fullTimeMarkets) {
    assert(canSettleMarketSelection(selection, result), `${selection.marketType} should settle`);
    assert(settleBet(selection, result) !== undefined, `${selection.marketType} should return result`);
  }

  const halfMarket: MarketSelection = {
    marketType: "totalGoals",
    marketFamily: "asianOverUnder",
    title: "Half Total Goals",
    period: "half",
    side: "over",
    line: 0.5,
    rawLine: "0.5",
    modifier: "plain",
    odds: 1.9,
    impliedProbability: 0.526,
  };
  assert(!canSettleMarketSelection(halfMarket, result), "half market should be skipped without HT scores");

  const candidate: RecommendationCandidate = {
    marketType: "moneyline",
    confidence: "medium",
    expectedValue: 0.1,
    score: 0.8,
    marketScore: 0.8,
    evidenceScore: 0.7,
    reasons: [],
    warnings: [],
    supportingFeatures: [],
    selection: fullTimeMarkets[0]!,
  };
  const evaluation = evaluateRecommendationCandidate(candidate, result);
  assert(evaluation.hit === true, "full-time moneyline should verify with null half time");
}

function testNoFalsePositiveMatch(): void {
  const outcome = buildResultUpdatesFromFixturesWithDiagnostics(
    [buildPending({ fixtureId: 100, homeTeam: "Team A", awayTeam: "Team B" })],
    [
      {
        fixtureId: 200,
        homeTeam: "Team X",
        awayTeam: "Team Y",
        matchDate: "2026-07-19",
        fullTimeHomeGoals: 1,
        fullTimeAwayGoals: 0,
        halfTimeHomeGoals: 0,
        halfTimeAwayGoals: 0,
      },
    ]
  );

  assert(outcome.updates.length === 0, "unrelated fixture should not match");
  assert(outcome.diagnostics.matchedByFixtureId === 0, "fixtureId mismatch should not match");
  assert(outcome.diagnostics.matchedByFallback === 0, "unrelated teams should not fallback match");
}

function testFinishedStatusesAetPen(): void {
  for (const status of ["FT", "AET", "PEN"] as const) {
    const apiFixture = buildApiFixture({
      fixtureId: status === "FT" ? 123 : status === "AET" ? 124 : 125,
      status,
      homeGoals: 2,
      awayGoals: 1,
      halfTimeHome: null,
      halfTimeAway: null,
    });
    const finishedOnly = intakeApiFixtures([apiFixture]).fixtures;
    assert(finishedOnly.length === 1, `${status} should pass finished intake`);
    const attachOutcome = attachScoresToFinishedFixtures(finishedOnly, [apiFixture]);
    assert(attachOutcome.fixtures.length === 1, `${status} should attach full-time scores`);
  }
}

function runTests(): void {
  testFixtureIdMatch();
  testFixtureIdOverridesTeamNameMismatch();
  testFallbackNormalization();
  testNullHalfTimeStillBuildsUpdate();
  testFullTimeMarketsSettleWithNullHalfTime();
  testNoFalsePositiveMatch();
  testFinishedStatusesAetPen();
  console.log("resultUpdatePipeline.test.ts passed");
}

runTests();
