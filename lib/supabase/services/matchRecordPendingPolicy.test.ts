import type { AnalysisSnapshot, HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  buildPendingPolicyMetadata,
  countOperationallyExcludedRecords,
  countTrulyPendingVerification,
  filterTrulyPendingVerificationRecords,
  getPendingExclusionReason,
  HISTORICAL_PENDING_CLEANUP_SOURCE,
  isLegacyUnverifiablePendingRecord,
  isOperationallyExcluded,
  isTrulyPendingVerification,
  isVerifiablePendingRetryCandidate,
  MISSING_FIXTURE_ID_EXCLUSION_REASON,
} from "@/lib/supabase/services/matchRecordPendingPolicy";
import { listPendingProductionMatches } from "@/lib/production/resultUpdatePipeline";
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

function withPendingPolicy(
  record: HistoricalMatchRecord,
  reason = MISSING_FIXTURE_ID_EXCLUSION_REASON
): HistoricalMatchRecord {
  return {
    ...record,
    analysisSnapshot: {
      ...MINIMAL_SNAPSHOT,
      ...record.analysisSnapshot,
      dataCompleteness: record.analysisSnapshot?.dataCompleteness,
      pendingPolicy: buildPendingPolicyMetadata(reason),
    },
  };
}

export function runMatchRecordPendingPolicyTests(): void {
  const now = new Date("2026-07-19T12:00:00.000Z");

  const futurePending = buildRecord({ matchDate: "2026-07-20", fixtureId: null });
  assert(isTrulyPendingVerification(futurePending, now), "future PENDING should count");
  assert(!isOperationallyExcluded(futurePending), "future PENDING is not an anomaly");

  const retryPending = buildRecord({ matchDate: "2026-07-15", fixtureId: 12345 });
  assert(isTrulyPendingVerification(retryPending, now), "past PENDING with fixture should count");
  assert(
    isVerifiablePendingRetryCandidate(retryPending, now),
    "past PENDING with fixture should be retry candidate"
  );

  const legacyPending = buildRecord({ matchDate: "2026-07-15", fixtureId: null });
  assert(!isTrulyPendingVerification(legacyPending, now), "legacy stuck PENDING should not count");
  assert(
    isLegacyUnverifiablePendingRecord(legacyPending, now),
    "legacy stuck record should be cleanup candidate"
  );

  const excludedPending = withPendingPolicy(legacyPending);
  assert(isOperationallyExcluded(excludedPending), "metadata excluded record is operational anomaly");
  assert(
    !isTrulyPendingVerification(excludedPending, now),
    "metadata excluded record should not count as pending"
  );
  assert(
    getPendingExclusionReason(excludedPending) === MISSING_FIXTURE_ID_EXCLUSION_REASON,
    "exclusion reason should be readable"
  );
  assert(
    !isLegacyUnverifiablePendingRecord(excludedPending, now),
    "already excluded legacy record should not be cleanup candidate again"
  );

  const verified = buildRecord({ status: "VERIFIED", result: {
    fullTimeHomeGoals: 1,
    fullTimeAwayGoals: 0,
    halfTimeHomeGoals: 1,
    halfTimeAwayGoals: 0,
    winner: "home",
    totalGoals: 1,
    bothTeamsScored: false,
  } });
  assert(!isTrulyPendingVerification(verified, now), "VERIFIED should not count as pending");
  assert(!isOperationallyExcluded(verified), "VERIFIED should not count as anomaly");

  const failed = buildRecord({ status: "FAILED" });
  assert(!isTrulyPendingVerification(failed, now), "FAILED should not count as pending");

  const cancelled = buildRecord({ status: "CANCELLED" });
  assert(!isTrulyPendingVerification(cancelled, now), "CANCELLED should not count as pending");

  const records = [
    futurePending,
    retryPending,
    legacyPending,
    excludedPending,
    verified,
  ];
  assert(
    countTrulyPendingVerification(records, now) === 2,
    "pending count should include only future and retryable records"
  );
  assert(
    countOperationallyExcludedRecords(records) === 1,
    "anomaly count should include metadata excluded records only"
  );

  const schedulerPending = listPendingProductionMatches(records, now);
  assert(schedulerPending.length === 2, "result pipeline pending list should use centralized policy");
  assert(
    filterTrulyPendingVerificationRecords(records, now).every(
      (record) => record.status === "PENDING"
    ),
    "scheduler pending list should still contain PENDING records only"
  );
  assert(
    !schedulerPending.some((record) => isOperationallyExcluded(record)),
    "metadata excluded record should not enter result scheduler"
  );

  const staleWarningCandidates = [
    withPendingPolicy(buildRecord({ matchDate: "2019-01-01" })),
    buildRecord({ matchDate: "2019-01-01", fixtureId: null }),
  ];
  const actionableStale = staleWarningCandidates.filter(
    (record) => !isOperationallyExcluded(record)
  );
  assert(actionableStale.length === 1, "metadata excluded stale pending should not trigger warning");

  assert(
    buildPendingPolicyMetadata(MISSING_FIXTURE_ID_EXCLUSION_REASON).source ===
      HISTORICAL_PENDING_CLEANUP_SOURCE,
    "pending policy metadata should use cleanup source"
  );
}

if (require.main === module) {
  runMatchRecordPendingPolicyTests();
  console.log("matchRecordPendingPolicy.test.ts passed");
}
