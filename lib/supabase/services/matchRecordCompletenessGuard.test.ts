import type { AnalysisReport } from "@/lib/analysis/types";
import type {
  HistoricalMatchRecord,
  SaveMatchInput,
} from "@/lib/database/matchSchema";
import { buildMatchResult, createAnalysisSnapshotFromReport } from "@/lib/database/matchSchema";
import { runDecisionV3ReplayValidation } from "@/lib/replay/v3/decisionV3ReplayValidationRunner";
import type { MarketSelection } from "@/types/match";
import {
  assessAnalysisCompleteness,
  buildEnrichedHistoricalBackfillRecord,
  HISTORICAL_BACKFILL_SOURCE,
  isIncompleteHistoricalBackfillRecord,
} from "@/lib/supabase/services/matchRecordCompletenessGuard";
import type { MatchRecordPersistenceDependencies } from "@/lib/supabase/services/matchRecordService";
import {
  saveMatchFromAnalysisInSupabase,
  saveMatchIfNewInSupabase,
} from "@/lib/supabase/services/matchRecordService";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const SETTLEABLE_MARKET: MarketSelection = {
  marketType: "moneyline",
  marketFamily: "moneyline",
  title: "Moneyline",
  period: "full",
  side: "home",
  line: null,
  rawLine: null,
  modifier: null,
  odds: 1.95,
  impliedProbability: 0.51,
};

function buildBackfillRecord(
  overrides: Partial<HistoricalMatchRecord> = {}
): HistoricalMatchRecord {
  return {
    id: "backfill-record-1",
    date: "2026-07-17",
    matchDate: "2026-07-17",
    league: "Serie B",
    homeTeam: "Juventude",
    awayTeam: "Cuiaba",
    rawOdds: "",
    marketSelections: [],
    candidates: [],
    analysisSnapshot: null,
    result: buildMatchResult({
      fullTimeHomeGoals: 2,
      fullTimeAwayGoals: 1,
      halfTimeHomeGoals: 1,
      halfTimeAwayGoals: 0,
    }),
    status: "VERIFIED",
    verificationResult: {
      verifiedAt: "2026-07-17T20:00:00.000Z",
      backtest: {
        bets: 0,
        passes: 0,
        wins: 0,
        halfWins: 0,
        pushes: 0,
        halfLosses: 0,
        losses: 0,
        hitRate: 0,
        roi: 0,
        netUnits: 0,
        averageOdds: 0,
        maxDrawdown: 0,
      },
      ruleValidation: {
        status: "pass",
        violations: [],
        summary: "",
      },
      recommendationValidation: {
        status: "pass",
        entries: [],
        summary: "",
      },
    },
    fixtureId: 1520775,
    leagueId: 72,
    season: 2026,
    homeTeamId: 1,
    awayTeamId: 2,
    source: HISTORICAL_BACKFILL_SOURCE,
    createdAt: "2026-07-17T10:00:00.000Z",
    updatedAt: "2026-07-17T12:00:00.000Z",
    ...overrides,
  };
}

function buildCompleteSaveInput(
  overrides: Partial<SaveMatchInput> = {}
): SaveMatchInput {
  const snapshot = createAnalysisSnapshotFromReport(
    {
      match: {
        league: "Serie B",
        homeTeam: "Juventude",
        awayTeam: "Cuiaba",
        fixtureId: 1520775,
      },
      markets: [SETTLEABLE_MARKET],
      features: [],
      interpretations: [],
      marketAnalysis: { markets: [], summary: "" },
      combinedAnalysis: { summary: "", score: 0, confidence: 0 },
      crossMarketValidation: { status: "pass", issues: [] },
      candidates: [],
      recommendation: null,
    } as AnalysisReport,
    "2026-07-18T08:00:00.000Z",
    "analysis-record-1",
    "2026-07-17"
  );

  return {
    date: "2026-07-17",
    matchDate: "2026-07-17",
    league: "Serie B",
    homeTeam: "Juventude",
    awayTeam: "Cuiaba",
    rawOdds: "Juventude vs Cuiaba\n主 1.95",
    marketSelections: [SETTLEABLE_MARKET],
    analysis: snapshot,
    candidates: [],
    status: "PENDING",
    fixtureId: 1520775,
    leagueId: 72,
    season: 2026,
    homeTeamId: 1,
    awayTeamId: 2,
    ...overrides,
  };
}

