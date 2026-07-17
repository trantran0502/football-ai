import { buildMatchResult } from "@/lib/database/matchSchema";
import { validateDataLeakage, validateSnapshotLeakage } from "@/lib/fundamentalsBacktest/dataLeakageValidator";
import {
  isMarketLearningAllowed,
  runFundamentalsBacktest,
} from "@/lib/fundamentalsBacktest/fundamentalsBacktestEngine";
import { clearFundamentalsDatasetForTests } from "@/lib/fundamentalsBacktest/fundamentalsDatasetStore";
import { buildPreMatchSnapshot } from "@/lib/fundamentalsBacktest/preMatchSnapshotBuilder";
import type {
  HistoricalFixtureInput,
  HistoricalMatchOutcomeInput,
} from "@/lib/fundamentalsBacktest/fundamentalsBacktestTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const FIXTURE_DATE = "2026-03-15T15:00:00.000Z";

function buildFixture(overrides: Partial<HistoricalFixtureInput> = {}): HistoricalFixtureInput {
  return {
    fixtureId: 1001,
    fixtureDate: FIXTURE_DATE,
    leagueId: 39,
    leagueName: "Premier League",
    season: 2025,
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    homeTeamId: 1,
    awayTeamId: 2,
    ...overrides,
  };
}

function buildOutcome(
  overrides: Partial<HistoricalMatchOutcomeInput> & Pick<HistoricalMatchOutcomeInput, "fixtureId" | "matchDate">
): HistoricalMatchOutcomeInput {
  return {
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    homeTeamId: 1,
    awayTeamId: 2,
    homeGoals: 2,
    awayGoals: 1,
    xGHome: 1.8,
    xGAway: 1.1,
    ...overrides,
  };
}

function testPreFixtureDataAllowed(): void {
  const outcomes = [
    buildOutcome({ fixtureId: 900, matchDate: "2026-03-01T15:00:00.000Z", homeGoals: 1, awayGoals: 0 }),
    buildOutcome({ fixtureId: 901, matchDate: "2026-03-08T15:00:00.000Z", homeGoals: 2, awayGoals: 2 }),
  ];
  const snapshot = buildPreMatchSnapshot({
    fixture: buildFixture(),
    matchOutcomes: outcomes,
    sourceTimestamp: "2026-03-14T12:00:00.000Z",
  });
  const validation = validateSnapshotLeakage(snapshot);
  assert(validation.validationStatus === "VALID", "pre-fixture data should be valid");
  assert(snapshot.recent10BeforeMatch.home.played === 2, "recent form should include prior matches");
}

function testPostFixtureDataRejected(): void {
  const validation = validateDataLeakage({
    sourceTimestamp: "2026-03-16T10:00:00.000Z",
    fixtureDate: FIXTURE_DATE,
    latestIncludedMatchDate: null,
    standingsSnapshotDate: null,
    squadSnapshotDate: null,
    contextSnapshotDate: null,
  });
  assert(validation.validationStatus === "INVALID", "post-fixture source should be invalid");
  assert(validation.leakageFields.includes("sourceTimestamp"), "sourceTimestamp leakage expected");
}

function testSameDayAfterKickoffRejected(): void {
  const validation = validateDataLeakage({
    sourceTimestamp: "2026-03-15T16:00:00.000Z",
    fixtureDate: FIXTURE_DATE,
    latestIncludedMatchDate: null,
    standingsSnapshotDate: null,
    squadSnapshotDate: null,
    contextSnapshotDate: null,
  });
  assert(validation.validationStatus === "INVALID", "same-day after kickoff should be invalid");
}

function testFinalSeasonRankingRejected(): void {
  const snapshot = buildPreMatchSnapshot({
    fixture: buildFixture(),
    matchOutcomes: [],
    standings: [
      {
        teamId: 1,
        teamName: "Arsenal",
        position: 1,
        points: 80,
        played: 30,
        snapshotDate: "2026-03-10T00:00:00.000Z",
        isFinalSeasonRanking: true,
      },
    ],
    sourceTimestamp: "2026-03-14T00:00:00.000Z",
  });
  const validation = validateSnapshotLeakage(snapshot);
  assert(validation.validationStatus === "INVALID", "final season ranking should invalidate snapshot");
}

function testFutureMatchesExcludedFromRecentForm(): void {
  const outcomes = [
    buildOutcome({ fixtureId: 902, matchDate: "2026-03-20T15:00:00.000Z", homeGoals: 3, awayGoals: 0 }),
    buildOutcome({ fixtureId: 903, matchDate: "2026-03-01T15:00:00.000Z", homeGoals: 1, awayGoals: 1 }),
  ];
  const snapshot = buildPreMatchSnapshot({
    fixture: buildFixture(),
    matchOutcomes: outcomes,
    sourceTimestamp: "2026-03-14T00:00:00.000Z",
  });
  assert(snapshot.recent10BeforeMatch.home.played === 1, "future matches must not enter recent form");
}

function testH2HUsesPastOnly(): void {
  const outcomes = [
    buildOutcome({ fixtureId: 904, matchDate: "2026-02-01T15:00:00.000Z", homeGoals: 2, awayGoals: 0 }),
    buildOutcome({ fixtureId: 905, matchDate: "2026-03-20T15:00:00.000Z", homeGoals: 0, awayGoals: 3 }),
  ];
  const snapshot = buildPreMatchSnapshot({
    fixture: buildFixture(),
    matchOutcomes: outcomes,
    sourceTimestamp: "2026-03-14T00:00:00.000Z",
  });
  assert(snapshot.h2hBeforeMatch?.homeWins === 1, "H2H should only count past meetings");
}

