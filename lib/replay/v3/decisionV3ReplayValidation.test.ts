import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import type { HistoricalMatchRecord, MatchResult } from "@/lib/database/matchSchema";
import { DECISION_V3_CATALOG_VERSION, type DecisionOutcome } from "@/lib/decision/v3/decisionTypes";
import { createEmptyRecommendationResult, type RecommendationCandidate } from "@/lib/recommendation/recommendationTypes";
import {
  auditEvidenceLeakage,
  buildAgreementMetrics,
  buildDecisionV3ReplayValidationMarkdown,
  evaluateDecisionV3ReplayEligibility,
  resolveValidationVerdict,
  runDecisionV3ReplayValidation,
  settleDecisionOutcome,
  settleLegacyRecommendation,
  computeMaxDrawdown,
} from "@/lib/replay/v3";
import type { MarketSelection } from "@/types/match";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const SAMPLE_ODDS = `Arsenal vs Chelsea
獨贏
主 1.85
和 3.4
客 4.2`;

function buildMarkets(): MarketSelection[] {
  return [
    {
      marketType: "moneyline",
      marketFamily: "moneyline",
      title: "獨贏",
      period: "full",
      side: "home",
      line: null,
      rawLine: null,
      modifier: null,
      odds: 1.85,
      impliedProbability: 0.5405,
    },
    {
      marketType: "moneyline",
      marketFamily: "moneyline",
      title: "獨贏",
      period: "full",
      side: "draw",
      line: null,
      rawLine: null,
      modifier: null,
      odds: 3.4,
      impliedProbability: 0.2941,
    },
    {
      marketType: "moneyline",
      marketFamily: "moneyline",
      title: "獨贏",
      period: "full",
      side: "away",
      line: null,
      rawLine: null,
      modifier: null,
      odds: 4.2,
      impliedProbability: 0.2381,
    },
  ];
}

function buildResult(winner: MatchResult["winner"] = "home"): MatchResult {
  return {
    fullTimeHomeGoals: winner === "home" ? 2 : winner === "away" ? 0 : 1,
    fullTimeAwayGoals: winner === "away" ? 2 : winner === "home" ? 1 : 1,
    halfTimeHomeGoals: 1,
    halfTimeAwayGoals: 0,
    winner,
    totalGoals: winner === "draw" ? 2 : 3,
    bothTeamsScored: true,
  };
}

function buildRecord(overrides: Partial<HistoricalMatchRecord> = {}): HistoricalMatchRecord {
  const matchDate = "2026-03-01";
  return {
    id: overrides.id ?? "replay-val-fix-01",
    date: matchDate,
    matchDate,
    league: "Premier League",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    rawOdds: SAMPLE_ODDS,
    marketSelections: buildMarkets(),
    result: buildResult("home"),
    analysisSnapshot: {
      features: [],
      interpretations: [],
      marketAnalysis: { markets: [], summary: "" },
      combinedAnalysis: { summary: "", score: 0, confidence: 0 },
      candidates: [],
      recommendation: null,
      replay: null,
      bettingIntelligence: null,
      decision: null,
      teamProfiles: null,
      capturedAt: "2026-03-01T10:00:00.000Z",
    },
    candidates: [],
    status: "VERIFIED",
    verificationResult: null,
    fixtureId: 10001,
    createdAt: "2026-03-01T09:00:00.000Z",
    updatedAt: "2026-03-01T12:00:00.000Z",
    ...overrides,
  };
}

function buildCandidate(side: MarketSelection["side"], score: number): RecommendationCandidate {
  const selection = buildMarkets().find((market) => market.side === side)!;
  return {
    marketType: "moneyline",
    selection,
    confidence: "medium",
    expectedValue: 0.1,
    score,
    marketScore: score,
    evidenceScore: 0.1,
    reasons: ["form"],
    warnings: [],
    supportingFeatures: [],
  };
}

function buildDecisionOutcome(
  overrides: Partial<DecisionOutcome> = {}
): DecisionOutcome {
  return {
    decision: "lean",
    confidence: "medium",
    weightedScore: 0.4,
    candidate: {
      marketType: "moneyline",
      side: "home",
      label: "home moneyline",
    },
    reasons: [],
    objections: [],
    breakdown: [],
    catalogVersion: DECISION_V3_CATALOG_VERSION,
    decisionWeightVersion: null,
    decisionWeightSource: "fallback",
    ...overrides,
  };
}

function testEligibilityFiltering(): void {
  const eligible = evaluateDecisionV3ReplayEligibility(buildRecord());
  assert(eligible.eligible, "verified record with markets should be eligible");

  const pending = evaluateDecisionV3ReplayEligibility(
    buildRecord({ status: "PENDING", result: null })
  );
  assert(pending.reason === "NOT_VERIFIED", "pending excluded");

  const cancelled = evaluateDecisionV3ReplayEligibility(
    buildRecord({ status: "CANCELLED" })
  );
  assert(cancelled.reason === "VOID_OR_CANCELLED", "cancelled excluded");

  const mockExcluded = evaluateDecisionV3ReplayEligibility(
    buildRecord({ id: "sv-fix-01" })
  );
  assert(mockExcluded.reason === "MOCK_DATA_EXCLUDED", "mock excluded by default");
}

