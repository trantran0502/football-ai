import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { runFundamentalsBacktest } from "@/lib/fundamentalsBacktest/fundamentalsBacktestEngine";
import type {
  FundamentalsBacktestReport,
  HistoricalFixtureInput,
  HistoricalMatchOutcomeInput,
} from "@/lib/fundamentalsBacktest/fundamentalsBacktestTypes";

function toOutcome(record: HistoricalMatchRecord): HistoricalMatchOutcomeInput | null {
  if (!record.result || record.fixtureId === null || record.fixtureId === undefined) {
    return null;
  }

  return {
    fixtureId: record.fixtureId,
    matchDate: record.matchDate,
    homeTeam: record.homeTeam,
    awayTeam: record.awayTeam,
    homeTeamId: record.homeTeamId ?? undefined,
    awayTeamId: record.awayTeamId ?? undefined,
    homeGoals: record.result.fullTimeHomeGoals,
    awayGoals: record.result.fullTimeAwayGoals,
  };
}

function toFixture(record: HistoricalMatchRecord): HistoricalFixtureInput | null {
  if (record.fixtureId === null || record.fixtureId === undefined) {
    return null;
  }

  return {
    fixtureId: record.fixtureId,
    fixtureDate: record.matchDate,
    leagueId: record.leagueId ?? 0,
    leagueName: record.league,
    season: record.season ?? 0,
    homeTeam: record.homeTeam,
    awayTeam: record.awayTeam,
    homeTeamId: record.homeTeamId ?? undefined,
    awayTeamId: record.awayTeamId ?? undefined,
  };
}

export function buildHistoricalFundamentalsBacktestFromRecords(
  records: HistoricalMatchRecord[]
): FundamentalsBacktestReport {
  const verified = records.filter((record) => record.status === "VERIFIED" && record.result);

  const matchOutcomes = verified
    .map((record) => toOutcome(record))
    .filter((entry): entry is HistoricalMatchOutcomeInput => entry !== null);

  const fixtures = verified
    .map((record) => toFixture(record))
    .filter((entry): entry is HistoricalFixtureInput => entry !== null);

  const storedMarketSnapshots = verified
    .filter((record) => record.marketSelections.length > 0 && record.fixtureId !== null && record.fixtureId !== undefined)
    .map((record) => ({
      fixtureId: record.fixtureId!,
      marketSelections: record.marketSelections,
    }));

  if (fixtures.length === 0) {
    return runFundamentalsBacktest({ fixtures: [], matchOutcomes: [] }, { persistDataset: false });
  }

  return runFundamentalsBacktest(
    {
      fixtures,
      matchOutcomes,
      storedMarketSnapshots,
    },
    { persistDataset: true }
  );
}
