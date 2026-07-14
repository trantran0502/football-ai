import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import { fuseFeatureScores } from "@/lib/analysis/featureScore/fusion/featureFusionEngine";
import { buildFeatureScores } from "@/lib/analysis/featureScore/featureScoreEngine";
import { buildBettingIntelligence } from "@/lib/betting/intelligenceEngine";
import { buildDecision } from "@/lib/decision/decisionEngine";
import { resolveDecisionScoreTier } from "@/lib/decision/decisionScoring";
import type { FeatureFusionResult } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import type { RecommendationCandidate } from "@/lib/recommendation/recommendationTypes";
import type { MarketSelection } from "@/types/match";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function selection(
  partial: Pick<MarketSelection, "marketType" | "side" | "odds"> &
    Partial<MarketSelection>
): MarketSelection {
  return {
    marketFamily: partial.marketFamily ?? "moneyline",
    title: partial.title ?? "獨贏",
    period: partial.period ?? "full",
    rawLine: partial.rawLine ?? null,
    line: partial.line ?? null,
    modifier: partial.modifier ?? null,
    ...partial,
  };
}

function buildCandidate(
  marketType: MarketSelection["marketType"],
  side: MarketSelection["side"],
  odds: number,
  score: number,
  expectedValue: number,
  confidence: RecommendationCandidate["confidence"] = "medium"
): RecommendationCandidate {
  return {
    marketType,
    selection: selection({ marketType, side, odds }),
    confidence,
    expectedValue,
    score,
    reasons: ["Recent Form positive"],
    warnings: [],
    supportingFeatures: ["Recent Form"],
  };
}

function buildFusion(score: number, confidence: number): FeatureFusionResult {
  return {
    overallScore: score,
    overallConfidence: confidence,
    categoryScores: [],
    strongestFactors: [
      {
        id: "recent_form.wins",
        score: 40,
        confidence: 0.8,
        weight: 1,
        reason: "Recent Form",
        sourceCategory: "recentForm",
      },
    ],
    weakestFactors: [],
    ignoredFeatures: [],
    warnings: [],
  };
}

