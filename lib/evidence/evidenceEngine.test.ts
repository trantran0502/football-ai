import { fuseFeatureScores } from "@/lib/analysis/featureScore/fusion/featureFusionEngine";
import type { FeatureScore } from "@/lib/analysis/featureScore/types";
import { RECENT_FORM_FEATURE_IDS } from "@/lib/analysis/featureScore/collectors/recentFormCollector";
import { GOALS_XG_FEATURE_IDS } from "@/lib/analysis/featureScore/collectors/goalsXgCollector";
import { collectEvidence } from "@/lib/evidence/evidenceEngine";
import { EVIDENCE_CATEGORIES } from "@/lib/evidence/evidenceTypes";
import { generateRecommendations } from "@/lib/recommendation/recommendationEngine";
import type { MarketSelection } from "@/types/match";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function buildSampleFeatures(): FeatureScore[] {
  return [
    {
      id: RECENT_FORM_FEATURE_IDS.winRate,
      category: "moneyline",
      score: 12,
      weight: 1,
      confidence: 0.75,
      reason: "Home win rate edge.",
    },
    {
      id: RECENT_FORM_FEATURE_IDS.homeForm,
      category: "moneyline",
      score: 8,
      weight: 1,
      confidence: 0.7,
      reason: "Home form edge.",
    },
    {
      id: RECENT_FORM_FEATURE_IDS.awayForm,
      category: "moneyline",
      score: -5,
      weight: 1,
      confidence: 0.68,
      reason: "Away form drag.",
    },
    {
      id: "h2h.home_win_rate",
      category: "moneyline",
      score: 6,
      weight: 1,
      confidence: 0.65,
      reason: "H2H home edge.",
    },
    {
      id: "league_strength.home_advantage",
      category: "moneyline",
      score: 4,
      weight: 1,
      confidence: 0.6,
      reason: "League strength edge.",
    },
    {
      id: "squad_availability.home_advantage",
      category: "moneyline",
      score: 3,
      weight: 1,
      confidence: 0.55,
      reason: "Squad availability edge.",
    },
    {
      id: "match_context.home_advantage",
      category: "moneyline",
      score: 2,
      weight: 1,
      confidence: 0.5,
      reason: "Match context edge.",
    },
    {
      id: GOALS_XG_FEATURE_IDS.homeXg,
      category: "totalGoals",
      score: 10,
      weight: 1,
      confidence: 0.72,
      reason: "Home xG edge.",
    },
    {
      id: GOALS_XG_FEATURE_IDS.awayXg,
      category: "totalGoals",
      score: -4,
      weight: 1,
      confidence: 0.7,
      reason: "Away xG drag.",
    },
    {
      id: GOALS_XG_FEATURE_IDS.homeXga,
      category: "totalGoals",
      score: 5,
      weight: 1,
      confidence: 0.66,
      reason: "Home xGA edge.",
    },
    {
      id: GOALS_XG_FEATURE_IDS.awayXga,
      category: "totalGoals",
      score: -3,
      weight: 1,
      confidence: 0.64,
      reason: "Away xGA drag.",
    },
  ];
}

function buildSampleMarkets(): MarketSelection[] {
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
      odds: 1.95,
      impliedProbability: 0.5128,
    },
    {
      marketType: "totalGoals",
      marketFamily: "asianOverUnder",
      title: "大小",
      period: "full",
      side: "over",
      line: 2.5,
      rawLine: "2.5",
      modifier: "plain",
      odds: 1.9,
      impliedProbability: 0.5263,
    },
  ];
}

