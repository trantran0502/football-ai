import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import { runFeatureRecommendationPipeline } from "@/lib/analysis/featureRecommendationPipeline";
import { fuseFeatureScores, type FeatureScore } from "@/lib/analysis/featureScore";
import { generateRecommendations } from "@/lib/recommendation/recommendationEngine";
import {
  EMPTY_RECOMMENDATION_MESSAGE,
  GLOBAL_PASS_HEADLINE,
  RECOMMENDATION_LEVEL_LABELS,
  getActionableRecommendations,
  getRecommendationCardClassName,
  getRecommendationLevelBadgeClassName,
  getRecommendationMessage,
  sortRecommendationCandidates,
} from "@/lib/recommendation/recommendationPresentation";
import type { RecommendationCandidate } from "@/lib/recommendation/recommendationTypes";
import type { MarketSelection } from "@/types/match";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function makeFeature(
  id: string,
  score: number,
  confidence: number,
  weight = 1
): FeatureScore {
  return {
    id,
    category: "moneyline",
    score,
    weight,
    confidence,
    reason: `Synthetic ${id}`,
  };
}

function buildMarkets(): MarketSelection[] {
  return [
    {
      marketType: "moneyline",
      marketFamily: "moneyline",
      title: "獨贏",
      period: "full",
      side: "home",
      odds: 1.85,
      line: null,
      rawLine: null,
      modifier: null,
      impliedProbability: 0.54,
    },
    {
      marketType: "moneyline",
      marketFamily: "moneyline",
      title: "獨贏",
      period: "full",
      side: "away",
      odds: 4.2,
      line: null,
      rawLine: null,
      modifier: null,
      impliedProbability: 0.24,
    },
    {
      marketType: "totalGoals",
      marketFamily: "asianOverUnder",
      title: "全場大小",
      period: "full",
      side: "over",
      odds: 0.9,
      line: 2.5,
      rawLine: "2.5",
      modifier: "plain",
      impliedProbability: 1.111,
    },
    {
      marketType: "btts",
      marketFamily: "btts",
      title: "雙方進球",
      period: "full",
      side: "yes",
      odds: 0.82,
      line: null,
      rawLine: null,
      modifier: null,
      impliedProbability: 1.22,
    },
  ];
}

function buildStrongHomeFusion() {
  return fuseFeatureScores([
    makeFeature("market_odds", 20, 0.8),
    makeFeature("recent_form.win_rate", 55, 0.78),
    makeFeature("recent_form.goal_difference", 40, 0.75),
    makeFeature("recent_form.momentum", 35, 0.72),
    makeFeature("home_away.home_advantage", 45, 0.74),
    makeFeature("goals_xg.expected_goal_advantage", 38, 0.73),
    makeFeature("league_strength.league_rank", 15, 0.7),
    makeFeature("scoring_pattern.combined_over_25", 25, 0.68),
    makeFeature("scoring_pattern.combined_btts", 18, 0.66),
    makeFeature("match_context.rest_advantage", 12, 0.6),
  ]);
}

function buildPassFusion() {
  return fuseFeatureScores([]);
}

const BALANCED_SAMPLE = `曼城 vs 利物浦
獨贏
主 2.1
和 3.4
客 3.2
全場讓分
主-0.5 0.95
客+0.5 0.93
全場大小
大(2.5) 0.9
小 0.92
雙方進球
是 0.8
否 0.95`;

const CONFLICT_SAMPLE = `法國 vs 西班牙
獨贏
主 1.55
和 3.2
客 3.5
全場讓分
主0 0.9
客0 0.95
全場大小
大(2.5) 0.88
小 0.98
雙方進球
是 0.75
否 1.05`;

