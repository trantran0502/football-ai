import type { HistoricalMatchRecord, MatchResult } from "@/lib/database/matchSchema";
import type { MarketSelection } from "@/types/match";
import {
  evaluateVerifiedMatchForKnowledge,
  accumulateVerifiedMatchesForKnowledge,
} from "./marketKnowledgeAccumulator";
import {
  buildRuleStatistics,
  createMarketKnowledgeBuilder,
  createNotImplementedMarketKnowledgeBuilder,
  resetMarketKnowledgeBuilderSource,
  setMarketKnowledgeBuilderSource,
} from "./marketKnowledgeBuilder";
import {
  updateMarketKnowledgeFromVerifiedMatches,
  traceVerifiedMatchKnowledge,
} from "./marketKnowledgeFromVerified";
import {
  getHistoricalPattern,
  getLeagueStatistics,
  getMarketStatistics,
  getPatternStatistics,
  getRuleStatistics,
  createNotImplementedMarketKnowledgeQueries,
} from "./marketKnowledgeQueries";
import {
  attachKnowledgeSnapshotId,
  buildAndSaveMarketKnowledgeSnapshot,
  buildMarketKnowledgeSnapshot,
  createKnowledgeSnapshotReference,
  MARKET_KNOWLEDGE_SNAPSHOT_VERSION,
} from "./marketKnowledgeSnapshot";
import {
  createInMemoryMarketKnowledgeStore,
  createPlaceholderKnowledgeSnapshot,
  getLatestSnapshot,
  listSnapshots,
  loadSnapshot,
  NOT_IMPLEMENTED_KNOWLEDGE_MESSAGE,
  resetMarketKnowledgeStoreForTests,
  saveSnapshot,
} from "./marketKnowledgeStore";
import {
  createEmptyMarketKnowledgeSnapshot,
  createEmptyMarketStatisticsMap,
  type HistoricalPattern,
  type LeagueStatistics,
  type MarketKnowledgeSnapshot,
  type MarketStatisticsEntry,
  type PatternStatistics,
  type RuleStatistics,
} from "./marketKnowledgeTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNotImplementedResult(
  result: { status: string; message: string; data: unknown },
  label: string
): void {
  assert(result.status === "notImplemented", `${label} status`);
  assert(result.message === NOT_IMPLEMENTED_KNOWLEDGE_MESSAGE, `${label} message`);
  assert(result.data === null, `${label} data null`);
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

function buildVerifiedMatch(id: string): HistoricalMatchRecord {
  const now = "2026-01-15T12:00:00.000Z";
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
      verifiedAt: now,
      backtest: { candidates: [], summary: { totalProfit: 0, totalStake: 0, hitRate: 0, roi: 0 } },
      ruleValidation: { status: "PASS", results: [] },
      recommendationValidation: { entries: [], report: { buckets: [] } },
    } as HistoricalMatchRecord["verificationResult"],
    createdAt: now,
    updatedAt: now,
  };
}

function testTypes(): void {
  const rule: RuleStatistics = {
    ruleId: "LowWaterRule",
    sampleSize: 0,
    hitCount: 0,
    missCount: 0,
    pushCount: 0,
    hitRate: 0,
    roi: 0,
    averageOdds: 0,
    averageConfidence: 0,
    averageMarketScore: 0,
    firstSeen: null,
    lastSeen: null,
    lastUpdated: null,
  };

  const pattern: PatternStatistics = {
    patternId: "HomeLowWaterBalanced",
    sampleSize: 0,
    hitCount: 0,
    totalProfit: 0,
    totalStake: 0,
    hitRate: 0,
    roi: 0,
    averageOdds: 0,
    averageConfidence: 0,
    averageMarketScore: 0,
    bestLeague: null,
    worstLeague: null,
    leagueHitRates: [],
    firstSeen: null,
    lastSeen: null,
  };

  const marketMap = createEmptyMarketStatisticsMap();
  assert(marketMap.AH.marketType === "AH", "market map AH");

  const league: LeagueStatistics = {
    leagueId: "39",
    leagueName: "Premier League",
    marketType: "1X2",
    sampleSize: 0,
    hitRate: 0,
    roi: 0,
    averageOdds: 0,
  };

  const historical: HistoricalPattern = {
    marketType: "AH",
    patternId: "HomeLowWaterBalanced",
    ruleIds: ["LowWaterRule", "BalancedMarketRule"],
    leagueId: "39",
    oddsRange: "0.75-0.95",
    waterRange: "low-mid",
    sampleSize: 0,
    hitRate: 0,
    roi: 0,
    confidence: 0,
  };

  const snapshot: MarketKnowledgeSnapshot = createEmptyMarketKnowledgeSnapshot(
    "snapshot-1",
    new Date().toISOString()
  );

  assert(snapshot.id === "snapshot-1", "snapshot id");
  assert(rule.ruleId === "LowWaterRule", "rule id");
  assert(pattern.patternId === "HomeLowWaterBalanced", "pattern id");
  assert(league.leagueName === "Premier League", "league name");
  assert(historical.patternId === "HomeLowWaterBalanced", "historical pattern id");
}

function testBuilderInterface(): void {
  const stub = createNotImplementedMarketKnowledgeBuilder();
  assertNotImplementedResult(stub.buildRuleStatistics(), "stub builder rule stats");

  resetMarketKnowledgeBuilderSource();
  assertNotImplementedResult(buildRuleStatistics(), "default builder without source");
}

