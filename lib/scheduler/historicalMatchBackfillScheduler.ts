import { logAdminError } from "@/lib/admin/adminErrorLog";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import { getApiFootballQuotaSnapshot } from "@/lib/providers/apiFootball/apiFootballQuota";
import { getApiFootballClient } from "@/lib/providers/apiFootball/apiFootballClient";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  buildExecutionLogContext,
  completeExecutionLog,
  startExecutionLog,
} from "@/lib/scheduler/executionLogStore";
import {
  compareDateKeys,
  createInitialHistoricalBackfillCursor,
  loadHistoricalBackfillCursor,
  previousDateKey,
  saveHistoricalBackfillCursor,
  type HistoricalBackfillCursor,
} from "@/lib/scheduler/historicalBackfillCursorStore";
import {
  getHistoricalBackfillConfig,
  resolveHistoricalBackfillStartDate,
} from "@/lib/scheduler/historicalBackfillConfig";
import { filterEligibleHistoricalBackfillFixtures } from "@/lib/scheduler/historicalBackfillIntake";
import { withRetry, withTimeout } from "@/lib/scheduler/retry";
import {
  acquireSchedulerLock,
  releaseSchedulerLock,
} from "@/lib/scheduler/schedulerLock";
import { getSchedulerConfig } from "@/lib/scheduler/schedulerConfig";
import type { HistoricalMatchBackfillResult } from "@/lib/scheduler/schedulerTypes";
import { filterFixturesByLeagueIdWhitelist } from "@/lib/scheduler/fixtureIntake";
import {
  buildHistoricalBackfillRecord,
  insertHistoricalBackfillRecord,
  isHistoricalBackfillDuplicate,
  loadHistoricalBackfillDuplicateCheck,
  registerHistoricalBackfillDuplicate,
  type HistoricalBackfillDuplicateCheck,
} from "@/lib/supabase/services/historicalBackfillService";

export interface HistoricalMatchBackfillDependencies {
  ownerId?: string;
  fetchFixturesByDate?: (date: string) => Promise<ApiFootballFixtureRecord[]>;
  loadCursor?: () => Promise<HistoricalBackfillCursor | null>;
  saveCursor?: (cursor: HistoricalBackfillCursor) => Promise<void>;
  loadDuplicateCheck?: (
    fixtureIds: number[]
  ) => Promise<HistoricalBackfillDuplicateCheck>;
  insertRecord?: (record: HistoricalMatchRecord) => Promise<HistoricalMatchRecord>;
  loadMatchKeysForDate?: (date: string) => Promise<Set<string>>;
}

export interface HistoricalBackfillRunStats {
  fetched: number;
  inserted: number;
  duplicates: number;
  skipped: number;
  apiRequests: number;
  datesProcessed: number;
}

function buildMatchKey(matchDate: string, homeTeam: string, awayTeam: string): string {
  return `${matchDate}|${homeTeam.trim().toLowerCase()}|${awayTeam.trim().toLowerCase()}`;
}

async function resolveCursor(
  dependencies: HistoricalMatchBackfillDependencies
): Promise<HistoricalBackfillCursor> {
  const config = getHistoricalBackfillConfig();
  const loadCursor = dependencies.loadCursor ?? loadHistoricalBackfillCursor;
  const existing = await loadCursor();
  if (existing) {
    return existing;
  }

  return createInitialHistoricalBackfillCursor({
    startDate: resolveHistoricalBackfillStartDate(config),
    minDate: config.minDate,
  });
}

