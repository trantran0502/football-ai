import {
  enableHistoricalBackfillCursorStoreForTests,
  disableHistoricalBackfillCursorStoreForTests,
  resetHistoricalBackfillCursorStoreForTests,
  enableExecutionLogPersistStoreForTests,
  disableExecutionLogPersistStoreForTests,
  resetExecutionLogsForTests,
  resetPersistedExecutionLogsForTests,
  resetSchedulerLocksForTests,
  runHistoricalMatchBackfillScheduler,
  listExecutionLogs,
  isEligibleHistoricalBackfillFixture,
  createInitialHistoricalBackfillCursor,
  getHistoricalBackfillConfig,
  defaultHistoricalBackfillStartDate,
} from "@/lib/scheduler";
import { parseApiFootballPlanDateRestriction } from "@/lib/scheduler/historicalBackfillPlanErrors";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import {
  buildHistoricalBackfillRecord,
  type HistoricalBackfillDuplicateCheck,
} from "@/lib/supabase/services/historicalBackfillService";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const MATCH_DATE = "2026-07-10";

function buildFixture(
  overrides: Partial<ApiFootballFixtureRecord> & Pick<ApiFootballFixtureRecord, "fixtureId">
): ApiFootballFixtureRecord {
  return {
    fixtureId: overrides.fixtureId,
    date: overrides.date ?? MATCH_DATE,
    kickoffTime: `${overrides.date ?? MATCH_DATE}T15:00:00.000Z`,
    league: overrides.league ?? "Premier League",
    leagueId: overrides.leagueId ?? 39,
    season: overrides.season ?? 2025,
    homeTeam: overrides.homeTeam ?? "Arsenal",
    awayTeam: overrides.awayTeam ?? "Chelsea",
    homeTeamId: overrides.homeTeamId ?? 42,
    awayTeamId: overrides.awayTeamId ?? 49,
    status: overrides.status ?? "FT",
    homeGoals: overrides.homeGoals ?? 2,
    awayGoals: overrides.awayGoals ?? 1,
    halfTimeHome: overrides.halfTimeHome ?? 1,
    halfTimeAway: overrides.halfTimeAway ?? 0,
    venue: overrides.venue ?? "Emirates Stadium",
    neutralVenue: overrides.neutralVenue ?? false,
  };
}