function testStoreInterface(): void {
  resetMarketKnowledgeStoreForTests();
  const store = createInMemoryMarketKnowledgeStore();
  const snapshot = createPlaceholderKnowledgeSnapshot("2026-01-01T00:00:00.000Z");

  const saved = store.saveSnapshot(snapshot);
  assert(saved.id === snapshot.id, "saveSnapshot returns snapshot");
  assert(store.loadSnapshot(snapshot.id)?.id === snapshot.id, "loadSnapshot id");
  assert(store.loadSnapshot("missing-id") === null, "loadSnapshot missing returns null");
  assert(store.listSnapshots().length === 1, "listSnapshots length");
  assert(getLatestSnapshot()?.id === snapshot.id, "getLatestSnapshot");

  resetMarketKnowledgeStoreForTests();
  assert(listSnapshots().length === 0, "reset clears global store");
}

function testQueriesInterfaceWithoutSnapshot(): void {
  resetMarketKnowledgeStoreForTests();
  const queries = createNotImplementedMarketKnowledgeQueries();
  assertNotImplementedResult(queries.getRuleStatistics("LowWaterRule"), "queries rule");
  assertNotImplementedResult(getRuleStatistics("LowWaterRule"), "getRuleStatistics");
}

function testSnapshotHelpers(): void {
  resetMarketKnowledgeStoreForTests();

  const placeholder = buildMarketKnowledgeSnapshot({
    id: "knowledge-v1-test",
    generatedAt: "2026-01-01T00:00:00.000Z",
  });

  assert(placeholder.id === "knowledge-v1-test", "placeholder snapshot id");
  assert(placeholder.status === "notImplemented", "placeholder snapshot not implemented");

  const analysisRef = createKnowledgeSnapshotReference(null);
  const linkedId = attachKnowledgeSnapshotId(analysisRef, placeholder);
  assert(linkedId === placeholder.id, "attach knowledge snapshot id");

  resetMarketKnowledgeStoreForTests();
}

function testVerifiedMatchKnowledgePipeline(): void {
  resetMarketKnowledgeStoreForTests();
  resetMarketKnowledgeBuilderSource();

  const match = buildVerifiedMatch("verified-1");
  const trace = traceVerifiedMatchKnowledge(match);

  assert(trace.triggeredRuleIds.length > 0, "rules triggered on verified match");
  assert(trace.observations.length > 0, "observations created");
  assert(
    trace.observations.some((item) => item.ruleId === "BalancedMarketRule"),
    "balanced rule observation"
  );
  assert(
    trace.observations.some((item) => item.patternId === "BalancedFavorite"),
    "balanced favorite pattern observation"
  );
  assert(trace.observations.some((item) => item.hit), "at least one hit outcome");

  const update = updateMarketKnowledgeFromVerifiedMatches([match], {
    id: "knowledge-from-verified",
    generatedAt: "2026-01-16T00:00:00.000Z",
  });

  assert(update.processedMatches === 1, "processed one verified match");
  assert(update.observationCount > 0, "observations accumulated");
  assert(update.snapshot.status === "available", "snapshot available");
  assert(update.snapshot.version === MARKET_KNOWLEDGE_SNAPSHOT_VERSION, "snapshot version");
  assert(update.snapshot.ruleStatistics.length > 0, "rule statistics populated");
  assert(update.snapshot.patternStatistics.length > 0, "pattern statistics populated");
  assert(update.snapshot.leagueStatistics.length > 0, "league statistics populated");
  assert(update.snapshot.marketStatistics.AH.sampleSize > 0, "AH market stats");

  const ruleStats = getRuleStatistics("BalancedMarketRule");
  assert(ruleStats.status === "available", "query rule stats available");
  assert(ruleStats.data!.sampleSize > 0, "rule sample size");

  const patternStats = getPatternStatistics("BalancedFavorite");
  assert(patternStats.status === "available", "query pattern stats available");
  assert(patternStats.data!.sampleSize > 0, "pattern sample size");

  const leagueStats = getLeagueStatistics("39", "AH");
  assert(leagueStats.status === "available", "query league stats available");
  assert(leagueStats.data!.leagueName === "Premier League", "league name");

  const marketStats = getMarketStatistics("AH");
  assert(marketStats.status === "available", "query market stats available");
  assert(marketStats.data!.sampleSize > 0, "market sample size");

  const historical = getHistoricalPattern({
    marketType: "AH",
    leagueId: "39",
  });
  assert(historical.status === "available", "historical pattern available");

  const builder = createMarketKnowledgeBuilder({ verifiedMatches: [match] });
  const builtRules = builder.buildRuleStatistics();
  assert(builtRules.status === "available", "builder from verified matches");
  assert((builtRules.data ?? []).length > 0, "builder rule data");

  setMarketKnowledgeBuilderSource({ verifiedMatches: [match] });
  const globalRules = buildRuleStatistics();
  assert(globalRules.status === "available", "global builder source");

  const saved = buildAndSaveMarketKnowledgeSnapshot({ verifiedMatches: [match] });
  assert(loadSnapshot(saved.id)?.status === "available", "saved verified snapshot");

  const observations = accumulateVerifiedMatchesForKnowledge([match]);
  assert(observations.every((item) => item.leagueName === "Premier League"), "league on observations");
  assert(observations.every((item) => item.stake === 1), "stake recorded");

  const evaluation = evaluateVerifiedMatchForKnowledge({
    ...match,
    status: "PENDING",
    result: null,
  });
  assert(evaluation.observations.length === 0, "pending match skipped");

  resetMarketKnowledgeStoreForTests();
  resetMarketKnowledgeBuilderSource();
}

export function runMarketKnowledgeTests(): void {
  testTypes();
  testBuilderInterface();
  testStoreInterface();
  testQueriesInterfaceWithoutSnapshot();
  testSnapshotHelpers();
  testVerifiedMatchKnowledgePipeline();
}