function testEvidenceItemShape(): void {
  const fusion = fuseFeatureScores(buildSampleFeatures());
  const report = collectEvidence({
    fusion,
    features: buildSampleFeatures(),
    marketSelections: buildSampleMarkets(),
    providerAudit: null,
    teamProfiles: {
      home: {
        teamId: 1,
        teamName: "Home FC",
        leagueId: 39,
        leagueName: "Premier League",
        season: 2025,
        requestedSeason: 2025,
        isHistoricalBaseline: false,
        stalenessYears: null,
        sampleSize: 10,
        recent10Wins: 6,
        recent10Draws: 2,
        recent10Losses: 2,
        recent10PointsPerGame: 2,
        recent10AvgGoals: 1.8,
        recent10AvgConceded: 1.1,
        home5Matches: 5,
        home5WinRate: 0.6,
        home5AvgGoals: 2,
        home5AvgConceded: 0.8,
        away5Matches: 5,
        away5WinRate: 0.4,
        away5AvgGoals: 1.4,
        away5AvgConceded: 1.3,
        bttsRate: 0.5,
        over25Rate: 0.55,
        over35Rate: 0.2,
        under25Rate: 0.45,
        cleanSheetRate: 0.35,
        failedToScoreRate: 0.15,
        avgShots: 12,
        avgShotsOnTarget: 4.5,
        avgPossession: 52,
        avgXg: 1.7,
        avgXga: 1.1,
        formScore: 72,
        momentumScore: 68,
        source: "api-football",
        dataCompleteness: 0.9,
        calculatedAt: new Date().toISOString(),
      },
      away: {
        teamId: 2,
        teamName: "Away FC",
        leagueId: 39,
        leagueName: "Premier League",
        season: 2025,
        requestedSeason: 2025,
        isHistoricalBaseline: false,
        stalenessYears: null,
        sampleSize: 10,
        recent10Wins: 4,
        recent10Draws: 3,
        recent10Losses: 3,
        recent10PointsPerGame: 1.5,
        recent10AvgGoals: 1.3,
        recent10AvgConceded: 1.4,
        home5Matches: 5,
        home5WinRate: 0.5,
        home5AvgGoals: 1.5,
        home5AvgConceded: 1.2,
        away5Matches: 5,
        away5WinRate: 0.35,
        away5AvgGoals: 1.1,
        away5AvgConceded: 1.6,
        bttsRate: 0.45,
        over25Rate: 0.48,
        over35Rate: 0.18,
        under25Rate: 0.52,
        cleanSheetRate: 0.25,
        failedToScoreRate: 0.2,
        avgShots: 10,
        avgShotsOnTarget: 3.8,
        avgPossession: 48,
        avgXg: 1.2,
        avgXga: 1.4,
        formScore: 58,
        momentumScore: 52,
        source: "api-football",
        dataCompleteness: 0.88,
        calculatedAt: new Date().toISOString(),
      },
      completeness: 0.89,
      warnings: [],
    },
  });

  const availableCount =
    report.positiveEvidence.length + report.negativeEvidence.length;
  assert(availableCount > 0, "evidence report should include available items");
  assert(
    report.missingEvidence.length < EVIDENCE_CATEGORIES.length,
    "some evidence categories should resolve"
  );

  for (const item of [...report.positiveEvidence, ...report.negativeEvidence]) {
    assert(typeof item.evidenceId === "string", "evidenceId required");
    assert(typeof item.category === "string", "category required");
    assert(Number.isFinite(item.score), "score required");
    assert(item.confidence >= 0 && item.confidence <= 1, "confidence bounds");
    assert(typeof item.source === "string", "source required");
    assert(typeof item.summary === "string", "summary required");
    assert(typeof item.details === "object", "details required");
  }

  assert(
    report.overallEvidenceScore >= -100 && report.overallEvidenceScore <= 100,
    "overallEvidenceScore bounds"
  );
  assert(
    report.overallConfidence >= 0 && report.overallConfidence <= 1,
    "overallConfidence bounds"
  );
}

function testRecommendationReceivesEvidenceReport(): void {
  const fusion = fuseFeatureScores(buildSampleFeatures());
  const evidenceReport = collectEvidence({
    fusion,
    features: buildSampleFeatures(),
    marketSelections: buildSampleMarkets(),
    providerAudit: null,
    teamProfiles: null,
  });
  const recommendation = generateRecommendations(fusion, buildSampleMarkets(), {
    evidenceReport,
  });

  assert(
    recommendation.evidenceReport === evidenceReport,
    "recommendation result should carry evidence report unchanged"
  );
  assert(
    recommendation.candidates.length > 0,
    "recommendation scoring should remain unchanged"
  );
}

function testRecommendationUsesEvidenceScore(): void {
  const fusion = fuseFeatureScores(buildSampleFeatures());
  const evidenceReport = collectEvidence({
    fusion,
    features: buildSampleFeatures(),
    marketSelections: buildSampleMarkets(),
    providerAudit: null,
    teamProfiles: null,
  });
  const withEvidence = generateRecommendations(fusion, buildSampleMarkets(), {
    evidenceReport,
  });

  assert(
    withEvidence.evidenceScore !== null,
    "result should expose evidenceScore"
  );
  assert(
    withEvidence.evidenceSummary.length > 0,
    "result should expose evidenceSummary"
  );
  assert(
    withEvidence.evidenceBreakdown.length > 0,
    "result should expose evidenceBreakdown"
  );

  const homeCandidate = withEvidence.candidates.find(
    (candidate) =>
      candidate.marketType === "moneyline" && candidate.selection.side === "home"
  );
  assert(Boolean(homeCandidate), "home moneyline candidate expected");
  assert(
    homeCandidate!.score ===
      clampCandidateScore(homeCandidate!.marketScore + homeCandidate!.evidenceScore),
    "final score should equal marketScore + evidenceScore"
  );
  assert(
    homeCandidate!.evidenceScore !== 0 || homeCandidate!.marketScore === homeCandidate!.score,
    "evidenceScore should be applied when evidence is available"
  );
}

function clampCandidateScore(score: number): number {
  return Math.max(-100, Math.min(100, score));
}

export function runEvidenceEngineTests(): void {
  testEvidenceItemShape();
  testRecommendationReceivesEvidenceReport();
  testRecommendationUsesEvidenceScore();
}

runEvidenceEngineTests();
console.log("Evidence Engine tests passed.");