function testMissingXgFallback(): void {
  const outcomes = [
    buildOutcome({
      fixtureId: 906,
      matchDate: "2026-03-01T15:00:00.000Z",
      xGHome: null,
      xGAway: null,
    }),
  ];
  const snapshot = buildPreMatchSnapshot({
    fixture: buildFixture(),
    matchOutcomes: outcomes,
    sourceTimestamp: "2026-03-14T00:00:00.000Z",
  });
  assert(snapshot.xGBeforeMatch.home === null, "missing xG should remain null");
}

function testMissingStandingsFallback(): void {
  const snapshot = buildPreMatchSnapshot({
    fixture: buildFixture(),
    matchOutcomes: [],
    sourceTimestamp: "2026-03-14T00:00:00.000Z",
  });
  assert(snapshot.standingsBeforeMatch.length === 0, "missing standings should fallback to empty");
}

function testInvalidSnapshotExcludedFromStats(): void {
  clearFundamentalsDatasetForTests();
  const report = runFundamentalsBacktest(
    {
      fixtures: [buildFixture()],
      matchOutcomes: [
        buildOutcome({ fixtureId: 1001, matchDate: FIXTURE_DATE, homeGoals: 2, awayGoals: 1 }),
      ],
      squadAvailability: [
        {
          fixtureId: 1001,
          homeAvailable: 10,
          awayAvailable: 10,
          homeUnavailable: 1,
          awayUnavailable: 1,
          snapshotDate: "2026-03-16T10:00:00.000Z",
        },
      ],
    },
    { persistDataset: true }
  );
  assert(report.invalidSnapshots === 1, "invalid snapshot should be excluded");
  assert(report.validSnapshots === 0, "invalid snapshot must not enter valid stats");
}

function testHistoricalFundamentalsDoesNotComputeRoi(): void {
  clearFundamentalsDatasetForTests();
  const report = runFundamentalsBacktest(
    {
      fixtures: [buildFixture()],
      matchOutcomes: [
        buildOutcome({ fixtureId: 1001, matchDate: FIXTURE_DATE, homeGoals: 2, awayGoals: 1 }),
        buildOutcome({ fixtureId: 900, matchDate: "2026-03-01T15:00:00.000Z", homeGoals: 1, awayGoals: 0 }),
      ],
    },
    { persistDataset: true }
  );
  assert(!("roi" in report), "fundamentals report must not expose ROI");
  assert(!("profit" in report), "fundamentals report must not expose profit");
  assert(report.dataMode === "historical_fundamentals", "default mode should be historical fundamentals");
}

function testDataModeSeparation(): void {
  assert(isMarketLearningAllowed("historical_fundamentals") === false, "historical fundamentals cannot enter market learning");
  assert(isMarketLearningAllowed("live_market_snapshot") === true, "live market snapshot can enter market learning");
}

function testValidBacktestProducesMetrics(): void {
  clearFundamentalsDatasetForTests();
  const report = runFundamentalsBacktest(
    {
      fixtures: [buildFixture()],
      matchOutcomes: [
        buildOutcome({ fixtureId: 1001, matchDate: FIXTURE_DATE, homeGoals: 2, awayGoals: 1 }),
        buildOutcome({ fixtureId: 900, matchDate: "2026-03-01T15:00:00.000Z", homeGoals: 2, awayGoals: 0 }),
        buildOutcome({ fixtureId: 901, matchDate: "2026-02-15T15:00:00.000Z", homeGoals: 1, awayGoals: 1 }),
      ],
      standings: [
        {
          teamId: 1,
          teamName: "Arsenal",
          position: 2,
          points: 60,
          played: 27,
          snapshotDate: "2026-03-10T00:00:00.000Z",
        },
      ],
    },
    { persistDataset: true }
  );

  assert(report.validSnapshots === 1, "valid snapshot should be counted");
  assert(report.sampleSize === 1, "sample size should reflect valid snapshots");
  assert(report.evidenceProviderRanking.length > 0, "evidence provider ranking should be populated");
  assert(
    report.datasetEntries[0]!.actualResult.winner === "home",
    "actual result should be attached"
  );
  assert(
    buildMatchResult({
      fullTimeHomeGoals: 2,
      fullTimeAwayGoals: 1,
      halfTimeHomeGoals: 1,
      halfTimeAwayGoals: 0,
    }).bothTeamsScored === true,
    "match result helper sanity check"
  );
}

export function runFundamentalsBacktestTests(): void {
  testPreFixtureDataAllowed();
  testPostFixtureDataRejected();
  testSameDayAfterKickoffRejected();
  testFinalSeasonRankingRejected();
  testFutureMatchesExcludedFromRecentForm();
  testH2HUsesPastOnly();
  testMissingXgFallback();
  testMissingStandingsFallback();
  testInvalidSnapshotExcludedFromStats();
  testHistoricalFundamentalsDoesNotComputeRoi();
  testDataModeSeparation();
  testValidBacktestProducesMetrics();
  console.log("Historical fundamentals backtest tests passed.");
}

runFundamentalsBacktestTests();
