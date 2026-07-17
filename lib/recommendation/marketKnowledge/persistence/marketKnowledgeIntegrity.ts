import type {
  HistoricalPattern,
  LeagueStatistics,
  MarketKnowledgeSnapshot,
  MarketStatisticsEntry,
  PatternStatistics,
  RuleStatistics,
} from "../marketKnowledgeTypes";
import { MarketKnowledgeIntegrityError } from "./marketKnowledgePersistenceTypes";

function assertFiniteNumber(value: number, label: string, errors: string[]): void {
  if (!Number.isFinite(value)) {
    errors.push(`${label} must be a finite number.`);
  }
  if (Number.isNaN(value)) {
    errors.push(`${label} must not be NaN.`);
  }
  if (value === Infinity || value === -Infinity) {
    errors.push(`${label} must not be Infinity.`);
  }
}

function validateRuleStatistics(rule: RuleStatistics, errors: string[]): void {
  assertFiniteNumber(rule.sampleSize, `Rule ${rule.ruleId} sampleSize`, errors);
  if (rule.sampleSize < 0) {
    errors.push(`Rule ${rule.ruleId} sampleSize must not be negative.`);
  }

  assertFiniteNumber(rule.hitCount, `Rule ${rule.ruleId} hitCount`, errors);
  assertFiniteNumber(rule.missCount, `Rule ${rule.ruleId} missCount`, errors);
  assertFiniteNumber(rule.pushCount, `Rule ${rule.ruleId} pushCount`, errors);

  const totalOutcomes = rule.hitCount + rule.missCount + rule.pushCount;
  if (totalOutcomes !== rule.sampleSize) {
    errors.push(
      `Rule ${rule.ruleId}: hitCount + missCount + pushCount (${totalOutcomes}) must equal sampleSize (${rule.sampleSize}).`
    );
  }

  assertFiniteNumber(rule.roi, `Rule ${rule.ruleId} roi`, errors);
  assertFiniteNumber(rule.hitRate, `Rule ${rule.ruleId} hitRate`, errors);
  if (rule.hitRate < 0 || rule.hitRate > 1) {
    errors.push(`Rule ${rule.ruleId} hitRate must be between 0 and 1.`);
  }
}

function validatePatternStatistics(pattern: PatternStatistics, errors: string[]): void {
  assertFiniteNumber(pattern.sampleSize, `Pattern ${pattern.patternId} sampleSize`, errors);
  if (pattern.sampleSize < 0) {
    errors.push(`Pattern ${pattern.patternId} sampleSize must not be negative.`);
  }
  assertFiniteNumber(pattern.roi, `Pattern ${pattern.patternId} roi`, errors);
  assertFiniteNumber(pattern.hitRate, `Pattern ${pattern.patternId} hitRate`, errors);
  if (pattern.hitRate < 0 || pattern.hitRate > 1) {
    errors.push(`Pattern ${pattern.patternId} hitRate must be between 0 and 1.`);
  }
}

function validateMarketStatistics(entry: MarketStatisticsEntry, errors: string[]): void {
  assertFiniteNumber(entry.sampleSize, `Market ${entry.marketType} sampleSize`, errors);
  if (entry.sampleSize < 0) {
    errors.push(`Market ${entry.marketType} sampleSize must not be negative.`);
  }
  assertFiniteNumber(entry.roi, `Market ${entry.marketType} roi`, errors);
  assertFiniteNumber(entry.hitRate, `Market ${entry.marketType} hitRate`, errors);
  if (entry.hitRate < 0 || entry.hitRate > 1) {
    errors.push(`Market ${entry.marketType} hitRate must be between 0 and 1.`);
  }
}

function validateLeagueStatistics(league: LeagueStatistics, errors: string[]): void {
  assertFiniteNumber(league.sampleSize, `League ${league.leagueId} sampleSize`, errors);
  if (league.sampleSize < 0) {
    errors.push(`League ${league.leagueId} sampleSize must not be negative.`);
  }
  assertFiniteNumber(league.roi, `League ${league.leagueId} roi`, errors);
  assertFiniteNumber(league.hitRate, `League ${league.leagueId} hitRate`, errors);
  if (league.hitRate < 0 || league.hitRate > 1) {
    errors.push(`League ${league.leagueId} hitRate must be between 0 and 1.`);
  }
}

function validateHistoricalPattern(pattern: HistoricalPattern, errors: string[]): void {
  assertFiniteNumber(pattern.sampleSize, "Historical pattern sampleSize", errors);
  if (pattern.sampleSize < 0) {
    errors.push("Historical pattern sampleSize must not be negative.");
  }
  assertFiniteNumber(pattern.roi, "Historical pattern roi", errors);
  assertFiniteNumber(pattern.hitRate, "Historical pattern hitRate", errors);
  if (pattern.hitRate < 0 || pattern.hitRate > 1) {
    errors.push("Historical pattern hitRate must be between 0 and 1.");
  }
}

function isValidIsoDate(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

export function validateMarketKnowledgeSnapshotIntegrity(
  snapshot: MarketKnowledgeSnapshot
): void {
  const errors: string[] = [];

  if (!snapshot.id || snapshot.id.trim().length === 0) {
    errors.push("snapshotId must not be empty.");
  }

  if (!snapshot.generatedAt || !isValidIsoDate(snapshot.generatedAt)) {
    errors.push("createdAt/generatedAt must be a valid ISO date.");
  }

  for (const rule of snapshot.ruleStatistics) {
    validateRuleStatistics(rule, errors);
  }
  for (const pattern of snapshot.patternStatistics) {
    validatePatternStatistics(pattern, errors);
  }
  for (const marketType of Object.keys(snapshot.marketStatistics) as Array<
    keyof typeof snapshot.marketStatistics
  >) {
    validateMarketStatistics(snapshot.marketStatistics[marketType], errors);
  }
  for (const league of snapshot.leagueStatistics) {
    validateLeagueStatistics(league, errors);
  }
  for (const historical of snapshot.historicalPatterns) {
    validateHistoricalPattern(historical, errors);
  }

  if (errors.length > 0) {
    throw new MarketKnowledgeIntegrityError(errors.join(" "));
  }
}

export function scanSnapshotForInvalidNumbers(snapshot: MarketKnowledgeSnapshot): string[] {
  const errors: string[] = [];
  try {
    validateMarketKnowledgeSnapshotIntegrity(snapshot);
  } catch (error) {
    if (error instanceof MarketKnowledgeIntegrityError) {
      errors.push(error.message);
    } else {
      errors.push(String(error));
    }
  }
  return errors;
}
