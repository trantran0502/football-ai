import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type {
  DecisionV3ReplayExclusionReason,
  DecisionV3ReplayValidationOptions,
} from "@/lib/replay/v3/decisionV3ReplayValidationTypes";
import type { MarketSelection } from "@/types/match";

const SETTLEABLE_MARKET_TYPES = new Set<MarketSelection["marketType"]>([
  "moneyline",
  "handicap",
  "totalGoals",
  "btts",
]);

export interface DecisionV3ReplayEligibilityResult {
  eligible: boolean;
  reason?: DecisionV3ReplayExclusionReason;
}

export function isMockValidationRecord(record: HistoricalMatchRecord): boolean {
  if (record.id.startsWith("sv-fix-")) {
    return true;
  }

  const replaySource = record.analysisSnapshot?.replay?.match?.matchId;
  if (replaySource?.startsWith("sv-fix-")) {
    return true;
  }

  return false;
}

export function hasSettleableMarket(marketSelections: MarketSelection[]): boolean {
  return marketSelections.some(
    (selection) =>
      SETTLEABLE_MARKET_TYPES.has(selection.marketType) &&
      Number.isFinite(selection.odds) &&
      selection.odds > 1
  );
}

export function isRawOddsParseable(record: HistoricalMatchRecord): boolean {
  if (hasSettleableMarket(record.marketSelections)) {
    return true;
  }

  const rawOdds = record.rawOdds?.trim();
  if (!rawOdds) {
    return false;
  }

  try {
    const parsed = analyzeMatch(rawOdds);
    return hasSettleableMarket(parsed.markets);
  } catch {
    return false;
  }
}

export function hasMissingSettlement(record: HistoricalMatchRecord): boolean {
  if (!record.result) {
    return true;
  }

  if (record.status !== "VERIFIED") {
    return true;
  }

  return false;
}

export function evaluateDecisionV3ReplayEligibility(
  record: HistoricalMatchRecord,
  options: DecisionV3ReplayValidationOptions = {}
): DecisionV3ReplayEligibilityResult {
  if (options.includeMockFixtures !== true && isMockValidationRecord(record)) {
    return { eligible: false, reason: "MOCK_DATA_EXCLUDED" };
  }

  if (record.status === "CANCELLED" || record.status === "FAILED") {
    return { eligible: false, reason: "VOID_OR_CANCELLED" };
  }

  if (record.status !== "VERIFIED") {
    return { eligible: false, reason: "NOT_VERIFIED" };
  }

  if (!record.result) {
    return { eligible: false, reason: "NO_RESULT" };
  }

  if (hasMissingSettlement(record)) {
    return { eligible: false, reason: "MISSING_SETTLEMENT" };
  }

  if (!isRawOddsParseable(record)) {
    return { eligible: false, reason: "RAW_ODDS_UNPARSEABLE" };
  }

  if (!hasSettleableMarket(record.marketSelections)) {
    return { eligible: false, reason: "NO_SETTLEABLE_MARKET" };
  }

  return { eligible: true };
}

export function resolveFixtureKickoffIso(
  record: HistoricalMatchRecord,
  assumedKickoffHourUtc = 15
): string {
  const matchTime = record.analysisSnapshot?.replay?.match?.matchTime;
  if (matchTime && !Number.isNaN(Date.parse(matchTime))) {
    return new Date(matchTime).toISOString();
  }

  const datePart = record.matchDate.slice(0, 10);
  return `${datePart}T${String(assumedKickoffHourUtc).padStart(2, "0")}:00:00.000Z`;
}

export function resolveEvidenceCapturedAt(record: HistoricalMatchRecord): string | null {
  const snapshotCapturedAt = record.analysisSnapshot?.capturedAt;
  if (snapshotCapturedAt && !Number.isNaN(Date.parse(snapshotCapturedAt))) {
    return new Date(snapshotCapturedAt).toISOString();
  }

  const replayProviders = record.analysisSnapshot?.replay?.providers ?? [];
  const fetchedTimes = replayProviders
    .map((provider) => provider.fetchedAt)
    .filter((value): value is string => Boolean(value && !Number.isNaN(Date.parse(value))));

  if (fetchedTimes.length > 0) {
    return fetchedTimes.sort()[0] ?? null;
  }

  return null;
}