function testExclusionReasons(): void {
  const run = runDecisionV3ReplayValidation({
    records: [
      buildRecord({ id: "replay-val-eligible-1" }),
      buildRecord({ id: "sv-fix-02", status: "VERIFIED" }),
      buildRecord({ id: "replay-val-pending", status: "PENDING", result: null }),
      buildRecord({
        id: "replay-val-no-markets",
        marketSelections: [],
        rawOdds: "",
      }),
    ],
  });

  assert(run.report.dataset.totalRecords === 4, "total records counted");
  assert(run.report.dataset.excludedRecords >= 2, "invalid records excluded");
  assert(
    (run.report.dataset.exclusionReasons.MOCK_DATA_EXCLUDED ?? 0) >= 1,
    "mock exclusion reason tracked"
  );
}

function testSameSettlementLogic(): void {
  const result = buildResult("home");
  const recommendation = createEmptyRecommendationResult({
    globalPass: false,
    candidates: [buildCandidate("home", 70)],
  });
  const legacy = settleLegacyRecommendation(recommendation, result, 1);
  const decision = settleDecisionOutcome(
    buildDecisionOutcome({
      candidate: { marketType: "moneyline", side: "home", label: "home moneyline" },
    }),
    buildMarkets(),
    result,
    1
  );

  assert(legacy.betResult === "WIN", "legacy win");
  assert(decision.betResult === "WIN", "decision win");
  assert(legacy.profit === decision.profit, "same profit formula");
}

function testSettlementOutcomes(): void {
  const result = buildResult("away");
  const recommendation = createEmptyRecommendationResult({
    globalPass: false,
    candidates: [buildCandidate("home", 70)],
  });
  const legacyLoss = settleLegacyRecommendation(recommendation, result, 1);
  assert(legacyLoss.betResult === "LOSE", "loss settlement");
  assert(legacyLoss.profit === -1, "loss profit");

  const pass = settleLegacyRecommendation(
    createEmptyRecommendationResult({ globalPass: true }),
    result,
    1
  );
  assert(pass.betResult === "PASS", "pass settlement");
  assert(pass.profit === 0, "pass profit");
}

function testFlatStakeRoi(): void {
  const run = runDecisionV3ReplayValidation({
    records: [buildRecord({ id: "replay-val-roi-1" })],
  });
  assert(typeof run.report.legacy.roi === "number", "legacy roi computed");
  assert(typeof run.report.decisionV3.roi === "number", "decision roi computed");
}

function testMaxDrawdown(): void {
  const drawdown = computeMaxDrawdown([1, -2, 1, -3]);
  assert(drawdown >= 3, "max drawdown captures peak-to-trough");
}

function testAgreementMetrics(): void {
  const run = runDecisionV3ReplayValidation({
    records: [buildRecord({ id: "replay-val-agreement-1" })],
  });
  assert(
    typeof run.report.agreement.directionAgreementRate === "number",
    "direction agreement rate"
  );
  assert(typeof run.report.agreement.bothPassCount === "number", "both pass count");
}

function testGroupedMetrics(): void {
  const run = runDecisionV3ReplayValidation({
    records: [
      buildRecord({ id: "replay-val-group-1", league: "Premier League" }),
      buildRecord({ id: "replay-val-group-2", league: "La Liga", homeTeam: "Barcelona", awayTeam: "Sevilla" }),
    ],
  });

  assert(Object.keys(run.report.grouped.byLeague).length >= 1, "league grouping present");
  const bucket = Object.values(run.report.grouped.byLeague)[0];
  assert(
    bucket.status === "ok" || bucket.status === "insufficient_sample",
    "group status present"
  );
}

function testInsufficientSampleVerdict(): void {
  const verdict = resolveValidationVerdict({
    eligibleRecords: 12,
    legacy: runDecisionV3ReplayValidation({ records: [] }).report.legacy,
    decisionV3: runDecisionV3ReplayValidation({ records: [] }).report.decisionV3,
    grouped: runDecisionV3ReplayValidation({ records: [] }).report.grouped,
    leakageExcluded: 0,
  });
  assert(verdict.verdict === "INSUFFICIENT_DATA", "insufficient data verdict");
}

function testPreliminarySampleVerdict(): void {
  const empty = runDecisionV3ReplayValidation({ records: [] }).report;
  const verdict = resolveValidationVerdict({
    eligibleRecords: 250,
    legacy: empty.legacy,
    decisionV3: empty.decisionV3,
    grouped: empty.grouped,
    leakageExcluded: 0,
  });
  assert(verdict.verdict === "PRELIMINARY", "preliminary verdict");
}

