import type {
  DailyDataCompletenessStats,
  DailyPipelineItemResult,
  DailyPipelineResult,
  ProductionFixture,
} from "@/lib/production/productionTypes";
import { logAdminError } from "@/lib/admin/adminErrorLog";
import { runAdminDailyCron } from "@/lib/admin/runAdminDailyCron";
import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import type { SaveMatchOutcome } from "@/lib/database/matchSchema";
import type { AnalysisReport } from "@/lib/analysis/types";
import {
  countRemaining,
  loadDailyAnalysisQueue,
  mergeQueueWithEligibleFixtures,
  saveDailyAnalysisQueue,
  type DailyAnalysisBatchProgress,
  type DailyAnalysisQueueState,
} from "@/lib/scheduler/dailyAnalysisQueueStore";
import { getApiFootballQuotaSnapshot } from "@/lib/providers/apiFootball/apiFootballQuota";
import { prefetchProductionH2H, loadProductionH2HMatchRecords } from "@/lib/providers/h2h/productionH2HProvider";
import {
  loadProductionLeagueStrengthMatchRecords,
  prefetchProductionLeagueStrength,
} from "@/lib/providers/leagueStrength/productionLeagueStrengthProvider";
import { prefetchProductionSquadAvailability } from "@/lib/providers/squadAvailability/productionSquadAvailabilityProvider";
import { prefetchProductionMatchContext } from "@/lib/providers/matchContext/productionMatchContextProvider";
import {
  fetchFixturesByDate,
  buildFixtureFilterStats,
  filterAnalyzableFixtures,
  filterFixturesBySchedulerLeaguePolicy,
} from "@/lib/scheduler/fixtureIntake";
import { filterPreMatchEligibleFixtures } from "@/lib/scheduler/preMatchFixtureEligibility";
import type { FixtureIntakeResult } from "@/lib/scheduler/fixtureMapping";
import { isApiFootballQuotaExceededError } from "@/lib/scheduler/resultUpdateFixtureFetch";
import { canMakeApiFootballRequest } from "@/lib/providers/apiFootball/apiFootballQuota";
import { resolveSchedulerFixturesToProduction } from "@/lib/scheduler/schedulerOddsIntegration";
import type { SchedulerOddsStats } from "@/lib/scheduler/schedulerOddsIntegration";
import { buildSchedulerPlaceholderOdds } from "@/lib/scheduler/schedulerPlaceholderOdds";
import { buildSchedulerDailySummary } from "@/lib/scheduler/dailySummary";
import { withRetry, withTimeout } from "@/lib/scheduler/retry";
import {
  acquireSchedulerLock,
  releaseSchedulerLock,
} from "@/lib/scheduler/schedulerLock";
import { getSchedulerConfig } from "@/lib/scheduler/schedulerConfig";
import type {
  DailySchedulerBatchProgress,
  DailySchedulerResult,
} from "@/lib/scheduler/schedulerTypes";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { SchedulerFixtureSource } from "@/lib/scheduler/schedulerTypes";
import { toProductionFixture } from "@/lib/scheduler/fixtureMapping";
import {
  attachTeamProfilesToReport,
  buildMatchTeamProfilesSnapshot,
  ensureTeamProfilesForMatch,
  loadProfilesForMatch,
} from "@/lib/teamProfile";
import type { TeamProfileTeamDiagnostic } from "@/lib/teamProfile/teamProfileTypes";
import { enrichAnalysisReportWithFixture } from "@/lib/scheduler/fixtureMapping";
import {
  loadRuntimeWeightConfigForProduction,
  type RuntimeWeightConfigLoaderDeps,
} from "@/lib/recommendation/runtimeWeightConfigLoader";
import { buildWeightConfigSnapshotMetadata } from "@/lib/recommendation/weightConfigRuntime";
import type { WeightConfigSnapshotMetadata } from "@/lib/recommendation/weightConfigTypes";
import {
  buildExecutionLogContext,
  completeExecutionLog,
  startExecutionLog,
} from "@/lib/scheduler/executionLogStore";
import {
  rebuildDailyRecommendationsForDate,
  rebuildDailyRecommendationsWithDiagnosticsForDate,
} from "@/lib/supabase/services/dailyRecommendationService";
import {
  assessRecommendationDataCompleteness,
} from "@/lib/analysis/analysisDataCompleteness";

