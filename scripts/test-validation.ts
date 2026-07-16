import { buildMatchResult } from "@/lib/database/matchSchema";
import { SETTLEMENT_TEST_CASES } from "@/lib/backtest/mockData";
import {
  evaluateRecommendationCandidate,
  runBatchRecommendationValidation,
  runRecommendationValidation,
  summarizeSettlementCounts,
  validateMatchRecommendations,
} from "@/lib/validation";
import { runMatchVerification } from "@/lib/database/matchVerification";
import { createEmptyRecommendationResult, type RecommendationEngineResult } from "@/lib/recommendation/recommendationTypes";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function makeRecommendation(
  selection: (typeof SETTLEMENT_TEST_CASES)[number]["selection"],
  confidence: "low" | "medium" | "high",
  score: number
): RecommendationEngineResult {
  return createEmptyRecommendationResult({
    globalPass: false,
    candidates: [
      {
        marketType: selection.marketType,
        selection,
        confidence,
        expectedValue: 0.05,
        score,
        reasons: ["Synthetic validation reason"],
        warnings: [],
        supportingFeatures: ["Win Rate"],
      },
    ],
  });
}

function runTests(): void {
  const winCase = SETTLEMENT_TEST_CASES.find((item) => item.expected === "WIN");
  const loseCase = SETTLEMENT_TEST_CASES.find((item) => item.expected === "LOSE");
  const pushCase = SETTLEMENT_TEST_CASES.find((item) => item.expected === "PUSH");
  const halfWinCase = SETTLEMENT_TEST_CASES.find(
    (item) => item.expected === "HALF_WIN"
  );
  const halfLoseCase = SETTLEMENT_TEST_CASES.find(
    (item) => item.expected === "HALF_LOSE"
  );

  assert(Boolean(winCase), "settlement fixture should include WIN case");
  assert(Boolean(loseCase), "settlement fixture should include LOSE case");
  assert(Boolean(pushCase), "settlement fixture should include PUSH case");
  assert(Boolean(halfWinCase), "settlement fixture should include HALF_WIN case");
  assert(Boolean(halfLoseCase), "settlement fixture should include HALF_LOSE case");

  const winEval = evaluateRecommendationCandidate(
    makeRecommendation(winCase!.selection, "high", 60).candidates[0],
    winCase!.result
  );
  assert(winEval.result === "WIN", "win recommendation should settle as WIN");
  assert(winEval.hit, "win recommendation should count as hit");

  const loseEval = evaluateRecommendationCandidate(
    makeRecommendation(loseCase!.selection, "medium", 40).candidates[0],
    loseCase!.result
  );
  assert(loseEval.result === "LOSE", "lose recommendation should settle as LOSE");
  assert(!loseEval.hit, "lose recommendation should not count as hit");

  const pushEval = evaluateRecommendationCandidate(
    makeRecommendation(pushCase!.selection, "low", 20).candidates[0],
    pushCase!.result
  );
  assert(pushEval.result === "PUSH", "push recommendation should settle as PUSH");

  const halfWinEval = evaluateRecommendationCandidate(
    makeRecommendation(halfWinCase!.selection, "high", 55).candidates[0],
    halfWinCase!.result
  );
  assert(
    halfWinEval.result === "HALF_WIN",
    "half win recommendation should settle as HALF_WIN"
  );

  const halfLoseEval = evaluateRecommendationCandidate(
    makeRecommendation(halfLoseCase!.selection, "medium", 35).candidates[0],
    halfLoseCase!.result
  );
  assert(
    halfLoseEval.result === "HALF_LOSE",
    "half lose recommendation should settle as HALF_LOSE"
  );

  const passRecommendation: RecommendationEngineResult = createEmptyRecommendationResult({
    globalPass: true,
    passReason: "Too few features",
    candidates: [
      {
        marketType: winCase!.selection.marketType,
        selection: winCase!.selection,
        confidence: "pass",
        expectedValue: 0,
        score: 0,
        reasons: [],
        warnings: ["PASS"],
        supportingFeatures: [],
      },
    ],
  });

  const passEntries = validateMatchRecommendations({
    matchId: "match-pass",
    homeTeam: "Home FC",
    awayTeam: "Away FC",
    matchDate: "2026-07-10",
    result: winCase!.result,
    recommendation: passRecommendation,
  });
  assert(passEntries.length === 0, "global pass recommendations should not validate");

  const batch = runBatchRecommendationValidation([
    {
      matchId: "match-1",
      homeTeam: "Home FC",
      awayTeam: "Away FC",
      matchDate: "2026-07-10",
      result: winCase!.result,
      recommendation: makeRecommendation(winCase!.selection, "high", 60),
    },
    {
      matchId: "match-2",
      homeTeam: "Team A",
      awayTeam: "Team B",
      matchDate: "2026-07-11",
      result: loseCase!.result,
      recommendation: makeRecommendation(loseCase!.selection, "medium", 40),
    },
    {
      matchId: "match-3",
      homeTeam: "Team C",
      awayTeam: "Team D",
      matchDate: "2026-07-12",
      result: pushCase!.result,
      recommendation: makeRecommendation(pushCase!.selection, "low", 20),
    },
  ]);

  assert(batch.report.totalMatches === 3, "batch report should count three matches");
  assert(batch.report.totalRecommendations === 3, "batch report should count three picks");
  assert(
    batch.report.byMarket.Moneyline.sampleSize +
      batch.report.byMarket.Handicap.sampleSize +
      batch.report.byMarket.OverUnder.sampleSize +
      batch.report.byMarket.BTTS.sampleSize >=
      3,
    "market buckets should receive validated recommendations"
  );
  assert(
    batch.report.byFeature["Win Rate"].sampleSize === 3,
    "feature bucket should count supporting feature appearances"
  );
  assert(
    batch.report.byRule["confidence:high"].sampleSize === 1,
    "rule bucket should track confidence rules"
  );
  assert(
    batch.report.confidenceDistribution.high === 1,
    "confidence distribution should count HIGH recommendations"
  );

  const counts = summarizeSettlementCounts(batch.entries);
  assert(counts.wins >= 1, "summary should include wins");
  assert(counts.losses >= 1, "summary should include losses");
  assert(counts.pushes >= 1, "summary should include pushes");

  const emptyReport = runRecommendationValidation({
    matchId: "empty",
    homeTeam: "A",
    awayTeam: "B",
    matchDate: "2026-07-10",
    result: buildMatchResult({
      fullTimeHomeGoals: 1,
      fullTimeAwayGoals: 0,
      halfTimeHomeGoals: 1,
      halfTimeAwayGoals: 0,
    }),
    recommendation: null,
  });
  assert(
    emptyReport.report.totalRecommendations === 0,
    "empty recommendation input should produce empty report"
  );

  const verifiedRecord: HistoricalMatchRecord = {
    id: "verified-1",
    date: "2026-07-10",
    matchDate: "2026-07-10",
    league: "Test League",
    homeTeam: "Home FC",
    awayTeam: "Away FC",
    rawOdds: "Home FC vs Away FC",
    marketSelections: [winCase!.selection],
    result: winCase!.result,
    analysisSnapshot: null,
    candidates: [],
    status: "VERIFIED",
    verificationResult: null,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  };

  const verification = runMatchVerification(verifiedRecord, [verifiedRecord]);
  assert(
    verification.recommendationValidation !== undefined,
    "match verification should attach recommendation validation"
  );
  assert(
    Array.isArray(verification.recommendationValidation.entries),
    "verification should expose validation entries array"
  );
  assert(
    verification.recommendationValidation.report.totalMatches === 1,
    "verification report should include the verified match"
  );

  console.log("Validation tests passed.");
}

runTests();
