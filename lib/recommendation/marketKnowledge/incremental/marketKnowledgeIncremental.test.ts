import type { HistoricalMatchRecord, MatchResult } from "@/lib/database/matchSchema";
import type { MarketSelection } from "@/types/match";
import { buildMarketKnowledgeFromVerifiedMatches } from "../marketKnowledgeFromVerified";
import { computeSnapshotChecksum } from "../persistence/marketKnowledgePersistence";
import { createDefaultSnapshotMetadata } from "../persistence/marketKnowledgeVersioning";
import { createInMemoryMarketKnowledgeRepository } from "../persistence/inMemoryMarketKnowledgeRepository";
import { replayMarketKnowledge } from "../replay/marketKnowledgeReplayRunner";
import type { MarketKnowledgeSnapshot } from "../marketKnowledgeTypes";
import {
  updateMarketKnowledgeIncrementally,
  createBaselineSnapshot,
} from "./marketKnowledgeIncremental";
import { validateIncrementalUpdate } from "./marketKnowledgeIncrementalValidator";
import { MarketKnowledgeIncrementalValidationError } from "./marketKnowledgeIncrementalTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function selection(
  partial: Pick<MarketSelection, "marketType" | "side" | "odds"> &
    Partial<MarketSelection>
): MarketSelection {
  return {
    marketFamily: partial.marketFamily ?? "moneyline",
    title: partial.title ?? "Market",
    period: partial.period ?? "full",
    rawLine: partial.rawLine ?? null,
    line: partial.line ?? null,
    modifier: partial.modifier ?? null,
    ...partial,
  };
}

function buildVerifiedMatchResult(): MatchResult {
  return {
    fullTimeHomeGoals: 2,
    fullTimeAwayGoals: 1,
    halfTimeHomeGoals: 1,
    halfTimeAwayGoals: 0,
    winner: "home",
    totalGoals: 3,
    bothTeamsScored: true,
  };
}

function buildVerifiedMatch(
  id: string,
  verifiedAt = "2026-01-15T12:00:00.000Z"
): HistoricalMatchRecord {
  return {
    id,
    date: "2026-01-15",
    matchDate: "2026-01-15",
    league: "Premier League",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    rawOdds: "multi",
    leagueId: 39,
    marketSelections: [
      selection({
        marketType: "moneyline",
        marketFamily: "moneyline",
        side: "home",
        odds: 1.85,
        impliedProbability: 0.54,
      }),
      selection({
        marketType: "moneyline",
        marketFamily: "moneyline",
        side: "draw",
        odds: 3.4,
        impliedProbability: 0.29,
      }),
      selection({
        marketType: "moneyline",
        marketFamily: "moneyline",
        side: "away",
        odds: 4.2,
        impliedProbability: 0.24,
      }),
      selection({
        marketType: "handicap",
        marketFamily: "asianHandicap",
        title: "AH",
        side: "home",
        odds: 0.92,
        line: -0.5,
        rawLine: "-0.5",
        modifier: "plain",
        impliedProbability: 0.521,
      }),
      selection({
        marketType: "handicap",
        marketFamily: "asianHandicap",
        title: "AH",
        side: "away",
        odds: 0.94,
        line: 0.5,
        rawLine: "+0.5",
        modifier: "plain",
        impliedProbability: 0.515,
      }),
      selection({
        marketType: "totalGoals",
        marketFamily: "asianOverUnder",
        title: "O/U",
        side: "over",
        odds: 0.9,
        line: 2.5,
        rawLine: "2.5",
        modifier: "plain",
        impliedProbability: 0.526,
      }),
      selection({
        marketType: "totalGoals",
        marketFamily: "asianOverUnder",
        title: "O/U",
        side: "under",
        odds: 0.92,
        line: 2.5,
        rawLine: "2.5",
        modifier: "plain",
        impliedProbability: 0.515,
      }),
      selection({
        marketType: "btts",
        marketFamily: "btts",
        side: "yes",
        odds: 0.88,
        impliedProbability: 0.532,
      }),
      selection({
        marketType: "btts",
        marketFamily: "btts",
        side: "no",
        odds: 0.9,
        impliedProbability: 0.526,
      }),
    ],
    result: buildVerifiedMatchResult(),
    analysisSnapshot: null,
    candidates: [],
    status: "VERIFIED",
    verificationResult: {
      verifiedAt,
      backtest: { candidates: [], summary: { totalProfit: 0, totalStake: 0, hitRate: 0, roi: 0 } },
      ruleValidation: { status: "PASS", results: [] },
      recommendationValidation: { entries: [], report: { buckets: [] } },
    } as HistoricalMatchRecord["verificationResult"],
    createdAt: verifiedAt,
    updatedAt: verifiedAt,
  };
}

