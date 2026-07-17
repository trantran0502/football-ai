import {
  buildSystemValidationFixtures,
  SYSTEM_VALIDATION_FIXTURE_SPECS,
} from "./systemValidationFixtures";
import {
  findFirstStatisticsDiff,
  normalizeKnowledgeStatistics,
  statisticsChecksum,
} from "./systemValidationRunner";
import { buildMarketKnowledgeFromVerifiedMatches } from "@/lib/recommendation/marketKnowledge/marketKnowledgeFromVerified";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testFixturesDeterministic(): void {
  assert(SYSTEM_VALIDATION_FIXTURE_SPECS.length >= 12, "at least 12 fixture specs");
  const fixtures = buildSystemValidationFixtures();
  assert(fixtures.length === SYSTEM_VALIDATION_FIXTURE_SPECS.length, "fixture count");
  assert(new Set(fixtures.map((item) => item.id)).size === fixtures.length, "unique ids");
  assert(fixtures.every((item) => item.status === "VERIFIED"), "all verified");
  assert(fixtures.some((item) => item.leagueId === 39), "premier league present");
  assert(fixtures.some((item) => item.leagueId === 140), "la liga present");
}

function testNormalizationAndDiff(): void {
  const fixtures = buildSystemValidationFixtures();
  const snapshot = buildMarketKnowledgeFromVerifiedMatches(fixtures);
  const normalized = normalizeKnowledgeStatistics(snapshot);
  const checksum = statisticsChecksum(snapshot, fixtures.length);
  assert(checksum.length === 64, "checksum length");
  const diff = findFirstStatisticsDiff(normalized, normalized, normalized);
  assert(diff === null, "identical stats have no diff");
}

export function runSystemValidationTests(): void {
  testFixturesDeterministic();
  testNormalizationAndDiff();
}

runSystemValidationTests();
console.log("System validation module tests passed.");