function runTests(): void {
  const markets = [
    selection({ marketType: "moneyline", side: "home", odds: 0.85 }),
    selection({ marketType: "moneyline", side: "draw", odds: 3.4 }),
    selection({ marketType: "moneyline", side: "away", odds: 4.2 }),
    selection({
      marketType: "totalGoals",
      marketFamily: "asianOverUnder",
      side: "over",
      odds: 0.9,
      line: 2.5,
      title: "全場大小",
    }),
    selection({
      marketType: "totalGoals",
      marketFamily: "asianOverUnder",
      side: "under",
      odds: 0.96,
      line: 2.5,
      title: "全場大小",
    }),
  ];

  const featureResult = buildFeatureScores({ marketSelections: markets });
  const fusion = fuseFeatureScores(featureResult.features);
  const intelligence = buildBettingIntelligence({
    marketSelections: markets,
    oddsHistory: { timelines: [] },
    fusion,
  });

  const passDecision = buildDecision({
    fusion,
    bettingIntelligence: intelligence,
    recommendationCandidates: [],
    recommendationResult: {
      candidates: [],
      globalPass: true,
      passReason: "Insufficient confidence",
    },
  });
  assert(passDecision.decision === "PASS", "global pass should yield PASS");

  const lowValueCandidates = [
    buildCandidate("moneyline", "home", 0.85, 10, -0.05, "low"),
  ];
  const lowValueDecision = buildDecision({
    fusion: buildFusion(10, 0.3),
    bettingIntelligence: intelligence,
    recommendationCandidates: lowValueCandidates,
    recommendationResult: {
      candidates: lowValueCandidates,
      globalPass: false,
      passReason: null,
    },
  });
  assert(
    lowValueDecision.decision === "PASS" || lowValueDecision.decision === "WATCH",
    "low value should not produce strong bet"
  );

  const highValueCandidates = [
    buildCandidate("moneyline", "home", 0.85, 75, 0.12, "high"),
    buildCandidate("totalGoals", "over", 0.9, 40, 0.03, "low"),
  ];
  const highFusion = buildFusion(70, 0.85);
  const highIntelligence = buildBettingIntelligence({
    marketSelections: markets,
    oddsHistory: { timelines: [] },
    fusion: highFusion,
  });
  const highValueDecision = buildDecision({
    fusion: highFusion,
    bettingIntelligence: highIntelligence,
    recommendationCandidates: highValueCandidates,
    recommendationResult: {
      candidates: highValueCandidates,
      globalPass: false,
      passReason: null,
    },
  });
  assert(
    ["SMALL BET", "NORMAL BET", "STRONG BET", "WATCH"].includes(highValueDecision.decision),
    "high value candidate should produce actionable decision"
  );
  assert(highValueDecision.decisionScore > 0, "decision score should be positive");
  assert(highValueDecision.selection !== null, "should select a market");

  const conflictFusion: FeatureFusionResult = {
    ...highFusion,
    warnings: [
      {
        code: "feature_conflict",
        message: "Conflicting signals across categories.",
      },
      {
        code: "low_confidence",
        message: "Overall fusion confidence is below threshold.",
      },
    ],
  };
  const highRiskDecision = buildDecision({
    fusion: conflictFusion,
    bettingIntelligence: intelligence,
    recommendationCandidates: highValueCandidates,
    recommendationResult: {
      candidates: highValueCandidates,
      globalPass: false,
      passReason: null,
    },
  });
  assert(highRiskDecision.riskScore > 0, "conflict fusion should increase risk score");
  assert(highRiskDecision.objections.length > 0, "risk should produce objections");

  const divergentIntelligence = buildBettingIntelligence({
    marketSelections: markets,
    oddsHistory: { timelines: [] },
    fusion: highFusion,
    multiBookmaker: {
      markets: [
        {
          marketKey: "moneyline|full|獨贏|home",
          selections: [
            {
              bookmakerId: "pinnacle",
              odds: 0.7,
              decimalOdds: 1.7,
              impliedProbability: 1 / 1.7,
              format: "hong_kong",
              timestamp: "2026-07-15T12:00:00.000Z",
            },
            {
              bookmakerId: "bet365",
              odds: 0.95,
              decimalOdds: 1.95,
              impliedProbability: 1 / 1.95,
              format: "hong_kong",
              timestamp: "2026-07-15T12:00:00.000Z",
            },
          ],
        },
      ],
    },
  });
  const marketConflictDecision = buildDecision({
    fusion: highFusion,
    bettingIntelligence: divergentIntelligence,
    recommendationCandidates: highValueCandidates,
    recommendationResult: {
      candidates: highValueCandidates,
      globalPass: false,
      passReason: null,
    },
  });
  assert(
    marketConflictDecision.objections.some((item) => item.includes("分歧") || item.includes("diverg")),
    "market divergence should appear in objections"
  );

  const emptyDecision = buildDecision({
    fusion: null,
    bettingIntelligence: null,
    recommendationCandidates: [],
    recommendationResult: null,
  });
  assert(emptyDecision.decision === "PASS", "empty input should PASS");

  assert(resolveDecisionScoreTier(10) === "Avoid", "score 10 is Avoid");
  assert(resolveDecisionScoreTier(30) === "Weak", "score 30 is Weak");
  assert(resolveDecisionScoreTier(50) === "Average", "score 50 is Average");
  assert(resolveDecisionScoreTier(70) === "Good", "score 70 is Good");
  assert(resolveDecisionScoreTier(90) === "Excellent", "score 90 is Excellent");

  const sampleOdds = `Arsenal vs Chelsea
獨贏
主 0.85
和 3.4
客 4.2
全場大小
大(2.5) 0.90
小(2.5) 0.96`;

  const report = analyzeMatch(sampleOdds);
  assert(report.decision !== null, "analyzeMatch should attach decision");
  assert(
    ["PASS", "WATCH", "SMALL BET", "NORMAL BET", "STRONG BET"].includes(
      report.decision!.decision
    ),
    "decision level must be valid"
  );
  assert(report.decision!.explanation.summary.startsWith("Decision:"), "explanation required");

  console.log("Decision engine tests passed.");
  console.log(`- Sample decision: ${report.decision?.decision}`);
  console.log(`- Decision score: ${report.decision?.decisionScore.toFixed(0)}`);
  console.log(`- Value score: ${report.decision?.valueScore.toFixed(0)}`);
  console.log(`- Risk score: ${report.decision?.riskScore.toFixed(0)}`);
  console.log(`- High value decision: ${highValueDecision.decision}`);
  console.log(`- PASS decision objections: ${passDecision.objections.length}`);
}

runTests();
