import { fuseFeatureScores, type FeatureScore } from "@/lib/analysis/featureScore";
import type { FeatureFusionResult } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import {
  RecommendationEngine,
  generateRecommendations,
} from "@/lib/recommendation/recommendationEngine";
import type { RecommendationLevel } from "@/lib/recommendation/recommendationTypes";
import type { MarketSelection } from "@/types/match";

const EPSILON = 1e-4;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNear(
  actual: number,
  expected: number,
  message: string,
  tolerance = EPSILON
): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ~${expected}, got ${actual}`);
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

function buildStandardMarkets(): MarketSelection[] {
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
      side: "draw",
      odds: 3.4,
      line: null,
      rawLine: null,
      modifier: null,
      impliedProbability: 0.29,
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
      marketType: "handicap",
      marketFamily: "asianHandicap",
      title: "全場讓分",
      period: "full",
      side: "home",
      odds: 0.92,
      line: -0.5,
      rawLine: "-0.5",
      modifier: "plain",
      handicap: -0.5,
      impliedProbability: 1.087,
    },
    {
      marketType: "handicap",
      marketFamily: "asianHandicap",
      title: "全場讓分",
      period: "full",
      side: "away",
      odds: 0.94,
      line: 0.5,
      rawLine: "+0.5",
      modifier: "plain",
      handicap: 0.5,
      impliedProbability: 1.064,
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
      marketType: "totalGoals",
      marketFamily: "asianOverUnder",
      title: "全場大小",
      period: "full",
      side: "under",
      odds: 0.95,
      line: 2.5,
      rawLine: "2.5",
      modifier: "plain",
      impliedProbability: 1.053,
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
    {
      marketType: "btts",
      marketFamily: "btts",
      title: "雙方進球",
      period: "full",
      side: "no",
      odds: 0.98,
      line: null,
      rawLine: null,
      modifier: null,
      impliedProbability: 1.02,
    },
  ];
}

function buildHomeWinFusion(): FeatureFusionResult {
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

function buildAwayWinFusion(): FeatureFusionResult {
  return fuseFeatureScores([
    makeFeature("market_odds", -18, 0.8),
    makeFeature("recent_form.win_rate", -52, 0.78),
    makeFeature("recent_form.goal_difference", -38, 0.75),
    makeFeature("recent_form.momentum", -34, 0.72),
    makeFeature("home_away.home_advantage", -42, 0.74),
    makeFeature("goals_xg.expected_goal_advantage", -36, 0.73),
    makeFeature("league_strength.league_rank", -12, 0.7),
    makeFeature("scoring_pattern.combined_over_25", -20, 0.68),
    makeFeature("scoring_pattern.combined_btts", -16, 0.66),
    makeFeature("match_context.travel_fatigue", -14, 0.6),
  ]);
}

function buildBalancedFusion(): FeatureFusionResult {
  return fuseFeatureScores([
    makeFeature("market_odds", 2, 0.75),
    makeFeature("recent_form.win_rate", 4, 0.7),
    makeFeature("recent_form.momentum", -3, 0.68),
    makeFeature("home_away.home_advantage", 5, 0.72),
    makeFeature("goals_xg.expected_goal_advantage", -2, 0.7),
    makeFeature("league_strength.league_rank", 1, 0.66),
    makeFeature("scoring_pattern.combined_over_25", 3, 0.65),
    makeFeature("scoring_pattern.combined_btts", -1, 0.64),
    makeFeature("h2h.recent_momentum", 2, 0.55),
    makeFeature("match_context.rest_advantage", 0, 0.58),
  ]);
}

function buildOverFusion(): FeatureFusionResult {
  const fusion = buildHomeWinFusion();
  return fuseFeatureScores([
    makeFeature("market_odds", 10, 0.8),
    makeFeature("goals_xg.expected_goal_advantage", 48, 0.76),
    makeFeature("goals_xg.home_xg", 42, 0.74),
    makeFeature("goals_xg.away_xg", 35, 0.72),
    makeFeature("scoring_pattern.combined_over_25", 50, 0.75),
    makeFeature("scoring_pattern.average_total_goals", 44, 0.73),
    makeFeature("scoring_pattern.combined_btts", 28, 0.7),
    makeFeature("recent_form.goals_scored", 30, 0.68),
    makeFeature("match_context.weather_impact", 8, 0.45),
    makeFeature("home_away.home_attack", 22, 0.7),
  ]);
}

function buildUnderFusion(): FeatureFusionResult {
  return fuseFeatureScores([
    makeFeature("market_odds", 8, 0.78),
    makeFeature("goals_xg.expected_goal_advantage", -46, 0.76),
    makeFeature("goals_xg.home_xga", 40, 0.74),
    makeFeature("goals_xg.away_xga", 36, 0.72),
    makeFeature("scoring_pattern.combined_over_25", -48, 0.75),
    makeFeature("scoring_pattern.average_total_goals", -42, 0.73),
    makeFeature("recent_form.goals_conceded", -20, 0.68),
    makeFeature("home_away.home_defense", 24, 0.7),
    makeFeature("match_context.fixture_congestion", -10, 0.58),
    makeFeature("league_strength.defense_strength", 18, 0.66),
  ]);
}

function buildBttsYesFusion(): FeatureFusionResult {
  return fuseFeatureScores([
    makeFeature("market_odds", 12, 0.78),
    makeFeature("scoring_pattern.combined_btts", 52, 0.76),
    makeFeature("scoring_pattern.home_btts", 40, 0.72),
    makeFeature("scoring_pattern.away_btts", 38, 0.72),
    makeFeature("scoring_pattern.failed_to_score_risk", -35, 0.7),
    makeFeature("scoring_pattern.clean_sheet_conflict", -28, 0.68),
    makeFeature("goals_xg.home_xg", 30, 0.74),
    makeFeature("goals_xg.away_xg", 26, 0.72),
    makeFeature("recent_form.failed_to_score_rate", -22, 0.66),
    makeFeature("home_away.away_attack", 18, 0.68),
  ]);
}

function buildBttsNoFusion(): FeatureFusionResult {
  return fuseFeatureScores([
    makeFeature("market_odds", 10, 0.78),
    makeFeature("scoring_pattern.combined_btts", -50, 0.76),
    makeFeature("scoring_pattern.failed_to_score_risk", 42, 0.72),
    makeFeature("scoring_pattern.clean_sheet_conflict", 36, 0.7),
    makeFeature("recent_form.clean_sheet_rate", 30, 0.68),
    makeFeature("goals_xg.home_xga", 28, 0.74),
    makeFeature("goals_xg.away_xga", 24, 0.72),
    makeFeature("home_away.home_clean_sheet", 22, 0.7),
    makeFeature("home_away.away_clean_sheet", 20, 0.68),
    makeFeature("recent_form.failed_to_score_rate", 34, 0.66),
  ]);
}

function buildConflictFusion(): FeatureFusionResult {
  return fuseFeatureScores([
    makeFeature("market_odds", 15, 0.8),
    makeFeature("recent_form.win_rate", 60, 0.75),
    makeFeature("h2h.recent_momentum", -58, 0.65),
    makeFeature("home_away.home_advantage", 52, 0.72),
    makeFeature("squad_availability.injury_impact", -50, 0.7),
    makeFeature("goals_xg.expected_goal_advantage", 20, 0.7),
    makeFeature("scoring_pattern.combined_over_25", 18, 0.66),
    makeFeature("league_strength.league_rank", 10, 0.68),
    makeFeature("match_context.rest_advantage", 8, 0.58),
  ]);
}

function buildLowConfidenceFusion(): FeatureFusionResult {
  const fusion = buildHomeWinFusion();
  return {
    ...fusion,
    overallConfidence: 0.4,
  };
}

function buildEmptyFusion(): FeatureFusionResult {
  return fuseFeatureScores([]);
}

function findCandidate(
  candidates: ReturnType<typeof generateRecommendations>["candidates"],
  marketType: MarketSelection["marketType"],
  side: MarketSelection["side"]
) {
  return candidates.find(
    (candidate) =>
      candidate.marketType === marketType && candidate.selection.side === side
  );
}

function assertLevelAtLeast(level: RecommendationLevel, minimum: RecommendationLevel): void {
  const order: RecommendationLevel[] = ["pass", "low", "medium", "high"];
  assert(
    order.indexOf(level) >= order.indexOf(minimum),
    `expected level >= ${minimum}, got ${level}`
  );
}

function assertBounds(
  candidates: ReturnType<typeof generateRecommendations>["candidates"]
): void {
  for (const candidate of candidates) {
    assert(
      candidate.score >= -100 && candidate.score <= 100,
      `${candidate.selection.side} score out of bounds`
    );
    assert(
      ["pass", "low", "medium", "high"].includes(candidate.confidence),
      "invalid recommendation level"
    );
    assert(
      candidate.reasons.every(
        (reason) =>
          !reason.includes("保證") &&
          !reason.toLowerCase().includes("guarantee") &&
          !reason.toLowerCase().includes("roi")
      ),
      "reasons must not guarantee outcomes"
    );
  }
}

function runTests(): void {
  const markets = buildStandardMarkets();

  const homeWin = generateRecommendations(buildHomeWinFusion(), markets);
  const homeCandidate = findCandidate(homeWin.candidates, "moneyline", "home");
  const awayCandidate = findCandidate(homeWin.candidates, "moneyline", "away");
  assert(Boolean(homeCandidate), "home moneyline candidate should exist");
  assert(Boolean(awayCandidate), "away moneyline candidate should exist");
  assert(!homeWin.globalPass, "home win scenario should not global pass");
  assert(homeCandidate!.score > awayCandidate!.score, "home win should score higher than away");
  assertLevelAtLeast(homeCandidate!.confidence, "medium");
  assert(homeCandidate!.reasons.length > 0, "home win should include reasons");
  assert(
    homeCandidate!.supportingFeatures.length > 0,
    "home win should include supporting features"
  );

  const awayWin = generateRecommendations(buildAwayWinFusion(), markets);
  const awayWinCandidate = findCandidate(awayWin.candidates, "moneyline", "away");
  const homeLoseCandidate = findCandidate(awayWin.candidates, "moneyline", "home");
  assert(Boolean(awayWinCandidate), "away candidate should exist");
  assert(awayWinCandidate!.score > homeLoseCandidate!.score, "away win should outscore home");
  assertLevelAtLeast(awayWinCandidate!.confidence, "medium");

  const balanced = generateRecommendations(buildBalancedFusion(), markets);
  assert(!balanced.globalPass, "balanced scenario should not global pass");
  assert(
    balanced.candidates.every((candidate) => candidate.confidence === "pass"),
    "balanced scenario should PASS all selections"
  );

  const over = generateRecommendations(buildOverFusion(), markets);
  const overCandidate = findCandidate(over.candidates, "totalGoals", "over");
  const underCandidate = findCandidate(over.candidates, "totalGoals", "under");
  assert(Boolean(overCandidate), "over candidate should exist");
  assert(overCandidate!.score > underCandidate!.score, "over scenario should favor over");
  assertLevelAtLeast(overCandidate!.confidence, "low");

  const under = generateRecommendations(buildUnderFusion(), markets);
  const underPick = findCandidate(under.candidates, "totalGoals", "under");
  const overPick = findCandidate(under.candidates, "totalGoals", "over");
  assert(underPick!.score > overPick!.score, "under scenario should favor under");
  assertLevelAtLeast(underPick!.confidence, "low");

  const bttsYes = generateRecommendations(buildBttsYesFusion(), markets);
  const yesCandidate = findCandidate(bttsYes.candidates, "btts", "yes");
  const noCandidate = findCandidate(bttsYes.candidates, "btts", "no");
  assert(yesCandidate!.score > noCandidate!.score, "BTTS yes scenario should favor yes");
  assertLevelAtLeast(yesCandidate!.confidence, "low");

  const bttsNo = generateRecommendations(buildBttsNoFusion(), markets);
  const noPick = findCandidate(bttsNo.candidates, "btts", "no");
  const yesPick = findCandidate(bttsNo.candidates, "btts", "yes");
  assert(noPick!.score > yesPick!.score, "BTTS no scenario should favor no");
  assertLevelAtLeast(noPick!.confidence, "low");

  const handicap = generateRecommendations(buildHomeWinFusion(), markets);
  const homeHandicap = findCandidate(handicap.candidates, "handicap", "home");
  const awayHandicap = findCandidate(handicap.candidates, "handicap", "away");
  assert(Boolean(homeHandicap), "handicap home candidate should exist");
  assert(homeHandicap!.score > awayHandicap!.score, "handicap should lean home in home-win fusion");
  assertLevelAtLeast(homeHandicap!.confidence, "low");

  const conflict = generateRecommendations(buildConflictFusion(), markets);
  assert(conflict.globalPass, "feature conflict scenario should global pass");
  assert(
    conflict.candidates.every((candidate) => candidate.confidence === "pass"),
    "conflict scenario should PASS all candidates"
  );
  assert(
    conflict.passReason?.includes("conflict") ?? false,
    "conflict pass reason should mention conflict"
  );

  const lowConfidence = generateRecommendations(buildLowConfidenceFusion(), markets);
  assert(lowConfidence.globalPass, "low confidence should global pass");
  assert(
    lowConfidence.candidates.every((candidate) => candidate.confidence === "pass"),
    "low confidence should PASS all candidates"
  );

  const boundaryFusion = fuseFeatureScores([
    makeFeature("market_odds", 100, 1),
    makeFeature("recent_form.win_rate", 100, 1),
    makeFeature("recent_form.momentum", 95, 0.95),
    makeFeature("home_away.home_advantage", 90, 0.9),
    makeFeature("goals_xg.expected_goal_advantage", 88, 0.88),
    makeFeature("scoring_pattern.combined_over_25", 80, 0.85),
    makeFeature("scoring_pattern.combined_btts", 70, 0.82),
    makeFeature("league_strength.league_rank", 60, 0.8),
    makeFeature("match_context.rest_advantage", 55, 0.78),
    makeFeature("h2h.recent_momentum", 50, 0.75),
  ]);
  const boundary = generateRecommendations(boundaryFusion, markets);
  assertBounds(boundary.candidates);
  const boundaryHome = findCandidate(boundary.candidates, "moneyline", "home");
  assertLevelAtLeast(boundaryHome!.confidence, "high");
  assert(boundaryHome!.expectedValue > 0, "strong home edge should produce positive EV");

  const empty = generateRecommendations(buildEmptyFusion(), markets);
  assert(empty.globalPass, "empty fusion should global pass");
  assert(empty.candidates.length === markets.length, "empty fusion should still map markets");
  assert(
    empty.candidates.every((candidate) => candidate.confidence === "pass"),
    "empty fusion should PASS all candidates"
  );

  const engine = new RecommendationEngine();
  const engineResult = engine.recommend({
    fusion: buildHomeWinFusion(),
    marketSelections: markets,
  });
  assert(engineResult.candidates.length > 0, "RecommendationEngine should return candidates");

  console.log("Recommendation Engine tests passed.");
}

runTests();
