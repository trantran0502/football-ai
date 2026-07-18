import type { AnalysisSnapshot, HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { buildMatchHistoryStats } from "@/lib/database/matchSchema";
import {
  buildPendingPolicyMetadata,
  MISSING_FIXTURE_ID_EXCLUSION_REASON,
} from "@/lib/supabase/services/matchRecordPendingPolicy";
import type { MarketSelection } from "@/types/match";

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
  odds: 1.9,
  impliedProbability: 0.526,
};

const MINIMAL_SNAPSHOT = {
  features: [],
  interpretations: [],
  marketAnalysis: {},
  combinedAnalysis: {},
  candidates: [],
  recommendation: null,
  replay: null,
  bettingIntelligence: null,
  decision: null,
  capturedAt: "2026-07-15T10:00:00.000Z",
} as AnalysisSnapshot;

function buildRecord(
  overrides: Partial<HistoricalMatchRecord> = {}
): HistoricalMatchRecord {
  return {
    id: overrides.id ?? "test-record",
    date: overrides.matchDate ?? "2026-07-15",
    matchDate: overrides.matchDate ?? "2026-07-15",
    league: "Test League",
    homeTeam: "Home",
    awayTeam: "Away",
    rawOdds: "sample odds",
    marketSelections: [SETTLEABLE_MARKET],
    result: null,
    analysisSnapshot: MINIMAL_SNAPSHOT,
    candidates: [],
    status: "PENDING",
    verificationResult: null,
    fixtureId: null,
    leagueId: null,
    season: null,
    homeTeamId: null,
    awayTeamId: null,
    source: "app",
    createdAt: "2026-07-15T10:00:00.000Z",
    updatedAt: "2026-07-15T10:00:00.000Z",
    ...overrides,
  };
}

export function runMatchHistoryStatsTests(): void {
  const futurePending = buildRecord({
    id: "future-pending",
    matchDate: "2099-01-01",
    fixtureId: null,
  });
  const retryPending = buildRecord({
    id: "retry-pending",
    matchDate: "2020-01-01",
    fixtureId: 12345,
  });
  const excludedPending = buildRecord({
    id: "excluded-pending",
    matchDate: "2020-01-01",
    fixtureId: null,
    analysisSnapshot: {
      ...MINIMAL_SNAPSHOT,
      pendingPolicy: buildPendingPolicyMetadata(MISSING_FIXTURE_ID_EXCLUSION_REASON),
    },
  });
  const verified = buildRecord({
    id: "verified",
    status: "VERIFIED",
    result: {
      fullTimeHomeGoals: 2,
      fullTimeAwayGoals: 1,
      halfTimeHomeGoals: 1,
      halfTimeAwayGoals: 0,
      winner: "home",
      totalGoals: 3,
      bothTeamsScored: true,
    },
  });

  const records = [futurePending, retryPending, excludedPending, verified];
  const stats = buildMatchHistoryStats(records);

  assert(stats.total === 4, "total should remain records.length");
  assert(stats.pending === 2, "pending should count only truly pending verification records");
  assert(stats.verified === 1, "verified should keep status-based counting");
  assert(stats.failed === 0, "failed should keep status-based counting");
  assert(stats.cancelled === 0, "cancelled should keep status-based counting");
}

if (require.main === module) {
  runMatchHistoryStatsTests();
  console.log("matchSchema.test.ts passed");
}