function createMockPersistence(initial: HistoricalMatchRecord[] = []) {
  const records = new Map(initial.map((record) => [record.id, structuredClone(record)]));

  const deps: MatchRecordPersistenceDependencies = {
    findByFixtureId: async (fixtureId) => {
      for (const record of records.values()) {
        if (record.fixtureId === fixtureId) {
          return structuredClone(record);
        }
      }
      return null;
    },
    findByKey: async (matchDate, homeTeam, awayTeam) => {
      for (const record of records.values()) {
        if (
          record.matchDate === matchDate &&
          record.homeTeam === homeTeam &&
          record.awayTeam === awayTeam &&
          record.status !== "CANCELLED"
        ) {
          return structuredClone(record);
        }
      }
      return null;
    },
    insert: async (record) => {
      if (records.has(record.id)) {
        throw new Error("duplicate insert");
      }
      records.set(record.id, structuredClone(record));
      return structuredClone(record);
    },
    update: async (record) => {
      if (!records.has(record.id)) {
        return null;
      }
      records.set(record.id, structuredClone(record));
      return structuredClone(record);
    },
  };

  return {
    deps,
    list: () => [...records.values()].map((record) => structuredClone(record)),
    count: () => records.size,
  };
}

async function testInsertWhenNoExistingRecord(): Promise<void> {
  const store = createMockPersistence();
  const outcome = await saveMatchIfNewInSupabase(buildCompleteSaveInput(), store.deps);
  assert(outcome.status === "created", "should insert new record");
  assert(store.count() === 1, "single row");
}

async function testDuplicateSkipForCompleteRecord(): Promise<void> {
  const existing = {
    ...buildCompleteSaveInput(),
    id: "complete-record",
    status: "PENDING" as const,
    source: "app",
    createdAt: "2026-07-17T09:00:00.000Z",
    updatedAt: "2026-07-17T09:00:00.000Z",
    result: null,
    verificationResult: null,
  };
  const store = createMockPersistence([
    normalizeRecord(existing),
  ]);
  const outcome = await saveMatchIfNewInSupabase(buildCompleteSaveInput({ id: "new-id" }), store.deps);
  assert(outcome.status === "duplicate", "complete record should skip");
  assert(store.count() === 1, "no duplicate row");
}

function normalizeRecord(input: SaveMatchInput & { id: string }): HistoricalMatchRecord {
  const snapshot =
    input.analysis && "capturedAt" in input.analysis ? input.analysis : null;
  return {
    id: input.id,
    date: input.matchDate ?? input.date,
    matchDate: input.matchDate ?? input.date,
    league: input.league,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    rawOdds: input.rawOdds,
    marketSelections: input.marketSelections,
    candidates: input.candidates ?? [],
    analysisSnapshot: snapshot,
    result: null,
    status: input.status ?? "PENDING",
    verificationResult: null,
    fixtureId: input.fixtureId ?? null,
    leagueId: input.leagueId ?? null,
    season: input.season ?? null,
    homeTeamId: input.homeTeamId ?? null,
    awayTeamId: input.awayTeamId ?? null,
    source: "app",
    createdAt: "2026-07-17T09:00:00.000Z",
    updatedAt: "2026-07-17T09:00:00.000Z",
  };
}

async function testEnrichmentUpdatesIncompleteBackfill(): Promise<void> {
  const store = createMockPersistence([buildBackfillRecord()]);
  const outcome = await saveMatchIfNewInSupabase(buildCompleteSaveInput(), store.deps);
  assert(outcome.status === "enriched", "should enrich backfill record");
  assert(store.count() === 1, "no duplicate row");
  const saved = store.list()[0];
  assert(saved.rawOdds.trim().length > 0, "raw odds enriched");
  assert(saved.marketSelections.length === 1, "market selections enriched");
  assert(saved.analysisSnapshot !== null, "analysis snapshot enriched");
  assert(
    saved.analysisSnapshot?.dataCompleteness?.analysisEnriched === true,
    "analysis enriched metadata"
  );
  assert(saved.source === HISTORICAL_BACKFILL_SOURCE, "source preserved");
}

async function testEnrichmentPreservesResultStatusCreatedAtVerification(): Promise<void> {
  const backfill = buildBackfillRecord();
  const store = createMockPersistence([backfill]);
  const outcome = await saveMatchIfNewInSupabase(buildCompleteSaveInput(), store.deps);
  assert(outcome.status === "enriched", "enriched");
  const saved = outcome.record;
  assert(saved.result?.fullTimeHomeGoals === 2, "result preserved");
  assert(saved.status === "VERIFIED", "status preserved");
  assert(saved.createdAt === backfill.createdAt, "createdAt preserved");
  assert(saved.verificationResult !== null, "verification preserved");
}

