import type { HistoricalMatchRecord, MatchResult } from "@/lib/database/matchSchema";
import type { MarketSelection } from "@/types/match";
import {
  createInMemoryMarketKnowledgeStore,
  resetMarketKnowledgeStoreForTests,
} from "@/lib/recommendation/marketKnowledge/marketKnowledgeStore";
import {
  validateReplayResult,
  validateReplaySnapshots,
} from "./marketKnowledgeReplay";
import {
  buildStatisticsDiff,
  compareKnowledgeSnapshots,
} from "./marketKnowledgeReplayReport";
import { replayMarketKnowledge } from "./marketKnowledgeReplayRunner";

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

function buildVerifiedMatch(id: string, leagueName = "Premier League"): HistoricalMatchRecord {
  const now = "2026-01-15T12:00:00.000Z";
  return {
    id,
    date: "2026-01-15",
    matchDate: "2026-01-15",
    league: leagueName,
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
      verifiedAt: now,
      backtest: { candidates: [], summary: { totalProfit: 0, totalStake: 0, hitRate: 0, roi: 0 } },
      ruleValidation: { status: "PASS", results: [] },
      recommendationValidation: { entries: [], report: { buckets: [] } },
    } as HistoricalMatchRecord["verificationResult"],
    createdAt: now,
    updatedAt: now,
  };
}

function testDryRunReplay(): void {
  resetMarketKnowledgeStoreForTests();
  const store = createInMemoryMarketKnowledgeStore();
  const matches = [
    buildVerifiedMatch("replay-match-1"),
    buildVerifiedMatch("replay-match-2"),
  ];

  const result = replayMarketKnowledge({
    matches,
    startIndex: 0,
    endIndex: 1,
    dryRun: true,
    store,
  });

  assert(result.report.dryRun, "dry run flag");
  assert(result.report.matchesProcessed === 2, "two matches processed");
  assert(result.report.snapshotCount === 2, "two snapshots");
  assert(result.report.steps.length === 2, "two replay steps");
  assert(store.listSnapshots().length === 0, "dry run does not write store");
  assert(result.report.firstSnapshotId !== null, "first snapshot id");
  assert(result.report.lastSnapshotId !== null, "last snapshot id");
  assert(result.report.statisticsDiff !== null, "statistics diff");
  assert(result.report.audit.length === 2, "audit entries");
  assert(result.report.validation.valid, "validation passes");
}

function testRealReplay(): void {
  resetMarketKnowledgeStoreForTests();
  const store = createInMemoryMarketKnowledgeStore();
  const matches = [
    buildVerifiedMatch("replay-real-1"),
    buildVerifiedMatch("replay-real-2"),
    buildVerifiedMatch("replay-real-3"),
  ];

  const result = replayMarketKnowledge({
    matches,
    dryRun: false,
    store,
  });

  assert(!result.report.dryRun, "real replay flag");
  assert(store.listSnapshots().length === 3, "store saved three snapshots");
  assert(result.report.ruleUpdates > 0, "rule updates counted");
  assert(result.report.processingTimeMs >= 0, "processing time recorded");
}

function testReplayStepChanges(): void {
  const matches = [buildVerifiedMatch("step-1"), buildVerifiedMatch("step-2")];
  const result = replayMarketKnowledge({ matches, dryRun: true });

  const step1 = result.report.steps[0];
  const step2 = result.report.steps[1];

  assert(step1.matchId === "step-1", "first step match id");
  assert(step1.ruleChanges.length > 0, "first step rule changes");
  assert(step2.ruleChanges.length >= 0, "second step rule changes");

  const validation = validateReplaySnapshots(result.report.snapshots);
  assert(validation.valid, "snapshot sequence valid");

  for (const rule of result.report.snapshots[1].ruleStatistics) {
    const total = rule.hitCount + rule.missCount + rule.pushCount;
    assert(total === rule.sampleSize, `rule ${rule.ruleId} outcomes sum`);
  }
}

function testStatisticsDiff(): void {
  const matches = [buildVerifiedMatch("diff-1"), buildVerifiedMatch("diff-2")];
  const result = replayMarketKnowledge({ matches, dryRun: true });
  const diff = result.report.statisticsDiff;

  assert(diff !== null, "diff exists");
  assert(diff!.rules.length > 0, "rule diff entries");

  const manualDiff = buildStatisticsDiff(
    result.report.snapshots[0],
    result.report.snapshots[1]
  );
  assert(manualDiff !== null, "manual diff");
  assert(manualDiff!.rules.length === diff!.rules.length, "manual diff rule count");
}

function testReplayAudit(): void {
  const matches = [buildVerifiedMatch("audit-1")];
  const result = replayMarketKnowledge({ matches, dryRun: true });
  const audit = result.report.audit[0];

  assert(audit.matchId === "audit-1", "audit match id");
  assert(audit.updatedRuleIds.length > 0, "audit rule ids");
  assert(audit.snapshotId === result.report.steps[0].snapshotId, "audit snapshot id");
}

function testReplayValidator(): void {
  const matches = [buildVerifiedMatch("valid-1"), buildVerifiedMatch("valid-2")];
  const result = replayMarketKnowledge({ matches, dryRun: true });

  const validation = validateReplayResult({
    steps: result.report.steps,
    snapshots: result.report.snapshots,
    processedMatches: matches,
  });

  assert(validation.valid, `validation errors: ${validation.errors.join("; ")}`);
}

function testCompareSnapshots(): void {
  const matches = [buildVerifiedMatch("compare-1")];
  const result = replayMarketKnowledge({ matches, dryRun: true });
  const changes = compareKnowledgeSnapshots(null, result.report.snapshots[0]);

  assert(changes.ruleChanges.length > 0, "changes from empty snapshot");
  assert(changes.ruleChanges.every((item) => item.previousSampleSize === 0), "from zero");
}

function testReplayRange(): void {
  const matches = [
    buildVerifiedMatch("range-1"),
    buildVerifiedMatch("range-2"),
    buildVerifiedMatch("range-3"),
  ];

  const result = replayMarketKnowledge({
    matches,
    startIndex: 1,
    endIndex: 2,
    dryRun: true,
  });

  assert(result.report.matchesProcessed === 2, "range processed two matches");
  assert(result.report.steps[0].matchId === "range-2", "range starts at index 1");
}

export function runMarketKnowledgeReplayTests(): void {
  testDryRunReplay();
  testRealReplay();
  testReplayStepChanges();
  testStatisticsDiff();
  testReplayAudit();
  testReplayValidator();
  testCompareSnapshots();
  testReplayRange();
}
