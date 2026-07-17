import { buildMatchResult } from "@/lib/database/matchSchema";
import { validateSnapshotLeakage } from "@/lib/fundamentalsBacktest/dataLeakageValidator";
import { replaceFundamentalsDataset } from "@/lib/fundamentalsBacktest/fundamentalsDatasetStore";
import { collectEvidenceForSnapshot } from "@/lib/fundamentalsBacktest/fundamentalsEvidenceAdapter";
import {
  buildFundamentalsPrediction,
  evaluateBttsAccuracy,
  evaluateCleanSheetAccuracy,
  evaluateDirectionAccuracy,
  evaluateEvidenceProviderAccuracy,
  evaluateOverUnderAccuracy,
} from "@/lib/fundamentalsBacktest/fundamentalsPrediction";
import { buildPreMatchSnapshot } from "@/lib/fundamentalsBacktest/preMatchSnapshotBuilder";
import type {
  EvidenceProviderBacktestStats,
  FundamentalsBacktestEngineInput,
  FundamentalsBacktestReport,
  HistoricalFundamentalsDatasetEntry,
  HistoricalMatchOutcomeInput,
  LeagueBacktestStats,
} from "@/lib/fundamentalsBacktest/fundamentalsBacktestTypes";
import { FUNDAMENTALS_OVER_UNDER_LINE_DEFAULT } from "@/lib/fundamentalsBacktest/fundamentalsBacktestTypes";

function findOutcome(
  outcomes: HistoricalMatchOutcomeInput[],
  fixtureId: number
): HistoricalMatchOutcomeInput | undefined {
  return outcomes.find((outcome) => outcome.fixtureId === fixtureId);
}

function aggregateProviderStats(
  entries: HistoricalFundamentalsDatasetEntry[]
): EvidenceProviderBacktestStats[] {
  const accumulators = new Map<
    string,
    { usageCount: number; hitCount: number; confidenceSum: number; calibrationGapSum: number }
  >();

  for (const entry of entries) {
    const providerResults = evaluateEvidenceProviderAccuracy(
      entry.providerEvidence,
      entry.actualResult
    );
    for (const result of providerResults) {
      const current = accumulators.get(result.category) ?? {
        usageCount: 0,
        hitCount: 0,
        confidenceSum: 0,
        calibrationGapSum: 0,
      };
      current.usageCount += 1;
      if (result.accurate) {
        current.hitCount += 1;
      }
      current.confidenceSum += result.confidence;
      current.calibrationGapSum += Math.abs(result.confidence - (result.accurate ? 1 : 0));
      accumulators.set(result.category, current);
    }
  }

  return [...accumulators.entries()]
    .map(([category, stats]) => ({
      category,
      usageCount: stats.usageCount,
      hitCount: stats.hitCount,
      hitRate: stats.usageCount > 0 ? stats.hitCount / stats.usageCount : 0,
      averageConfidence: stats.usageCount > 0 ? stats.confidenceSum / stats.usageCount : 0,
      confidenceCalibrationGap:
        stats.usageCount > 0 ? stats.calibrationGapSum / stats.usageCount : 0,
    }))
    .sort((left, right) => right.hitRate - left.hitRate || right.usageCount - left.usageCount);
}

function aggregateLeagueStats(
  entries: HistoricalFundamentalsDatasetEntry[],
  overUnderLine: number
): LeagueBacktestStats[] {
  const groups = new Map<string, HistoricalFundamentalsDatasetEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.snapshot.leagueName) ?? [];
    list.push(entry);
    groups.set(entry.snapshot.leagueName, list);
  }

  return [...groups.entries()]
    .map(([leagueName, leagueEntries]) => {
      const sampleSize = leagueEntries.length;
      const directionHits = leagueEntries.filter((entry) =>
        evaluateDirectionAccuracy(entry.prediction, entry.actualResult)
      ).length;
      const bttsHits = leagueEntries.filter((entry) =>
        evaluateBttsAccuracy(entry.prediction, entry.actualResult)
      ).length;
      const overUnderHits = leagueEntries.filter((entry) =>
        evaluateOverUnderAccuracy(entry.prediction, entry.actualResult, overUnderLine)
      ).length;

      return {
        leagueName,
        sampleSize,
        directionAccuracy: sampleSize > 0 ? directionHits / sampleSize : 0,
        bttsAccuracy: sampleSize > 0 ? bttsHits / sampleSize : 0,
        overUnderAccuracy: sampleSize > 0 ? overUnderHits / sampleSize : 0,
      };
    })
    .sort((left, right) => right.directionAccuracy - left.directionAccuracy);
}

function computeMissingDataRate(entries: HistoricalFundamentalsDatasetEntry[]): number {
  if (entries.length === 0) {
    return 0;
  }

  let missingSignals = 0;
  let totalSignals = 0;

  for (const entry of entries) {
    totalSignals += 4;
    if (entry.snapshot.xGBeforeMatch.home === null || entry.snapshot.xGBeforeMatch.away === null) {
      missingSignals += 1;
    }
    if (entry.snapshot.standingsBeforeMatch.length === 0) {
      missingSignals += 1;
    }
    if (!entry.snapshot.squadAvailabilityBeforeMatch) {
      missingSignals += 1;
    }
    if (!entry.snapshot.h2hBeforeMatch) {
      missingSignals += 1;
    }
  }

  return totalSignals > 0 ? missingSignals / totalSignals : 0;
}