async function testRejectWhenRawOddsMissing(): Promise<void> {
  const store = createMockPersistence([buildBackfillRecord()]);
  const outcome = await saveMatchIfNewInSupabase(
    buildCompleteSaveInput({ rawOdds: "   " }),
    store.deps
  );
  assert(outcome.status === "incomplete_analysis_rejected", "reject missing odds");
  assert(outcome.reason === "oddsMissing", "odds reason");
  assert(store.list()[0].rawOdds === "", "existing row unchanged");
}

async function testRejectWhenNoSettleableMarket(): Promise<void> {
  const store = createMockPersistence([buildBackfillRecord()]);
  const outcome = await saveMatchIfNewInSupabase(
    buildCompleteSaveInput({
      marketSelections: [
        {
          ...SETTLEABLE_MARKET,
          marketType: "corners",
          marketFamily: "corners",
          odds: 1.9,
        },
      ],
    }),
    store.deps
  );
  assert(outcome.status === "incomplete_analysis_rejected", "reject non-settleable");
  assert(outcome.reason === "settleableMarketMissing", "settleable reason");
}

async function testRejectWhenAnalysisSnapshotMissing(): Promise<void> {
  const issue = assessAnalysisCompleteness({
    rawOdds: "sample",
    marketSelections: [SETTLEABLE_MARKET],
    analysisSnapshot: null,
  });
  assert(issue === "analysisSnapshotMissing", "snapshot completeness check");
}

async function testConflictingPartialRecordNotOverwritten(): Promise<void> {
  const store = createMockPersistence([
    buildBackfillRecord({
      rawOdds: "partial odds only",
      marketSelections: [],
      analysisSnapshot: null,
    }),
  ]);
  const outcome = await saveMatchIfNewInSupabase(buildCompleteSaveInput(), store.deps);
  assert(outcome.status === "conflicting_record", "conflict on partial backfill");
  assert(store.list()[0].rawOdds === "partial odds only", "not overwritten");
}

async function testSaveMatchFromAnalysisUsesFixtureLookup(): Promise<void> {
  const store = createMockPersistence([buildBackfillRecord()]);
  const report = {
    match: {
      league: "Serie B",
      homeTeam: "Juventude",
      awayTeam: "Cuiaba",
      fixtureId: 1520775,
    },
    markets: [SETTLEABLE_MARKET],
    features: [],
    interpretations: [],
    marketAnalysis: { markets: [], summary: "" },
    combinedAnalysis: { summary: "", score: 0, confidence: 0 },
    crossMarketValidation: { status: "pass", issues: [] },
    candidates: [],
    recommendation: null,
  } as AnalysisReport;
  const outcome = await saveMatchFromAnalysisInSupabase(
    "Juventude vs Cuiaba\n主 1.95",
    report,
    "2026-07-17",
    store.deps
  );
  assert(outcome.status === "enriched", "analysis save enriches backfill");
}

function testReplayRegressionUnchanged(): void {
  const run = runDecisionV3ReplayValidation({
    records: [buildBackfillRecord()],
    options: { includeMockFixtures: false },
  });
  assert(run.report.dataset.totalRecords === 1, "replay total unchanged");
}

function testGuardHelpers(): void {
  assert(
    isIncompleteHistoricalBackfillRecord(buildBackfillRecord()),
    "backfill incomplete helper"
  );
  const enriched = buildEnrichedHistoricalBackfillRecord(
    buildBackfillRecord(),
    buildCompleteSaveInput(),
    buildCompleteSaveInput().analysis as NonNullable<SaveMatchInput["analysis"]> & {
      capturedAt: string;
    },
    "2026-07-18T08:00:00.000Z"
  );
  assert(enriched.analysisSnapshot?.dataCompleteness?.enrichedFrom === HISTORICAL_BACKFILL_SOURCE, "metadata");
}

export async function runMatchRecordCompletenessGuardTests(): Promise<void> {
  await testInsertWhenNoExistingRecord();
  await testDuplicateSkipForCompleteRecord();
  await testEnrichmentUpdatesIncompleteBackfill();
  await testEnrichmentPreservesResultStatusCreatedAtVerification();
  await testRejectWhenRawOddsMissing();
  await testRejectWhenNoSettleableMarket();
  await testRejectWhenAnalysisSnapshotMissing();
  await testConflictingPartialRecordNotOverwritten();
  await testSaveMatchFromAnalysisUsesFixtureLookup();
  testReplayRegressionUnchanged();
  testGuardHelpers();
}

void runMatchRecordCompletenessGuardTests()
  .then(() => {
    console.log("Match record completeness guard tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