async function runTests(): Promise<void> {
  const parsed = parseApiFootballPlanDateRestriction(
    new Error(
      'API-Football error: {"plan":"Free plans do not have access to this date, try from 2026-07-15 to 2026-07-17."}'
    )
  );
  assert(parsed?.minDate === "2026-07-15", "plan date parser should read min date");
  assert(parsed?.maxDate === "2026-07-17", "plan date parser should read max date");

  delete process.env.HISTORICAL_BACKFILL_MIN_DATE;
  delete process.env.HISTORICAL_BACKFILL_START_DATE;
  const config = getHistoricalBackfillConfig(new Date("2026-07-16T12:00:00.000Z"));
  assert(
    config.minDate === "2026-07-13",
    "default min date should be yesterday minus free-plan lookback"
  );
  assert(
    defaultHistoricalBackfillStartDate(new Date("2026-07-16T12:00:00.000Z")) ===
      "2026-07-15",
    "default start date should be yesterday"
  );

  process.env.HISTORICAL_BACKFILL_MAX_PER_RUN = "100";
  process.env.HISTORICAL_BACKFILL_START_DATE = MATCH_DATE;
  process.env.HISTORICAL_BACKFILL_MIN_DATE = "2026-07-08";

  enableHistoricalBackfillCursorStoreForTests();
  enableExecutionLogPersistStoreForTests();
  resetExecutionLogsForTests();
  resetPersistedExecutionLogsForTests();
  resetSchedulerLocksForTests();
  resetHistoricalBackfillCursorStoreForTests();

  const friendly = buildFixture({
    fixtureId: 1001,
    league: "Club Friendly",
    status: "FT",
  });
  assert(!isEligibleHistoricalBackfillFixture(friendly), "friendly should be skipped");

  const cancelled = buildFixture({ fixtureId: 1002, status: "CANC" });
  assert(!isEligibleHistoricalBackfillFixture(cancelled), "cancelled should be skipped");

  const incomplete = buildFixture({
    fixtureId: 1003,
    halfTimeHome: undefined,
    halfTimeAway: undefined,
  });
  incomplete.halfTimeHome = null;
  incomplete.halfTimeAway = null;
  assert(!isEligibleHistoricalBackfillFixture(incomplete), "incomplete score should be skipped");

  const formal = buildFixture({ fixtureId: 2001 });
  assert(isEligibleHistoricalBackfillFixture(formal), "formal FT fixture should pass");

  const insertedRecords: HistoricalMatchRecord[] = [];
  const duplicateCheck: HistoricalBackfillDuplicateCheck = {
    existingFixtureIds: new Set<number>(),
    existingMatchKeys: new Set<string>(),
  };

  const fixturesByDate = new Map<string, ApiFootballFixtureRecord[]>([
    [
      MATCH_DATE,
      [
        buildFixture({ fixtureId: 2001 }),
        buildFixture({
          fixtureId: 2002,
          homeTeam: "Liverpool",
          awayTeam: "Tottenham",
          homeTeamId: 40,
          awayTeamId: 47,
        }),
        buildFixture({ fixtureId: 2001 }),
        friendly,
      ],
    ],
    [
      "2026-07-09",
      [
        buildFixture({
          fixtureId: 2003,
          date: "2026-07-09",
          homeTeam: "Manchester City",
          awayTeam: "Newcastle",
          homeTeamId: 50,
          awayTeamId: 34,
        }),
      ],
    ],
  ]);

  const result = await runHistoricalMatchBackfillScheduler({
    fetchFixturesByDate: async (date) => fixturesByDate.get(date) ?? [],
    loadCursor: async () =>
      createInitialHistoricalBackfillCursor({
        startDate: MATCH_DATE,
        minDate: "2026-07-08",
      }),
    saveCursor: async () => {},
    loadDuplicateCheck: async (fixtureIds) => {
      const check = {
        existingFixtureIds: new Set(duplicateCheck.existingFixtureIds),
        existingMatchKeys: new Set(duplicateCheck.existingMatchKeys),
      };
      for (const fixtureId of fixtureIds) {
        if (duplicateCheck.existingFixtureIds.has(fixtureId)) {
          check.existingFixtureIds.add(fixtureId);
        }
      }
      return check;
    },
    insertRecord: async (record) => {
      insertedRecords.push(record);
      if (record.fixtureId) {
        duplicateCheck.existingFixtureIds.add(record.fixtureId);
      }
      return record;
    },
    loadMatchKeysForDate: async () => new Set<string>(),
  });

  assert(result.stats.inserted === 3, "should insert three unique formal fixtures");
  assert(result.stats.duplicates >= 1, "duplicate fixture id should be counted");
  assert(result.stats.fetched >= 3, "eligible fetched fixtures should be counted");
  assert(
    insertedRecords.every((record) => record.status === "VERIFIED"),
    "backfill records should be VERIFIED"
  );
  assert(
    insertedRecords.every((record) => record.analysisSnapshot === null),
    "backfill records should not create analysis snapshots"
  );
  assert(
    insertedRecords.every((record) => record.verificationResult === null),
    "backfill records should not create verification results"
  );
  assert(
    insertedRecords.every((record) => record.fixtureId !== null && record.fixtureId !== undefined),
    "backfill records should store fixture id"
  );

  const built = buildHistoricalBackfillRecord({ fixture: formal });
  assert(built.result?.fullTimeHomeGoals === 2, "full time score should be stored in result");
  assert(built.result?.halfTimeHomeGoals === 1, "half time score should be stored in result");
  assert(built.leagueId === 39, "league id should be stored");
  assert(built.season === 2025, "season should be stored");

  const logs = listExecutionLogs();
  const latest = logs.find((entry) => entry.jobName === "historical_match_backfill");
  assert(Boolean(latest), "execution log should be recorded");
  assert(latest?.context?.inserted === 3, "execution log should record inserted count");
  assert(typeof latest?.context?.durationMs === "number", "execution log should record duration");

  resetExecutionLogsForTests();
  resetSchedulerLocksForTests();

  const planRestricted = await runHistoricalMatchBackfillScheduler({
    fetchFixturesByDate: async (date) => {
      if (date === "2026-07-10") {
        throw new Error(
          'API-Football error: {"plan":"Free plans do not have access to this date, try from 2026-07-15 to 2026-07-17."}'
        );
      }
      if (date === "2026-07-15") {
        return [buildFixture({ fixtureId: 3001, date: "2026-07-15" })];
      }
      return [];
    },
    loadCursor: async () =>
      createInitialHistoricalBackfillCursor({
        startDate: "2026-07-10",
        minDate: "2026-07-08",
      }),
    saveCursor: async () => {},
    loadDuplicateCheck: async () => ({
      existingFixtureIds: new Set<number>(),
      existingMatchKeys: new Set<string>(),
    }),
    insertRecord: async (record) => record,
    loadMatchKeysForDate: async () => new Set<string>(),
  });

  assert(
    planRestricted.executionStatus === "partial_success",
    "plan date restriction should mark partial_success"
  );
  assert(
    planRestricted.stats.inserted === 1,
    "plan date restriction should continue on allowed date"
  );
  assert(
    planRestricted.cursor?.currentDate === "2026-07-15" ||
      planRestricted.cursor?.planMinDate === "2026-07-15",
    "cursor should move to first allowed plan date"
  );
  const partialLog = listExecutionLogs().find(
    (entry) => entry.jobName === "historical_match_backfill"
  );
  assert(
    partialLog?.context?.status === "partial_success",
    "execution log should record partial_success"
  );

  disableHistoricalBackfillCursorStoreForTests();
  disableExecutionLogPersistStoreForTests();

  console.log("test:historical-match-backfill passed");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