function normalizeSnapshotForChecksum(
  snapshot: MarketKnowledgeSnapshot,
  matchCount: number
): { snapshot: MarketKnowledgeSnapshot; metadata: ReturnType<typeof createDefaultSnapshotMetadata> } {
  const metadata = createDefaultSnapshotMetadata({
    source: "MANUAL",
    matchCount,
    firstMatchId: "normalized-first",
    lastMatchId: "normalized-last",
    parentSnapshotId: null,
  });

  return {
    snapshot: {
      ...snapshot,
      id: "normalized-snapshot",
      generatedAt: "2026-01-15T12:00:00.000Z",
      metadata: undefined,
    },
    metadata,
  };
}

function statisticsChecksum(snapshot: MarketKnowledgeSnapshot, matchCount: number): string {
  const normalized = normalizeSnapshotForChecksum(snapshot, matchCount);
  return computeSnapshotChecksum(normalized.snapshot, normalized.metadata);
}

function assertStatisticsEqual(
  left: MarketKnowledgeSnapshot,
  right: MarketKnowledgeSnapshot,
  label: string
): void {
  assert(
    JSON.stringify(left.ruleStatistics) === JSON.stringify(right.ruleStatistics),
    `${label} rule statistics`
  );
  assert(
    JSON.stringify(left.patternStatistics) === JSON.stringify(right.patternStatistics),
    `${label} pattern statistics`
  );
  assert(
    JSON.stringify(left.marketStatistics) === JSON.stringify(right.marketStatistics),
    `${label} market statistics`
  );
  assert(
    JSON.stringify(left.leagueStatistics) === JSON.stringify(right.leagueStatistics),
    `${label} league statistics`
  );
  assert(
    JSON.stringify(left.historicalPatterns) === JSON.stringify(right.historicalPatterns),
    `${label} historical patterns`
  );
}

function testIncrementalSingleMatch(): void {
  const match = buildVerifiedMatch("inc-single-1");
  const result = updateMarketKnowledgeIncrementally({
    latestSnapshot: null,
    verifiedMatch: match,
  });

  assert(!result.skipped, "single match not skipped");
  assert(result.report.updatedRules.length > 0, "single match updated rules");
  assert(result.report.parentSnapshotId === null, "single match parent null");
  assert(result.snapshot.id !== "", "single match snapshot id");
}

function testIncrementalMultipleMatches(): void {
  let latest: MarketKnowledgeSnapshot | null = null;
  const matches = [
    buildVerifiedMatch("inc-multi-1", "2026-01-15T10:00:00.000Z"),
    buildVerifiedMatch("inc-multi-2", "2026-01-15T11:00:00.000Z"),
    buildVerifiedMatch("inc-multi-3", "2026-01-15T12:00:00.000Z"),
  ];

  for (const match of matches) {
    const result = updateMarketKnowledgeIncrementally({
      latestSnapshot: latest,
      verifiedMatch: match,
    });
    assert(!result.skipped, `multi match ${match.id} not skipped`);
    assert(result.report.parentSnapshotId === (latest?.id ?? null), "parent chain");
    latest = result.snapshot;
  }

  assert(latest !== null, "latest snapshot exists");
  assert(latest!.ruleStatistics.length > 0, "multi match rules populated");
}

function testIncrementalValidatorAndReport(): void {
  const match = buildVerifiedMatch("inc-valid-1");
  const baseline = createBaselineSnapshot("2026-01-15T12:00:00.000Z");
  const result = updateMarketKnowledgeIncrementally({
    latestSnapshot: baseline,
    verifiedMatch: match,
  });

  validateIncrementalUpdate({
    previousSnapshot: baseline,
    nextSnapshot: result.snapshot,
    observations: [],
    report: result.report,
  });

  assert(result.report.newSnapshotId === result.snapshot.id, "report snapshot id");
  assert(result.report.processingTimeMs >= 0, "report processing time");
}