function applyLeaguePolicy(
  fixtures: ApiFootballFixtureRecord[]
): ApiFootballFixtureRecord[] {
  const { leagueIdWhitelist } = getSchedulerConfig();
  if (leagueIdWhitelist.length === 0) {
    return fixtures;
  }

  return fixtures.filter(
    (fixture) =>
      fixture.leagueId !== null &&
      filterFixturesByLeagueIdWhitelist(
        [
          {
            fixtureId: fixture.fixtureId,
            matchDate: fixture.date,
            league: fixture.league ?? "",
            leagueName: fixture.league ?? "",
            leagueId: fixture.leagueId,
            season: fixture.season,
            kickoffTime: fixture.kickoffTime ?? `${fixture.date}T00:00:00.000Z`,
            homeTeam: fixture.homeTeam,
            awayTeam: fixture.awayTeam,
            homeTeamId: fixture.homeTeamId,
            awayTeamId: fixture.awayTeamId,
            status: fixture.status,
          },
        ],
        leagueIdWhitelist
      ).length > 0
  );
}

export async function runHistoricalMatchBackfillScheduler(
  dependencies: HistoricalMatchBackfillDependencies = {}
): Promise<HistoricalMatchBackfillResult> {
  const config = getHistoricalBackfillConfig();
  const schedulerConfig = getSchedulerConfig();
  const ownerId = dependencies.ownerId ?? crypto.randomUUID();
  const startedAtMs = Date.now();

  const lock = acquireSchedulerLock({
    jobName: "historical_match_backfill",
    ownerId,
    ttlMs: schedulerConfig.lockTtlMs,
  });

  if (!lock.acquired) {
    const skippedExecution = startExecutionLog({
      jobName: "historical_match_backfill",
      runDate: null,
      context: buildExecutionLogContext({
        jobType: "historical_match_backfill",
        status: "skipped",
        reason: "lock_held",
        ownerId,
      }),
    });
    const persistResult = await completeExecutionLog({
      id: skippedExecution.id,
      success: false,
      errorMessage: "Skipped due to active scheduler lock.",
      context: buildExecutionLogContext({
        jobType: "historical_match_backfill",
        status: "skipped",
        fetched: 0,
        inserted: 0,
        duplicates: 0,
        skipped: 0,
        durationMs: 0,
      }),
    });

    return {
      cursor: null,
      stats: {
        fetched: 0,
        inserted: 0,
        duplicates: 0,
        skipped: 0,
        apiRequests: 0,
        datesProcessed: 0,
      },
      executionLogId: skippedExecution.id,
      skippedDueToLock: true,
      observabilityWarning: persistResult.persisted
        ? undefined
        : persistResult.persistError,
    };
  }

  const apiQuotaStart = getApiFootballQuotaSnapshot().dailyCount;
  const execution = startExecutionLog({
    jobName: "historical_match_backfill",
    runDate: null,
    context: { ownerId },
  });

  const fetchFixturesByDate =
    dependencies.fetchFixturesByDate ??
    (async (date: string) => {
      const client = getApiFootballClient();
      if (!client.isConfigured()) {
        return [];
      }
      return client.getFixturesByDate(date);
    });
  const saveCursor = dependencies.saveCursor ?? saveHistoricalBackfillCursor;
  const loadDuplicateCheck =
    dependencies.loadDuplicateCheck ?? loadHistoricalBackfillDuplicateCheck;
  const insertRecord = dependencies.insertRecord ?? insertHistoricalBackfillRecord;
  const loadMatchKeysForDate =
    dependencies.loadMatchKeysForDate ??
    (async () => new Set<string>());

  try {
    const outcome = await withTimeout(
      (async () => {
        let cursor = await resolveCursor(dependencies);
        const stats: HistoricalBackfillRunStats = {
          fetched: 0,
          inserted: 0,
          duplicates: 0,
          skipped: 0,
          apiRequests: 0,
          datesProcessed: 0,
        };

        while (
          stats.inserted < config.maxPerRun &&
          cursor.status === "in_progress" &&
          compareDateKeys(cursor.currentDate, cursor.minDate) >= 0
        ) {
          const fixtures = await withRetry(() => fetchFixturesByDate(cursor.currentDate), {
            maxRetries: schedulerConfig.maxRetries,
            delayMs: schedulerConfig.retryDelayMs,
          });
          stats.apiRequests += 1;
          stats.datesProcessed += 1;

          const eligible = applyLeaguePolicy(
            filterEligibleHistoricalBackfillFixtures(fixtures)
          );
          stats.fetched += eligible.length;

          const duplicateCheck = await loadDuplicateCheck(
            eligible.map((fixture) => fixture.fixtureId)
          );
          const matchKeys = await loadMatchKeysForDate(cursor.currentDate);
          for (const key of matchKeys) {
            duplicateCheck.existingMatchKeys.add(key);
          }

          const sorted = [...eligible].sort(
            (left, right) => right.fixtureId - left.fixtureId
          );

          for (const fixture of sorted) {
            if (stats.inserted >= config.maxPerRun) {
              break;
            }

            if (isHistoricalBackfillDuplicate(fixture, duplicateCheck)) {
              stats.duplicates += 1;
              continue;
            }

            try {
              const record = buildHistoricalBackfillRecord({ fixture });
              await insertRecord(record);
              registerHistoricalBackfillDuplicate(fixture, duplicateCheck);
              stats.inserted += 1;
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              if (/duplicate|unique|uq_match_records/i.test(message)) {
                stats.duplicates += 1;
                registerHistoricalBackfillDuplicate(fixture, duplicateCheck);
                continue;
              }
              stats.skipped += 1;
              logAdminError({
                category: "scheduler",
                message: "Historical backfill insert failed",
                context: {
                  fixtureId: fixture.fixtureId,
                  matchDate: fixture.date,
                  error: message,
                },
              });
            }
          }

          const reachedBatchLimit = stats.inserted >= config.maxPerRun;
          if (!reachedBatchLimit) {
            if (compareDateKeys(cursor.currentDate, cursor.minDate) <= 0) {
              cursor = {
                ...cursor,
                status: "completed",
              };
              break;
            }

            cursor = {
              ...cursor,
              currentDate: previousDateKey(cursor.currentDate),
            };
          } else {
            break;
          }
        }

        if (
          cursor.status === "in_progress" &&
          compareDateKeys(cursor.currentDate, cursor.minDate) < 0
        ) {
          cursor = {
            ...cursor,
            status: "completed",
          };
        }

        await saveCursor(cursor);

        const durationMs = Date.now() - startedAtMs;
        const apiFootballRequestCount = Math.max(
          0,
          getApiFootballQuotaSnapshot().dailyCount - apiQuotaStart
        );

        const persistResult = await completeExecutionLog({
          id: execution.id,
          success: true,
          context: buildExecutionLogContext({
            jobType: "historical_match_backfill",
            status: "success",
            fetched: stats.fetched,
            inserted: stats.inserted,
            duplicates: stats.duplicates,
            skipped: stats.skipped,
            durationMs,
            apiFootballRequestCount,
            datesProcessed: stats.datesProcessed,
            cursorDate: cursor.currentDate,
            cursorStatus: cursor.status,
          }),
        });

        return {
          cursor,
          stats: {
            ...stats,
            apiRequests: apiFootballRequestCount,
          },
          observabilityWarning: persistResult.persisted
            ? undefined
            : persistResult.persistError,
        };
      })(),
      schedulerConfig.jobTimeoutMs,
      "Historical match backfill timed out"
    );

    return {
      cursor: outcome.cursor,
      stats: outcome.stats,
      executionLogId: execution.id,
      skippedDueToLock: false,
      observabilityWarning: outcome.observabilityWarning,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startedAtMs;
    const apiFootballRequestCount = Math.max(
      0,
      getApiFootballQuotaSnapshot().dailyCount - apiQuotaStart
    );

    await completeExecutionLog({
      id: execution.id,
      success: false,
      errorMessage: message,
      context: buildExecutionLogContext({
        jobType: "historical_match_backfill",
        status: "failed",
        durationMs,
        apiFootballRequestCount,
      }),
    });

    logAdminError({
      category: "scheduler",
      message: "Historical match backfill failed",
      context: { error: message },
    });
    throw error;
  } finally {
    releaseSchedulerLock("historical_match_backfill", ownerId);
  }
}

export { buildMatchKey };