export function runFundamentalsBacktest(
  input: FundamentalsBacktestEngineInput,
  options?: { persistDataset?: boolean }
): FundamentalsBacktestReport {
  const overUnderLine = input.overUnderLine ?? FUNDAMENTALS_OVER_UNDER_LINE_DEFAULT;
  const validEntries: HistoricalFundamentalsDatasetEntry[] = [];
  let invalidSnapshots = 0;
  let leakageDetectedCount = 0;

  for (const fixture of input.fixtures) {
    const outcome = findOutcome(input.matchOutcomes, fixture.fixtureId);
    if (!outcome) {
      continue;
    }

    const squadAvailability = input.squadAvailability?.find(
      (entry) => entry.fixtureId === fixture.fixtureId
    );
    const scheduleContext = input.scheduleContext?.find(
      (entry) => entry.fixtureId === fixture.fixtureId
    );

    if (
      squadAvailability &&
      new Date(squadAvailability.snapshotDate).getTime() >= new Date(fixture.fixtureDate).getTime()
    ) {
      invalidSnapshots += 1;
      leakageDetectedCount += 1;
      continue;
    }

    const actualResult = buildMatchResult({
      fullTimeHomeGoals: outcome.homeGoals,
      fullTimeAwayGoals: outcome.awayGoals,
      halfTimeHomeGoals: 0,
      halfTimeAwayGoals: 0,
    });

    const storedMarketSnapshot =
      input.storedMarketSnapshots?.find((entry) => entry.fixtureId === fixture.fixtureId)
        ?.marketSelections ?? null;

    const snapshot = buildPreMatchSnapshot({
      fixture,
      matchOutcomes: input.matchOutcomes,
      standings: input.standings,
      actualResult,
      storedMarketSnapshot,
      squadAvailability: squadAvailability ?? undefined,
      scheduleContext: scheduleContext ?? undefined,
      sourceTimestamp: new Date(new Date(fixture.fixtureDate).getTime() - 3_600_000).toISOString(),
    });

    const leakage = validateSnapshotLeakage(snapshot);
    if (leakage.validationStatus === "INVALID") {
      invalidSnapshots += 1;
      if (leakage.leakageDetected) {
        leakageDetectedCount += 1;
      }
      continue;
    }

    const providerEvidence = collectEvidenceForSnapshot(snapshot);
    const prediction = buildFundamentalsPrediction({
      snapshot,
      evidence: providerEvidence,
      overUnderLine,
    });

    validEntries.push({
      snapshot,
      providerEvidence,
      prediction,
      actualResult,
      validationStatus: "VALID",
      validationReason: null,
      dataMode: snapshot.dataMode,
      createdAt: new Date().toISOString(),
    });
  }

  if (options?.persistDataset !== false) {
    replaceFundamentalsDataset(validEntries);
  }

  const sampleSize = validEntries.length;
  const directionHits = validEntries.filter((entry) =>
    evaluateDirectionAccuracy(entry.prediction, entry.actualResult)
  ).length;
  const bttsHits = validEntries.filter((entry) =>
    evaluateBttsAccuracy(entry.prediction, entry.actualResult)
  ).length;
  const overUnderHits = validEntries.filter((entry) =>
    evaluateOverUnderAccuracy(entry.prediction, entry.actualResult, overUnderLine)
  ).length;
  const cleanSheetHits = validEntries.filter((entry) =>
    evaluateCleanSheetAccuracy(entry.prediction, entry.actualResult)
  ).length;

  const homeScoringGap =
    sampleSize > 0
      ? validEntries.reduce((sum, entry) => {
          const actual = entry.actualResult.fullTimeHomeGoals > 0 ? 1 : 0;
          return sum + Math.abs(entry.prediction.homeScoringProbability - actual);
        }, 0) / sampleSize
      : 0;
  const awayScoringGap =
    sampleSize > 0
      ? validEntries.reduce((sum, entry) => {
          const actual = entry.actualResult.fullTimeAwayGoals > 0 ? 1 : 0;
          return sum + Math.abs(entry.prediction.awayScoringProbability - actual);
        }, 0) / sampleSize
      : 0;

  return {
    generatedAt: new Date().toISOString(),
    dataMode: "historical_fundamentals",
    totalHistoricalFixtures: input.fixtures.length,
    validSnapshots: sampleSize,
    invalidSnapshots,
    leakageDetectedCount,
    directionAccuracy: sampleSize > 0 ? directionHits / sampleSize : 0,
    bttsAccuracy: sampleSize > 0 ? bttsHits / sampleSize : 0,
    overUnderAccuracy: sampleSize > 0 ? overUnderHits / sampleSize : 0,
    homeScoringCalibrationGap: homeScoringGap,
    awayScoringCalibrationGap: awayScoringGap,
    cleanSheetAccuracy: sampleSize > 0 ? cleanSheetHits / sampleSize : 0,
    sampleSize,
    missingDataRate: computeMissingDataRate(validEntries),
    leagueRanking: aggregateLeagueStats(validEntries, overUnderLine),
    evidenceProviderRanking: aggregateProviderStats(validEntries),
    datasetEntries: validEntries,
  };
}

export function isMarketLearningAllowed(dataMode: FundamentalsBacktestReport["dataMode"]): boolean {
  return dataMode === "live_market_snapshot";
}
