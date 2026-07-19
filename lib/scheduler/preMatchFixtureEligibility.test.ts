import type { SchedulerFixtureSource } from "@/lib/scheduler/schedulerTypes";
import {
  classifyPreMatchFixtureEligibility,
  filterPreMatchEligibleFixtures,
  isPreMatchEligibleFixture,
  PRE_MATCH_KICKOFF_BUFFER_MS,
} from "@/lib/scheduler/preMatchFixtureEligibility";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function buildFixture(
  overrides: Partial<SchedulerFixtureSource> & Pick<SchedulerFixtureSource, "fixtureId">
): SchedulerFixtureSource {
  return {
    fixtureId: overrides.fixtureId,
    matchDate: overrides.matchDate ?? "2026-07-19",
    league: overrides.league ?? "Premier League",
    leagueName: overrides.leagueName ?? "Premier League",
    leagueId: overrides.leagueId ?? 39,
    season: overrides.season ?? 2026,
    kickoffTime: overrides.kickoffTime ?? "2026-07-19T15:00:00.000Z",
    homeTeam: overrides.homeTeam ?? "Home FC",
    awayTeam: overrides.awayTeam ?? "Away FC",
    homeTeamId: overrides.homeTeamId ?? 1,
    awayTeamId: overrides.awayTeamId ?? 2,
    status: overrides.status ?? "NS",
  };
}

function testFutureTwoHoursEligible(): void {
  const now = new Date("2026-07-19T12:05:00.000Z");
  const fixture = buildFixture({
    fixtureId: 1,
    kickoffTime: "2026-07-19T14:05:00.000Z",
    status: "NS",
  });

  assert(
    isPreMatchEligibleFixture(fixture, now),
    "future NS fixture two hours ahead should be eligible"
  );
}

function testFutureTenMinutesIneligible(): void {
  const now = new Date("2026-07-19T12:05:00.000Z");
  const fixture = buildFixture({
    fixtureId: 2,
    kickoffTime: "2026-07-19T12:15:00.000Z",
    status: "NS",
  });

  assert(
    classifyPreMatchFixtureEligibility(fixture, now) === "kickoff_too_soon",
    "fixture within 15 minute buffer should be rejected"
  );
}

function testPastKickoffStillNsIneligible(): void {
  const now = new Date("2026-07-19T12:05:00.000Z");
  const fixture = buildFixture({
    fixtureId: 3,
    kickoffTime: "2026-07-19T07:30:00.000Z",
    status: "NS",
  });

  assert(
    classifyPreMatchFixtureEligibility(fixture, now) === "past_kickoff",
    "past kickoff with NS status should be rejected"
  );
}

function testTerminalStatusesIneligible(): void {
  const now = new Date("2026-07-19T12:05:00.000Z");
  for (const status of ["FT", "AET", "PEN"] as const) {
    const fixture = buildFixture({
      fixtureId: 10,
      kickoffTime: "2026-07-19T20:00:00.000Z",
      status,
    });
    assert(
      classifyPreMatchFixtureEligibility(fixture, now) === "terminal_status",
      `${status} should be terminal and ineligible`
    );
  }
}

function testStartedStatusesIneligible(): void {
  const now = new Date("2026-07-19T12:05:00.000Z");
  for (const status of ["1H", "HT", "2H"] as const) {
    const fixture = buildFixture({
      fixtureId: 11,
      kickoffTime: "2026-07-19T20:00:00.000Z",
      status,
    });
    assert(
      classifyPreMatchFixtureEligibility(fixture, now) === "started_status",
      `${status} should be treated as started and ineligible`
    );
  }
}

function testUtcCrossDayComparison(): void {
  const now = new Date("2026-07-19T23:50:00.000Z");
  const fixture = buildFixture({
    fixtureId: 4,
    matchDate: "2026-07-19",
    kickoffTime: "2026-07-20T00:10:00.000Z",
    status: "NS",
  });

  assert(
    isPreMatchEligibleFixture(fixture, now),
    "cross-day UTC kickoff should compare full ISO timestamp, not matchDate"
  );
}

function testFilterStatsObservability(): void {
  const now = new Date("2026-07-19T12:05:00.000Z");
  const { eligible, stats } = filterPreMatchEligibleFixtures(
    [
      buildFixture({ fixtureId: 1, kickoffTime: "2026-07-19T15:00:00.000Z", status: "NS" }),
      buildFixture({ fixtureId: 2, kickoffTime: "2026-07-19T12:10:00.000Z", status: "NS" }),
      buildFixture({ fixtureId: 3, kickoffTime: "2026-07-19T05:00:00.000Z", status: "NS" }),
      buildFixture({ fixtureId: 4, kickoffTime: "2026-07-19T20:00:00.000Z", status: "FT" }),
      buildFixture({ fixtureId: 5, kickoffTime: "2026-07-19T20:00:00.000Z", status: "1H" }),
    ],
    now,
    PRE_MATCH_KICKOFF_BUFFER_MS
  );

  assert(eligible.length === 1, "only one fixture should remain eligible");
  assert(stats.eligibleUpcomingCount === 1, "eligibleUpcomingCount should be 1");
  assert(stats.pastKickoffSkipped === 2, "past and too-soon kickoffs should count as pastKickoffSkipped");
  assert(stats.terminalStatusSkipped === 1, "terminal status should increment terminalStatusSkipped");
  assert(stats.startedFixtureSkipped === 1, "started status should increment startedFixtureSkipped");
}

function runTests(): void {
  testFutureTwoHoursEligible();
  testFutureTenMinutesIneligible();
  testPastKickoffStillNsIneligible();
  testTerminalStatusesIneligible();
  testStartedStatusesIneligible();
  testUtcCrossDayComparison();
  testFilterStatsObservability();
  console.log("preMatchFixtureEligibility.test.ts passed");
}

runTests();