function testLeakageExclusion(): void {
  const record = buildRecord({
    id: "replay-val-leakage-1",
    analysisSnapshot: {
      features: [],
      interpretations: [],
      marketAnalysis: { markets: [], summary: "" },
      combinedAnalysis: { summary: "", score: 0, confidence: 0 },
      candidates: [],
      recommendation: null,
      replay: null,
      bettingIntelligence: null,
      decision: null,
      capturedAt: "2026-03-01T16:00:00.000Z",
    },
  });

  const run = runDecisionV3ReplayValidation({ records: [record] });
  assert(
    (run.report.dataset.exclusionReasons.EVIDENCE_CAPTURED_AFTER_KICKOFF ?? 0) >= 1 ||
      (run.report.dataset.exclusionReasons.CANNOT_PROVE_PRE_KICKOFF ?? 0) >= 1,
    "late evidence excluded"
  );
}

function testDeterministicRerun(): void {
  const records = [buildRecord({ id: "replay-val-deterministic-1" })];
  const first = runDecisionV3ReplayValidation({ records });
  const second = runDecisionV3ReplayValidation({ records });

  assert(
    JSON.stringify({
      legacy: first.report.legacy,
      decisionV3: first.report.decisionV3,
      agreement: first.report.agreement,
    }) ===
      JSON.stringify({
        legacy: second.report.legacy,
        decisionV3: second.report.decisionV3,
        agreement: second.report.agreement,
      }),
    "deterministic metrics for same records"
  );
}

function testNoProductionWrite(): void {
  const previousDualWrite = process.env.RECOMMENDATION_DUAL_WRITE;
  const previousDecisionShadow = process.env.USE_DECISION_V3_SHADOW;
  delete process.env.RECOMMENDATION_DUAL_WRITE;
  delete process.env.USE_DECISION_V3_SHADOW;

  try {
    runDecisionV3ReplayValidation({ records: [buildRecord({ id: "replay-val-no-write-1" })] });
    assert(process.env.RECOMMENDATION_DUAL_WRITE === undefined, "dual write env unchanged");
    assert(process.env.USE_DECISION_V3_SHADOW === undefined, "decision shadow env unchanged");
  } finally {
    if (previousDualWrite === undefined) delete process.env.RECOMMENDATION_DUAL_WRITE;
    else process.env.RECOMMENDATION_DUAL_WRITE = previousDualWrite;
    if (previousDecisionShadow === undefined) delete process.env.USE_DECISION_V3_SHADOW;
    else process.env.USE_DECISION_V3_SHADOW = previousDecisionShadow;
  }
}

function testRecommendationRegression(): void {
  const report = analyzeMatch(SAMPLE_ODDS);
  assert(!("recommendationComparison" in report), "AnalysisReport unchanged");
  assert(report.recommendation.enabled, "recommendation section still enabled");
}

function testAnalysisReportRegression(): void {
  const report = analyzeMatch(SAMPLE_ODDS);
  assert(
    JSON.stringify(report).includes("decisionV3ReplayValidation") === false,
    "no replay validation payload in AnalysisReport"
  );
}

function testMarkdownReport(): void {
  const run = runDecisionV3ReplayValidation({ records: [buildRecord()] });
  const markdown = buildDecisionV3ReplayValidationMarkdown(run.report);
  assert(markdown.includes("Decision V3 Replay Validation"), "markdown title");
  assert(markdown.includes("Verdict"), "markdown verdict section");
  assert(markdown.includes("Leakage Audit"), "markdown leakage section");
}

function testLeakageAuditHelper(): void {
  const record = buildRecord();
  const leakage = auditEvidenceLeakage({
    record,
    evidence: {
      evidence: [],
      missing: ["FORM_RECENT_10"],
      blocked: [],
      catalogVersion: "evidence-catalog-v3.0",
      collectedAt: "2026-03-01T10:00:00.000Z",
    },
  });
  assert(leakage.passed, "pre-kickoff collectedAt passes leakage audit");
}

function testAgreementBuilder(): void {
  const run = runDecisionV3ReplayValidation({ records: [buildRecord()] });
  const agreement = buildAgreementMetrics(run.matchResults);
  assert(agreement.overallAgreementRate >= 0, "agreement metrics built");
}

export function runDecisionV3ReplayValidationTests(): void {
  testEligibilityFiltering();
  testExclusionReasons();
  testSameSettlementLogic();
  testSettlementOutcomes();
  testFlatStakeRoi();
  testMaxDrawdown();
  testAgreementMetrics();
  testGroupedMetrics();
  testInsufficientSampleVerdict();
  testPreliminarySampleVerdict();
  testLeakageExclusion();
  testDeterministicRerun();
  testNoProductionWrite();
  testRecommendationRegression();
  testAnalysisReportRegression();
  testMarkdownReport();
  testLeakageAuditHelper();
  testAgreementBuilder();
}

void (() => {
  runDecisionV3ReplayValidationTests();
  console.log("Decision v3 replay validation tests passed.");
})();