export interface DailySchedulerDependencies {
  runDate?: string;
  ownerId?: string;
  fetchFixtures?: typeof fetchFixturesByDate;
  saveMatch?: (
    rawOdds: string,
    report: AnalysisReport,
    matchDate: string
  ) => Promise<SaveMatchOutcome>;
  listRecords?: () => Promise<HistoricalMatchRecord[]>;
  runSummaryCron?: typeof runAdminDailyCron;
  now?: () => number;
  loadRuntimeWeightConfig?: (
    deps?: RuntimeWeightConfigLoaderDeps
  ) => ReturnType<typeof loadRuntimeWeightConfigForProduction>;
  rebuildDailyRecommendations?: typeof rebuildDailyRecommendationsForDate;
  rebuildDailyRecommendationsWithDiagnostics?: typeof rebuildDailyRecommendationsWithDiagnosticsForDate;
}

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function formatIntakeWarning(
  skip: { fixtureId: number | null; homeTeam: string | null; awayTeam: string | null; reason: string }
): string {
  const teams =
    skip.homeTeam && skip.awayTeam
      ? `${skip.homeTeam} vs ${skip.awayTeam}`
      : "unknown fixture";
  const fixtureLabel =
    skip.fixtureId !== null ? `fixture ${skip.fixtureId}` : "fixture unknown";
  return `Skipped ${fixtureLabel} (${teams}): ${skip.reason}`;
}

function teamProfileKey(
  teamId: number,
  leagueId: number | null,
  season: number | null
): string {
  return `${teamId}:${leagueId ?? -1}:${season ?? -1}`;
}

function toProductionFixtureWithPlaceholder(
  fixture: SchedulerFixtureSource
): ProductionFixture {
  return toProductionFixture({
    ...fixture,
    rawOdds: buildSchedulerPlaceholderOdds(fixture.homeTeam, fixture.awayTeam),
  });
}

function selectAnalysisCandidateFixtures(
  fixtures: SchedulerFixtureSource[],
  queue: DailyAnalysisQueueState,
  maxPerRun: number
): SchedulerFixtureSource[] {
  const byId = new Map(fixtures.map((fixture) => [fixture.fixtureId, fixture]));
  const candidates: SchedulerFixtureSource[] = [];
  let cursor = queue.cursor;

  while (candidates.length < maxPerRun && cursor < queue.fixtureIds.length) {
    const fixtureId = queue.fixtureIds[cursor];
    cursor += 1;

    if (
      queue.completedFixtureIds.includes(fixtureId) ||
      queue.failedFixtureIds.includes(fixtureId)
    ) {
      continue;
    }

    const fixture = byId.get(fixtureId);
    if (fixture) {
      candidates.push(fixture);
    }
  }

  return candidates;
}

function mergeSchedulerOddsStats(
  whitelistedCount: number,
  candidateOdds: SchedulerOddsStats
): SchedulerOddsStats {
  return {
    ...candidateOdds,
    total: whitelistedCount,
  };
}

function buildProductionFixturesForQueue(
  whitelisted: SchedulerFixtureSource[],
  resolvedCandidates: ProductionFixture[]
): ProductionFixture[] {
  const resolvedById = new Map(
    resolvedCandidates.map((fixture) => [fixture.fixtureId, fixture])
  );

  return whitelisted.map(
    (fixture) =>
      resolvedById.get(fixture.fixtureId) ??
      toProductionFixtureWithPlaceholder(fixture)
  );
}

function selectFixtureBatch(
  fixtures: ProductionFixture[],
  queue: DailyAnalysisQueueState,
  maxPerRun: number
): {
  batch: ProductionFixture[];
  cursorBefore: number;
  cursorAfter: number;
} {
  const byId = new Map(fixtures.map((fixture) => [fixture.fixtureId, fixture]));
  const batch: ProductionFixture[] = [];
  let cursor = queue.cursor;
  const cursorBefore = cursor;

  while (batch.length < maxPerRun && cursor < queue.fixtureIds.length) {
    const fixtureId = queue.fixtureIds[cursor];
    cursor += 1;

    if (
      queue.completedFixtureIds.includes(fixtureId) ||
      queue.failedFixtureIds.includes(fixtureId)
    ) {
      continue;
    }

    const fixture = byId.get(fixtureId);
    if (fixture) {
      batch.push(fixture);
    }
  }

  return { batch, cursorBefore, cursorAfter: cursor };
}

function createEmptyFixtureIntakeResult(): FixtureIntakeResult {
  return {
    fixtures: [],
    skipped: [],
    fetchMeta: {
      apiRaw: 0,
      cancelledOrAbandoned: 0,
    },
  };
}