function runTests(): void {
  const markets = buildMarkets();
  const fusion = buildStrongHomeFusion();
  const recommendation = generateRecommendations(fusion, markets);

  assert(recommendation.candidates.length > 0, "should produce recommendation candidates");
  assert(
    getActionableRecommendations(recommendation).length > 0,
    "strong home scenario should include actionable recommendations"
  );

  const sorted = sortRecommendationCandidates(recommendation.candidates);
  for (let index = 1; index < sorted.length; index += 1) {
    assert(
      sorted[index - 1].score >= sorted[index].score,
      "candidates should be sorted by score descending"
    );
  }

  assert(
    RECOMMENDATION_LEVEL_LABELS.high === "HIGH" &&
      RECOMMENDATION_LEVEL_LABELS.medium === "MEDIUM" &&
      RECOMMENDATION_LEVEL_LABELS.low === "LOW" &&
      RECOMMENDATION_LEVEL_LABELS.pass === "PASS",
    "recommendation level labels should be exposed for UI"
  );

  assert(
    getRecommendationCardClassName("high").includes("amber"),
    "HIGH cards should use prominent styling"
  );
  assert(
    getRecommendationLevelBadgeClassName("medium").includes("indigo"),
    "MEDIUM badges should use distinct styling"
  );
  assert(
    getRecommendationLevelBadgeClassName("low").includes("slate"),
    "LOW badges should use neutral styling"
  );

  const passFusion = buildPassFusion();
  const passRecommendation = generateRecommendations(passFusion, markets);
  assert(passRecommendation.globalPass, "empty fusion should global pass");
  assert(
    getRecommendationMessage(passRecommendation) === EMPTY_RECOMMENDATION_MESSAGE ||
      passRecommendation.passReason !== null,
    "pass fusion should expose pass messaging"
  );

  const passOnlyCandidates: RecommendationCandidate[] = [
    {
      marketType: "moneyline",
      selection: markets[0],
      confidence: "pass",
      expectedValue: 0,
      score: 0,
      reasons: [],
      warnings: ["Insufficient signal"],
      supportingFeatures: [],
    },
  ];
  assert(
    getRecommendationMessage({
      candidates: passOnlyCandidates,
      globalPass: true,
      passReason: "Too many warnings",
    }) === "Too many warnings",
    "global pass message should surface pass reason"
  );

  const multiCandidates: RecommendationCandidate[] = [
    {
      marketType: "moneyline",
      selection: markets[0],
      confidence: "high",
      expectedValue: 0.08,
      score: 62,
      reasons: ["Home form"],
      warnings: [],
      supportingFeatures: ["Win Rate"],
    },
    {
      marketType: "totalGoals",
      selection: markets[2],
      confidence: "medium",
      expectedValue: 0.04,
      score: 41,
      reasons: ["Over trend"],
      warnings: [],
      supportingFeatures: ["Combined Over 2.5"],
    },
    {
      marketType: "btts",
      selection: markets[3],
      confidence: "low",
      expectedValue: 0.01,
      score: 22,
      reasons: ["BTTS trend"],
      warnings: [],
      supportingFeatures: ["Combined BTTS"],
    },
  ];
  const multiSorted = sortRecommendationCandidates(multiCandidates);
  assert(multiSorted[0].confidence === "high", "highest score card should remain first");
  assert(multiSorted[0].score === 62, "sort should prioritize score over level");

  const balancedReport = analyzeMatch(BALANCED_SAMPLE);
  assert(Boolean(balancedReport.recommendation), "analyzeMatch should attach recommendation section");
  assert(
    balancedReport.recommendation.enabled,
    "recommendation section should be enabled"
  );
  assert(
    balancedReport.recommendation.result !== null,
    "balanced sample should produce recommendation result"
  );
  assert(
    balancedReport.recommendation.result!.candidates.length > 0,
    "balanced sample should produce candidates"
  );

  const conflictReport = analyzeMatch(CONFLICT_SAMPLE);
  assert(
    conflictReport.recommendation.result !== null,
    "conflict sample should still attach recommendation result"
  );

  const emptyReport = analyzeMatch("");
  assert(
    emptyReport.recommendation.message === EMPTY_RECOMMENDATION_MESSAGE ||
      emptyReport.recommendation.result === null ||
      emptyReport.recommendation.result?.candidates.length === 0,
    "empty input should show insufficient recommendation message"
  );

  const pipeline = runFeatureRecommendationPipeline(
    {
      homeTeam: "Strong-Home FC",
      awayTeam: "Weak-Away FC",
      league: "Test League",
      marketSelections: [],
      selections: [],
      unknownMarkets: [],
      moneyline: [],
      handicap: [],
      overUnder: [],
      btts: [],
      oddEven: [],
      otherMarkets: [],
    },
    []
  );
  assert(
    pipeline.section.message === EMPTY_RECOMMENDATION_MESSAGE,
    "pipeline without markets should return empty recommendation message"
  );

  assert(GLOBAL_PASS_HEADLINE === "本場不建議下注", "global pass headline should be defined");

  console.log("Recommendation UI tests passed.");
}

runTests();