function testIncrementalParentSnapshotChain(): void {
  const repository = createInMemoryMarketKnowledgeRepository();
  let latest: MarketKnowledgeSnapshot | null = null;
  const matches = [
    buildVerifiedMatch("inc-parent-1", "2026-01-15T10:00:00.000Z"),
    buildVerifiedMatch("inc-parent-2", "2026-01-15T11:00:00.000Z"),
  ];

  for (const match of matches) {
    const result = updateMarketKnowledgeIncrementally({
      latestSnapshot: latest,
      verifiedMatch: match,
      repository,
    });
    latest = result.snapshot;
  }

  const loaded = repository.loadLatestSnapshot();
  assert(loaded?.metadata?.parentSnapshotId !== null, "repository parent snapshot");
  assert(loaded?.metadata?.source === "INCREMENTAL", "repository incremental source");
  assert(loaded?.metadata?.matchCount === 2, "repository match count");
}

function testReplayVsIncrementalConsistency(): void {
  const matches = Array.from({ length: 6 }, (_, index) =>
    buildVerifiedMatch(
      `consistency-${index + 1}`,
      `2026-01-${String(10 + index).padStart(2, "0")}T12:00:00.000Z`
    )
  );

  const replayResult = replayMarketKnowledge({
    matches,
    dryRun: true,
  });
  const replayFinal = replayResult.report.snapshots[replayResult.report.snapshots.length - 1];

  let incrementalLatest: MarketKnowledgeSnapshot | null = null;
  for (const match of matches) {
    const result = updateMarketKnowledgeIncrementally({
      latestSnapshot: incrementalLatest,
      verifiedMatch: match,
      generatedAt: match.verificationResult?.verifiedAt,
    });
    incrementalLatest = result.snapshot;
  }

  const batchFinal = buildMarketKnowledgeFromVerifiedMatches(matches, {
    generatedAt: matches[matches.length - 1].verificationResult?.verifiedAt,
  });

  assertStatisticsEqual(replayFinal, incrementalLatest!, "replay vs incremental");
  assertStatisticsEqual(batchFinal, incrementalLatest!, "batch vs incremental");

  const replayChecksum = statisticsChecksum(replayFinal, matches.length);
  const incrementalChecksum = statisticsChecksum(incrementalLatest!, matches.length);
  assert(replayChecksum === incrementalChecksum, "replay vs incremental checksum");
}

function testIncrementalRepositorySave(): void {
  const repository = createInMemoryMarketKnowledgeRepository();
  const match = buildVerifiedMatch("inc-repo-1");

  updateMarketKnowledgeIncrementally({
    latestSnapshot: null,
    verifiedMatch: match,
    repository,
  });

  assert(repository.listSnapshots().length === 1, "repository saved incremental snapshot");
  assert(repository.getManifest().snapshotCount === 1, "manifest updated");
}

function testIncrementalValidatorRejectsBadParent(): void {
  const match = buildVerifiedMatch("inc-bad-parent");
  const result = updateMarketKnowledgeIncrementally({
    latestSnapshot: null,
    verifiedMatch: match,
  });

  try {
    validateIncrementalUpdate({
      previousSnapshot: null,
      nextSnapshot: result.snapshot,
      observations: [],
      report: {
        ...result.report,
        parentSnapshotId: "wrong-parent",
      },
    });
    throw new Error("expected validation failure");
  } catch (error) {
    assert(
      error instanceof MarketKnowledgeIncrementalValidationError,
      "validation error type"
    );
  }
}

export function runMarketKnowledgeIncrementalTests(): void {
  testIncrementalSingleMatch();
  testIncrementalMultipleMatches();
  testIncrementalValidatorAndReport();
  testIncrementalParentSnapshotChain();
  testReplayVsIncrementalConsistency();
  testIncrementalRepositorySave();
  testIncrementalValidatorRejectsBadParent();
}