async function fetchDailyAnalysisFixturesSafely(
  runDate: string,
  fetchFixtures: DailySchedulerDependencies["fetchFixtures"],
  options: {
    maxRetries: number;
    retryDelayMs: number;
  }
): Promise<FixtureIntakeResult> {
  const resolvedFetchFixtures = fetchFixtures ?? fetchFixturesByDate;

  if (!canMakeApiFootballRequest()) {
    logAdminError({
      category: "scheduler",
      message: "Daily analysis skipped API fixture fetch due to quota exhaustion.",
      context: { runDate },
    });
    return createEmptyFixtureIntakeResult();
  }

  try {
    return await withRetry(() => resolvedFetchFixtures(runDate), {
      maxRetries: options.maxRetries,
      delayMs: options.retryDelayMs,
    });
  } catch (error) {
    if (isApiFootballQuotaExceededError(error)) {
      logAdminError({
        category: "scheduler",
        message: "Daily analysis skipped API fixture fetch due to quota exhaustion.",
        context: {
          runDate,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return createEmptyFixtureIntakeResult();
    }
    throw error;
  }
}

function createEmptyDataCompletenessStats(): DailyDataCompletenessStats {
  return {
    inserted: 0,
    duplicateSkipped: 0,
    historicalBackfillEnriched: 0,
    incompleteAnalysisRejected: 0,
    conflictingRecords: 0,
    oddsMissing: 0,
    settleableMarketMissing: 0,
    analysisSnapshotMissing: 0,
    profileDeferredCount: 0,
    profileUnavailableCount: 0,
    groundingUnavailableCount: 0,
    snapshotPersistedCount: 0,
    snapshotMissingCount: 0,
    recommendationsBlockedByCompleteness: 0,
    recommendationsCreatedWithCompleteData: 0,
  };
}

function recordDataCompletenessOutcome(
  stats: DailyDataCompletenessStats,
  outcome: SaveMatchOutcome,
  fixture: ProductionFixture
): DailyPipelineItemResult {
  switch (outcome.status) {
    case "created":
      stats.inserted += 1;
      return { fixture, status: "created", matchId: outcome.record.id };
    case "enriched":
      stats.historicalBackfillEnriched += 1;
      return { fixture, status: "enriched", matchId: outcome.record.id };
    case "duplicate":
      stats.duplicateSkipped += 1;
      return { fixture, status: "duplicate", matchId: outcome.record.id };
    case "incomplete_analysis_rejected":
      stats.incompleteAnalysisRejected += 1;
      if (outcome.reason === "oddsMissing") {
        stats.oddsMissing += 1;
      } else if (outcome.reason === "settleableMarketMissing") {
        stats.settleableMarketMissing += 1;
      } else if (outcome.reason === "analysisSnapshotMissing") {
        stats.analysisSnapshotMissing += 1;
      } else if (outcome.reason === "profileDeferred") {
        stats.profileDeferredCount += 1;
      } else if (outcome.reason === "profileUnavailable") {
        stats.profileUnavailableCount += 1;
      } else if (outcome.reason === "groundingUnavailable") {
        stats.groundingUnavailableCount += 1;
      } else {
        stats.recommendationsBlockedByCompleteness += 1;
      }
      logAdminError({
        category: "scheduler",
        message: `Daily analysis completeness rejected: ${fixture.homeTeam} vs ${fixture.awayTeam}`,
        context: {
          fixtureId: fixture.fixtureId,
          reason: outcome.reason,
        },
      });
      return {
        fixture,
        status: "incomplete_rejected",
        matchId: outcome.record?.id,
        error: outcome.reason,
      };
    case "conflicting_record":
      stats.conflictingRecords += 1;
      logAdminError({
        category: "scheduler",
        message: `Daily analysis completeness conflict: ${fixture.homeTeam} vs ${fixture.awayTeam}`,
        context: {
          fixtureId: fixture.fixtureId,
          reason: outcome.reason,
        },
      });
      return {
        fixture,
        status: "conflicting",
        matchId: outcome.record.id,
        error: outcome.reason,
      };
  }
}

async function runBatchedDailyPipeline(
  fixtures: ProductionFixture[],
  runDate: string,
  queue: DailyAnalysisQueueState,
  dependencies: Required<Pick<DailySchedulerDependencies, "saveMatch">> & {
    fixtureTimeoutMs: number;
    maxRetries: number;
    retryDelayMs: number;
    maxFixturesPerRun: number;
    maxTeamProfileRefreshesPerRun: number;
    timeBudgetDeadline: number;
    now: () => number;
    loadRuntimeWeightConfig: (
      deps?: RuntimeWeightConfigLoaderDeps
    ) => ReturnType<typeof loadRuntimeWeightConfigForProduction>;
  }
): Promise<
  DailyPipelineResult & {
    teamProfileWarnings: string[];
    teamProfileDiagnostics: TeamProfileTeamDiagnostic[];
    teamProfileApiRequestCount: number;
    batchProgress: DailyAnalysisBatchProgress;
    batchWeightConfig: WeightConfigSnapshotMetadata;
    updatedQueue: DailyAnalysisQueueState;
  }
> {
  const items: DailyPipelineResult["items"] = [];
  let created = 0;
  let duplicates = 0;
  let failed = 0;
  const dataCompleteness = createEmptyDataCompletenessStats();
  const teamProfileWarnings: string[] = [];
  const teamProfileDiagnostics: TeamProfileTeamDiagnostic[] = [];
  const deferredFixtures: number[] = [];
  const deferredTeamProfiles: string[] = [];
  const teamProfileQuotaStart = getApiFootballQuotaSnapshot().dailyCount;
  const startedAt = dependencies.now();
  let teamProfileRefreshesUsed = 0;
  let timeBudgetReached = false;

  const { batch, cursorBefore, cursorAfter } = selectFixtureBatch(
    fixtures,
    queue,
    dependencies.maxFixturesPerRun
  );

  const updatedQueue: DailyAnalysisQueueState = {
    ...queue,
    cursor: cursorAfter,
    deferredFixtureIds: [...queue.deferredFixtureIds],
    deferredTeamProfileKeys: [...queue.deferredTeamProfileKeys],
  };

  const runtimeWeightConfig = await dependencies.loadRuntimeWeightConfig();
  const batchWeightConfig = buildWeightConfigSnapshotMetadata(runtimeWeightConfig);

  for (const fixture of batch) {
    if (dependencies.now() >= dependencies.timeBudgetDeadline) {
      timeBudgetReached = true;
      if (
        !updatedQueue.completedFixtureIds.includes(fixture.fixtureId) &&
        !updatedQueue.failedFixtureIds.includes(fixture.fixtureId)
      ) {
        deferredFixtures.push(fixture.fixtureId);
        if (!updatedQueue.deferredFixtureIds.includes(fixture.fixtureId)) {
          updatedQueue.deferredFixtureIds.push(fixture.fixtureId);
        }
      }
      break;
    }

    try {
      const pipelineResult = await withRetry(
        async () =>
          withTimeout(
            (async () => {
              let profileSnapshot = buildMatchTeamProfilesSnapshot(null, null, []);
              let fixtureProfileDiagnostics: TeamProfileTeamDiagnostic[] = [];
              const canAttemptProfileRefresh =
                teamProfileRefreshesUsed + 2 <=
                dependencies.maxTeamProfileRefreshesPerRun;

              if (canAttemptProfileRefresh) {
                try {
                  const profileResult = await ensureTeamProfilesForMatch({
                    runDate,
                    homeTeamId: fixture.homeTeamId,
                    awayTeamId: fixture.awayTeamId,
                    homeTeamName: fixture.homeTeam,
                    awayTeamName: fixture.awayTeam,
                    leagueId: fixture.leagueId,
                    leagueName: fixture.leagueName,
                    season: fixture.season,
                    waitForQuota: false,
                    skipDeferredRetry: true,
                  });
                  profileSnapshot = profileResult.snapshot;
                  fixtureProfileDiagnostics = profileResult.profileDiagnostics;
                  teamProfileWarnings.push(...profileResult.profileWarnings);
                  teamProfileDiagnostics.push(...profileResult.profileDiagnostics);
                  teamProfileRefreshesUsed += 2;

                  for (const diagnostic of profileResult.profileDiagnostics) {
                    if (diagnostic.skippedReason === "quota_exhausted") {
                      const key = teamProfileKey(
                        diagnostic.teamId,
                        fixture.leagueId,
                        fixture.season
                      );
                      if (!deferredTeamProfiles.includes(key)) {
                        deferredTeamProfiles.push(key);
                      }
                      if (!updatedQueue.deferredTeamProfileKeys.includes(key)) {
                        updatedQueue.deferredTeamProfileKeys.push(key);
                      }
                    }
                  }
                } catch (error) {
                  const message =
                    error instanceof Error ? error.message : String(error);
                  teamProfileWarnings.push(
                    `Team profile refresh failed for ${fixture.homeTeam} vs ${fixture.awayTeam}: ${message}`
                  );
                  profileSnapshot = await loadProfilesForMatch({
                    homeTeamId: fixture.homeTeamId,
                    awayTeamId: fixture.awayTeamId,
                    leagueId: fixture.leagueId,
                    season: fixture.season,
                  });
                }
              } else {
                profileSnapshot = await loadProfilesForMatch({
                  homeTeamId: fixture.homeTeamId,
                  awayTeamId: fixture.awayTeamId,
                  leagueId: fixture.leagueId,
                  season: fixture.season,
                });
                const homeKey = teamProfileKey(
                  fixture.homeTeamId,
                  fixture.leagueId,
                  fixture.season
                );
                const awayKey = teamProfileKey(
                  fixture.awayTeamId,
                  fixture.leagueId,
                  fixture.season
                );
                for (const key of [homeKey, awayKey]) {
                  if (!deferredTeamProfiles.includes(key)) {
                    deferredTeamProfiles.push(key);
                  }
                  if (!updatedQueue.deferredTeamProfileKeys.includes(key)) {
                    updatedQueue.deferredTeamProfileKeys.push(key);
                  }
                }
                teamProfileWarnings.push(
                  `Team profile refresh deferred for ${fixture.homeTeam} vs ${fixture.awayTeam} due to scheduler profile budget or quota.`
                );
              }

              const matchRecordsForH2H = await loadProductionH2HMatchRecords();
              await prefetchProductionH2H({
                homeTeam: fixture.homeTeam,
                awayTeam: fixture.awayTeam,
                matchDate: fixture.matchDate,
                homeTeamId: fixture.homeTeamId,
                awayTeamId: fixture.awayTeamId,
                matchRecords: matchRecordsForH2H,
              });
              await prefetchProductionLeagueStrength({
                leagueName: fixture.league,
                matchDate: fixture.matchDate,
                matchRecords: matchRecordsForH2H,
              });
              await prefetchProductionSquadAvailability({
                homeTeam: fixture.homeTeam,
                awayTeam: fixture.awayTeam,
                matchDate: fixture.matchDate,
                matchRecords: matchRecordsForH2H,
              });
              await prefetchProductionMatchContext({
                homeTeam: fixture.homeTeam,
                awayTeam: fixture.awayTeam,
                matchDate: fixture.matchDate,
                matchRecords: matchRecordsForH2H,
              });

              const report = attachTeamProfilesToReport(
                enrichAnalysisReportWithFixture(
                  analyzeMatch(fixture.rawOdds, {
                    teamProfiles: profileSnapshot,
                    matchDate: fixture.matchDate,
                    runtimeWeightConfig,
                    h2hContext: {
                      homeTeam: fixture.homeTeam,
                      awayTeam: fixture.awayTeam,
                      matchDate: fixture.matchDate,
                      homeTeamId: fixture.homeTeamId,
                      awayTeamId: fixture.awayTeamId,
                    },
                    leagueStrengthContext: {
                      leagueName: fixture.league,
                      matchDate: fixture.matchDate,
                      matchRecords: matchRecordsForH2H,
                    },
                    squadAvailabilityContext: {
                      homeTeam: fixture.homeTeam,
                      awayTeam: fixture.awayTeam,
                      matchDate: fixture.matchDate,
                      matchRecords: matchRecordsForH2H,
                    },
                    matchContextContext: {
                      homeTeam: fixture.homeTeam,
                      awayTeam: fixture.awayTeam,
                      matchDate: fixture.matchDate,
                      matchRecords: matchRecordsForH2H,
                    },
                  }),
                  fixture
                ),
                profileSnapshot
              );
              report.analysisContext = {
                profileDiagnostics: fixtureProfileDiagnostics,
              };

              const completeness = assessRecommendationDataCompleteness({
                report,
                profileDiagnostics: fixtureProfileDiagnostics,
              });
              if (!completeness.eligibleForRecommendation) {
                return {
                  status: "incomplete_deferred" as const,
                  completeness,
                };
              }

              const outcome = await dependencies.saveMatch(
                fixture.rawOdds,
                report,
                fixture.matchDate
              );
              return { status: "saved" as const, outcome };
            })(),
            dependencies.fixtureTimeoutMs,
            `Fixture analysis timed out: ${fixture.homeTeam} vs ${fixture.awayTeam}`
          ),
        {
          maxRetries: dependencies.maxRetries,
          delayMs: dependencies.retryDelayMs,
          onRetry: (attempt, error) => {
            logAdminError({
              category: "scheduler",
              message: `Daily fixture retry ${attempt}: ${fixture.homeTeam} vs ${fixture.awayTeam}`,
              context: {
                error: error instanceof Error ? error.message : String(error),
              },
            });
          },
        }
      );

      if (
        pipelineResult &&
        typeof pipelineResult === "object" &&
        "status" in pipelineResult &&
        pipelineResult.status === "incomplete_deferred"
      ) {
        dataCompleteness.incompleteAnalysisRejected += 1;
        dataCompleteness.recommendationsBlockedByCompleteness += 1;
        if (pipelineResult.completeness.profileDeferred) {
          dataCompleteness.profileDeferredCount += 1;
        }
        dataCompleteness.profileUnavailableCount +=
          pipelineResult.completeness.profileUnavailableCount;
        if (pipelineResult.completeness.groundingUnavailable) {
          dataCompleteness.groundingUnavailableCount += 1;
        }
        dataCompleteness.snapshotMissingCount += 1;
        if (!updatedQueue.deferredFixtureIds.includes(fixture.fixtureId)) {
          updatedQueue.deferredFixtureIds.push(fixture.fixtureId);
        }
        items.push({
          fixture,
          status: "incomplete_rejected",
          error: pipelineResult.completeness.reasons.join(", "),
        });
        logAdminError({
          category: "scheduler",
          message: `Daily analysis deferred due to incomplete data: ${fixture.homeTeam} vs ${fixture.awayTeam}`,
          context: {
            fixtureId: fixture.fixtureId,
            reasons: pipelineResult.completeness.reasons,
            quotaWarnings: pipelineResult.completeness.quotaWarnings,
          },
        });
        continue;
      }

      const outcome =
        pipelineResult &&
        typeof pipelineResult === "object" &&
        "status" in pipelineResult &&
        pipelineResult.status === "saved"
          ? pipelineResult.outcome
          : (pipelineResult as SaveMatchOutcome);

      const item = recordDataCompletenessOutcome(dataCompleteness, outcome, fixture);
      items.push(item);

      if (outcome.status === "created" || outcome.status === "enriched") {
        created += 1;
        dataCompleteness.snapshotPersistedCount += 1;
        dataCompleteness.recommendationsCreatedWithCompleteData += 1;
      } else if (outcome.status === "duplicate") {
        duplicates += 1;
      } else if (outcome.status === "incomplete_analysis_rejected") {
        dataCompleteness.recommendationsBlockedByCompleteness += 1;
        if (!updatedQueue.deferredFixtureIds.includes(fixture.fixtureId)) {
          updatedQueue.deferredFixtureIds.push(fixture.fixtureId);
        }
        continue;
      }

      if (!updatedQueue.completedFixtureIds.includes(fixture.fixtureId)) {
        updatedQueue.completedFixtureIds.push(fixture.fixtureId);
      }
      updatedQueue.deferredFixtureIds = updatedQueue.deferredFixtureIds.filter(
        (fixtureId) => fixtureId !== fixture.fixtureId
      );
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      items.push({ fixture, status: "failed", error: message });
      if (!updatedQueue.failedFixtureIds.includes(fixture.fixtureId)) {
        updatedQueue.failedFixtureIds.push(fixture.fixtureId);
      }
      logAdminError({
        category: "scheduler",
        message: `Daily fixture failed: ${fixture.homeTeam} vs ${fixture.awayTeam}`,
        context: { error: message },
      });
    }

    if (dependencies.now() >= dependencies.timeBudgetDeadline) {
      timeBudgetReached = true;
    }
  }

  const executionDurationMs = dependencies.now() - startedAt;
  const remaining = countRemaining(updatedQueue);
  const batchProgress: DailyAnalysisBatchProgress = {
    totalEligible: updatedQueue.fixtureIds.length,
    processedThisRun: items.length,
    remaining,
    cursorBefore,
    cursorAfter: updatedQueue.cursor,
    deferredFixtures,
    deferredTeamProfiles,
    timeBudgetReached,
    executionDurationMs,
  };

  return {
    runDate,
    processed: items.length,
    created,
    duplicates,
    failed,
    items,
    dataCompleteness,
    teamProfileWarnings,
    teamProfileDiagnostics,
    teamProfileApiRequestCount: Math.max(
      0,
      getApiFootballQuotaSnapshot().dailyCount - teamProfileQuotaStart
    ),
    batchProgress,
    batchWeightConfig,
    updatedQueue,
  };
}

function syncQueueWithExistingRecords(
  queue: DailyAnalysisQueueState,
  fixtures: ProductionFixture[],
  records: HistoricalMatchRecord[]
): DailyAnalysisQueueState {
  const recordKeys = new Set(
    records.map((record) => `${record.matchDate}:${record.homeTeam}:${record.awayTeam}`)
  );
  const completed = new Set(queue.completedFixtureIds);

  for (const fixture of fixtures) {
    const key = `${fixture.matchDate}:${fixture.homeTeam}:${fixture.awayTeam}`;
    if (recordKeys.has(key)) {
      completed.add(fixture.fixtureId);
    }
  }

  return {
    ...queue,
    completedFixtureIds: [...completed],
  };
}

export async function runDailyScheduler(
  dependencies: DailySchedulerDependencies = {}
): Promise<DailySchedulerResult> {
  const config = getSchedulerConfig();
  const runDate = dependencies.runDate ?? todayKey();
  const ownerId = dependencies.ownerId ?? crypto.randomUUID();
  const fetchFixtures = dependencies.fetchFixtures ?? fetchFixturesByDate;
  const listRecords = dependencies.listRecords ?? (async () => [] as HistoricalMatchRecord[]);
  const runSummaryCron = dependencies.runSummaryCron ?? runAdminDailyCron;
  const now = dependencies.now ?? (() => Date.now());
  const executionStartedAt = now();

  const lock = acquireSchedulerLock({
    jobName: "daily_analysis",
    ownerId,
    ttlMs: config.lockTtlMs,
  });

  if (!lock.acquired) {
    const skippedExecution = startExecutionLog({
      jobName: "daily_analysis",
      runDate,
      context: buildExecutionLogContext({
        jobType: "daily_analysis",
        status: "skipped",
        fixturesFetched: 0,
        analyzedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        apiFootballRequestCount: 0,
        reason: "lock_held",
        ownerId,
      }),
    });
    const persistResult = await completeExecutionLog({
      id: skippedExecution.id,
      success: false,
      errorMessage: "Skipped due to active scheduler lock.",
      context: buildExecutionLogContext({
        jobType: "daily_analysis",
        status: "skipped",
        fixturesFetched: 0,
        analyzedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        apiFootballRequestCount: 0,
      }),
    });

    return {
      runDate,
      fixturesFetched: 0,
      fixturesSkipped: 0,
      fixturesAfterWhitelist: 0,
      pipeline: {
        runDate,
        processed: 0,
        created: 0,
        duplicates: 0,
        failed: 0,
        items: [],
      },
      summary: buildSchedulerDailySummary(runDate, await listRecords()),
      executionLogId: skippedExecution.id,
      skippedDueToLock: true,
      intakeWarnings: [],
      executionStatus: "skipped",
      observabilityWarning: persistResult.persisted
        ? undefined
        : persistResult.persistError,
    };
  }

  const apiQuotaStart = getApiFootballQuotaSnapshot().dailyCount;

  const execution = startExecutionLog({
    jobName: "daily_analysis",
    runDate,
    context: { ownerId },
  });

  try {
    const intake = await fetchDailyAnalysisFixturesSafely(runDate, fetchFixtures, {
      maxRetries: config.maxRetries,
      retryDelayMs: config.retryDelayMs,
    });
    const intakeWarnings = intake.skipped.map(formatIntakeWarning);

    for (const warning of intakeWarnings) {
      logAdminError({
        category: "scheduler",
        message: warning,
        context: { runDate, phase: "fixture_intake" },
      });
    }

    const analyzable = filterAnalyzableFixtures(intake.fixtures);
    const preMatch = filterPreMatchEligibleFixtures(analyzable, new Date(now()));
    const whitelisted = filterFixturesBySchedulerLeaguePolicy(preMatch.eligible, {
      leagueIdWhitelist: config.leagueIdWhitelist,
      leagueWhitelist: config.leagueWhitelist,
    });
    const filterStats = buildFixtureFilterStats(intake, {
      leagueIdWhitelist: config.leagueIdWhitelist,
      leagueWhitelist: config.leagueWhitelist,
    });

    const existingQueue = await loadDailyAnalysisQueue(runDate);
    let queue = mergeQueueWithEligibleFixtures(
      existingQueue,
      runDate,
      whitelisted.map((fixture) => fixture.fixtureId)
    );
    const records = await listRecords();
    const placeholderFixtures = whitelisted.map(toProductionFixtureWithPlaceholder);
    queue = syncQueueWithExistingRecords(queue, placeholderFixtures, records);

    const analysisCandidates = selectAnalysisCandidateFixtures(
      whitelisted,
      queue,
      config.maxFixturesPerRun
    );
    const { productionFixtures: resolvedCandidates, schedulerOdds: candidateOdds } =
      await resolveSchedulerFixturesToProduction(analysisCandidates);
    const productionFixtures = buildProductionFixturesForQueue(
      whitelisted,
      resolvedCandidates
    );
    const schedulerOdds = mergeSchedulerOddsStats(
      whitelisted.length,
      candidateOdds
    );

    const saveMatch =
      dependencies.saveMatch ??
      (async () => {
        throw new Error("saveMatch dependency is required.");
      });

    const timeBudgetDeadline = executionStartedAt + config.timeBudgetMs;
    const pipeline = await runBatchedDailyPipeline(
      productionFixtures,
      runDate,
      queue,
      {
        saveMatch,
        fixtureTimeoutMs: config.fixtureTimeoutMs,
        maxRetries: config.maxRetries,
        retryDelayMs: config.retryDelayMs,
        maxFixturesPerRun: config.maxFixturesPerRun,
        maxTeamProfileRefreshesPerRun: config.maxTeamProfileRefreshesPerRun,
        timeBudgetDeadline,
        now,
        loadRuntimeWeightConfig:
          dependencies.loadRuntimeWeightConfig ?? loadRuntimeWeightConfigForProduction,
      }
    );

    queue = pipeline.updatedQueue;
    await saveDailyAnalysisQueue(queue);

    const rebuildDailyRecommendationsWithDiagnostics =
      dependencies.rebuildDailyRecommendationsWithDiagnostics ??
      rebuildDailyRecommendationsWithDiagnosticsForDate;
    let dailyRecommendationsCount = 0;
    let rejectedByScore = 0;
    let rejectedByConfidence = 0;
    let rejectedByGrade = 0;
    let eligibleRecommendationCount = 0;
    let dailyRecommendationsWarning: string | undefined;
    try {
      const refreshedRecords = await listRecords();
      const rebuilt = await rebuildDailyRecommendationsWithDiagnostics({
        matchDate: runDate,
        schedulerRunId: execution.id,
        records: refreshedRecords,
      });
      dailyRecommendationsCount = rebuilt.records.length;
      rejectedByScore = rebuilt.diagnostics.rejectedByScore;
      rejectedByConfidence = rebuilt.diagnostics.rejectedByConfidence;
      rejectedByGrade = rebuilt.diagnostics.rejectedByGrade;
      eligibleRecommendationCount = rebuilt.diagnostics.eligibleRecommendationCount;
    } catch (error) {
      dailyRecommendationsWarning =
        error instanceof Error ? error.message : String(error);
      logAdminError({
        category: "scheduler",
        message: "Daily recommendations rebuild failed",
        context: { runDate, error: dailyRecommendationsWarning },
      });
    }

    const summary = buildSchedulerDailySummary(runDate, await listRecords());

    const queueCompleted = countRemaining(queue) === 0;
    if (queueCompleted) {
      await withRetry(() => runSummaryCron(runDate), {
        maxRetries: config.maxRetries,
        delayMs: config.retryDelayMs,
      });
    }

    const apiFootballRequestCount = Math.max(
      0,
      getApiFootballQuotaSnapshot().dailyCount - apiQuotaStart
    );
    const executionDurationMs = now() - executionStartedAt;
    const executionStatus = queueCompleted ? "success" : "partial_success";

    const persistResult = await completeExecutionLog({
      id: execution.id,
      success: true,
      context: buildExecutionLogContext({
        jobType: "daily_analysis",
        status: executionStatus,
        fixturesFetched: intake.fixtures.length + intake.skipped.length,
        analyzedCount:
          pipeline.created +
          pipeline.duplicates +
          (pipeline.dataCompleteness?.historicalBackfillEnriched ?? 0),
        skippedCount: intake.skipped.length,
        errorCount: pipeline.failed,
        apiFootballRequestCount,
        teamProfileApiRequestCount: pipeline.teamProfileApiRequestCount,
        fixturesAfterWhitelist: whitelisted.length,
        filterStats: filterStats as unknown as Record<string, unknown>,
        pastKickoffSkipped: preMatch.stats.pastKickoffSkipped,
        startedFixtureSkipped: preMatch.stats.startedFixtureSkipped,
        terminalStatusSkipped: preMatch.stats.terminalStatusSkipped,
        eligibleUpcomingCount: preMatch.stats.eligibleUpcomingCount,
        profileDeferredCount: pipeline.dataCompleteness?.profileDeferredCount,
        profileUnavailableCount: pipeline.dataCompleteness?.profileUnavailableCount,
        groundingUnavailableCount: pipeline.dataCompleteness?.groundingUnavailableCount,
        snapshotPersistedCount: pipeline.dataCompleteness?.snapshotPersistedCount,
        snapshotMissingCount: pipeline.dataCompleteness?.snapshotMissingCount,
        recommendationsBlockedByCompleteness:
          pipeline.dataCompleteness?.recommendationsBlockedByCompleteness,
        recommendationsCreatedWithCompleteData:
          pipeline.dataCompleteness?.recommendationsCreatedWithCompleteData,
        created: pipeline.created,
        duplicates: pipeline.duplicates,
        failed: pipeline.failed,
        dataCompleteness: pipeline.dataCompleteness,
        intakeWarnings,
        teamProfileWarnings: pipeline.teamProfileWarnings,
        teamProfileDiagnostics: pipeline.teamProfileDiagnostics,
        totalEligible: pipeline.batchProgress.totalEligible,
        processedThisRun: pipeline.batchProgress.processedThisRun,
        remaining: pipeline.batchProgress.remaining,
        cursorBefore: pipeline.batchProgress.cursorBefore,
        cursorAfter: pipeline.batchProgress.cursorAfter,
        deferredFixtures: pipeline.batchProgress.deferredFixtures,
        deferredTeamProfiles: pipeline.batchProgress.deferredTeamProfiles,
        timeBudgetReached: pipeline.batchProgress.timeBudgetReached,
        executionDurationMs,
        queueStatus: queue.status,
        weightConfig: pipeline.batchWeightConfig,
        schedulerOdds,
        dailyRecommendationsCount,
        dailyRecommendationsWarning,
        rejectedByScore,
        rejectedByConfidence,
        rejectedByGrade,
        eligibleRecommendationCount,
      }),
    });

    if (queueCompleted) {
      const summaryExecution = startExecutionLog({
        jobName: "daily_summary",
        runDate,
        context: buildExecutionLogContext({
          jobType: "daily_summary",
          status: "success",
          triggeredBy: "daily_analysis",
          apiFootballRequestCount: 0,
        }),
      });
      await completeExecutionLog({
        id: summaryExecution.id,
        success: true,
        context: buildExecutionLogContext({
          jobType: "daily_summary",
          status: "success",
          triggeredBy: "daily_analysis",
          apiFootballRequestCount: 0,
        }),
      });
    }

    const observabilityWarning = persistResult.persisted
      ? undefined
      : persistResult.persistError;

    return {
      runDate,
      fixturesFetched: intake.fixtures.length + intake.skipped.length,
      fixturesSkipped: intake.skipped.length,
      fixturesAfterWhitelist: whitelisted.length,
      pipeline,
      summary,
      intakeWarnings,
      observabilityWarning,
      executionLogId: execution.id,
      skippedDueToLock: false,
      batchProgress: pipeline.batchProgress,
      executionStatus,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const apiFootballRequestCount = Math.max(
      0,
      getApiFootballQuotaSnapshot().dailyCount - apiQuotaStart
    );
    const persistResult = await completeExecutionLog({
      id: execution.id,
      success: false,
      errorMessage: message,
      context: buildExecutionLogContext({
        jobType: "daily_analysis",
        status: "failed",
        apiFootballRequestCount,
        executionDurationMs: now() - executionStartedAt,
      }),
    });
    logAdminError({
      category: "scheduler",
      message: "Daily scheduler failed",
      context: { runDate, error: message },
    });
    const observabilityError = new Error(message) as Error & {
      observabilityWarning?: string;
    };
    if (!persistResult.persisted) {
      observabilityError.observabilityWarning = persistResult.persistError;
    }
    throw observabilityError;
  } finally {
    releaseSchedulerLock("daily_analysis", ownerId);
  }
}
