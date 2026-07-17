import {
  buildLeagueStatistics,
  buildMarketStatistics,
  buildPatternStatistics,
  buildRuleStatistics,
  createNotImplementedMarketKnowledgeBuilder,
} from "./marketKnowledgeBuilder";
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
    hitRate: 0,
    roi: 0,
    averageOdds: 0,
    averageConfidence: 0,
    averageMarketScore: 0,
    bestLeague: null,
    worstLeague: null,
    firstSeen: null,
    lastSeen: null,
  };

  const marketMap = createEmptyMarketStatisticsMap();
  assert(marketMap.AH.marketType === "AH", "market map AH");
  assert(marketMap["O/U"].marketType === "O/U", "market map O/U");

  const marketEntry: MarketStatisticsEntry = marketMap.BTTS;
  assert(marketEntry.sampleSize === 0, "market entry defaults");

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
  assert(snapshot.status === "notImplemented", "snapshot status");
  assert(snapshot.ruleStatistics.length === 0, "snapshot rule stats empty");
  assert(rule.ruleId === "LowWaterRule", "rule id");
  assert(pattern.patternId === "HomeLowWaterBalanced", "pattern id");
  assert(league.leagueName === "Premier League", "league name");
  assert(historical.patternId === "HomeLowWaterBalanced", "historical pattern id");
}

function testBuilderInterface(): void {
  const builder = createNotImplementedMarketKnowledgeBuilder();

  assertNotImplementedResult(builder.buildRuleStatistics(), "builder rule stats");
  assertNotImplementedResult(builder.buildPatternStatistics(), "builder pattern stats");
  assertNotImplementedResult(builder.buildLeagueStatistics(), "builder league stats");
  assertNotImplementedResult(builder.buildMarketStatistics(), "builder market stats");

  assertNotImplementedResult(buildRuleStatistics(), "buildRuleStatistics");
  assertNotImplementedResult(buildPatternStatistics(), "buildPatternStatistics");
  assertNotImplementedResult(buildLeagueStatistics(), "buildLeagueStatistics");
  assertNotImplementedResult(buildMarketStatistics(), "buildMarketStatistics");
}

function testStoreInterface(): void {
  resetMarketKnowledgeStoreForTests();
  const store = createInMemoryMarketKnowledgeStore();
  const snapshot = createPlaceholderKnowledgeSnapshot("2026-01-01T00:00:00.000Z");

  const saved = store.saveSnapshot(snapshot);
  assert(saved.id === snapshot.id, "saveSnapshot returns snapshot");

  const loaded = store.loadSnapshot(snapshot.id);
  assert(loaded !== null, "loadSnapshot finds snapshot");
  assert(loaded!.id === snapshot.id, "loadSnapshot id");

  const missing = store.loadSnapshot("missing-id");
  assert(missing === null, "loadSnapshot missing returns null");

  const listed = store.listSnapshots();
  assert(listed.length === 1, "listSnapshots length");
  assert(listed[0]?.id === snapshot.id, "listSnapshots id");

  resetMarketKnowledgeStoreForTests();
  assert(listSnapshots().length === 0, "reset clears global store");
}

function testQueriesInterface(): void {
  const queries = createNotImplementedMarketKnowledgeQueries();

  assertNotImplementedResult(queries.getRuleStatistics("LowWaterRule"), "queries rule");
  assertNotImplementedResult(
    queries.getPatternStatistics("HomeLowWaterBalanced"),
    "queries pattern"
  );
  assertNotImplementedResult(queries.getLeagueStatistics("39", "1X2"), "queries league");
  assertNotImplementedResult(queries.getMarketStatistics("AH"), "queries market");
  assertNotImplementedResult(
    queries.getHistoricalPattern({ patternId: "HomeLowWaterBalanced" }),
    "queries historical"
  );

  assertNotImplementedResult(getRuleStatistics("LowWaterRule"), "getRuleStatistics");
  assertNotImplementedResult(
    getPatternStatistics("HomeLowWaterBalanced"),
    "getPatternStatistics"
  );
  assertNotImplementedResult(getLeagueStatistics("39", "AH"), "getLeagueStatistics");
  assertNotImplementedResult(getMarketStatistics("BTTS"), "getMarketStatistics");
  assertNotImplementedResult(
    getHistoricalPattern({ marketType: "O/U", ruleIds: ["OddsGapRule"] }),
    "getHistoricalPattern"
  );
}

function testSnapshotHelpers(): void {
  resetMarketKnowledgeStoreForTests();

  const snapshot = buildMarketKnowledgeSnapshot({
    id: "knowledge-v1-test",
    generatedAt: "2026-01-01T00:00:00.000Z",
  });

  assert(snapshot.id === "knowledge-v1-test", "build snapshot id");
  assert(snapshot.version === MARKET_KNOWLEDGE_SNAPSHOT_VERSION, "snapshot version");
  assert(snapshot.status === "notImplemented", "build snapshot not implemented");

  const saved = buildAndSaveMarketKnowledgeSnapshot({
    id: "knowledge-v1-saved",
    generatedAt: "2026-01-02T00:00:00.000Z",
  });
  assert(loadSnapshot(saved.id)?.id === saved.id, "buildAndSave snapshot");

  const analysisRef = createKnowledgeSnapshotReference(null);
  const linkedId = attachKnowledgeSnapshotId(analysisRef, saved);
  assert(linkedId === saved.id, "attach knowledge snapshot id");
  assert(analysisRef.knowledgeSnapshotId === saved.id, "analysis ref updated");

  resetMarketKnowledgeStoreForTests();
}

export function runMarketKnowledgeTests(): void {
  testTypes();
  testBuilderInterface();
  testStoreInterface();
  testQueriesInterface();
  testSnapshotHelpers();
}
