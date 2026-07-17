import { RECENT_FORM_FEATURE_IDS } from "@/lib/analysis/featureScore/collectors/recentFormCollector";
import { GOALS_XG_FEATURE_IDS } from "@/lib/analysis/featureScore/collectors/goalsXgCollector";
import { fuseFeatureScores } from "@/lib/analysis/featureScore/fusion/featureFusionEngine";
import type { FeatureScore } from "@/lib/analysis/featureScore/types";
import { integrateEvidenceForSelection } from "@/lib/evidence/evidenceIntegration";
import { collectEvidence } from "@/lib/evidence/evidenceEngine";
import type { EvidenceReport } from "@/lib/evidence/evidenceTypes";
import type { PreMatchSnapshot } from "@/lib/fundamentalsBacktest/fundamentalsBacktestTypes";
import type { MarketSelection } from "@/types/match";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formScore(summary: { wins: number; draws: number; played: number }): number {
  if (summary.played === 0) {
    return 0;
  }
  return clamp(((summary.wins + summary.draws * 0.5) / summary.played - 0.33) * 30, -20, 20);
}

function buildFeatureScoresFromSnapshot(snapshot: PreMatchSnapshot): FeatureScore[] {
  const homeFormScore = formScore(snapshot.homeFormBeforeMatch);
  const awayFormScore = formScore(snapshot.awayFormBeforeMatch);
  const homeAttack = snapshot.averageGoalsForBeforeMatch.home;
  const awayAttack = snapshot.averageGoalsForBeforeMatch.away;
  const homeXg = snapshot.xGBeforeMatch.home ?? homeAttack;
  const awayXg = snapshot.xGBeforeMatch.away ?? awayAttack;
  const homeXga = snapshot.xGABeforeMatch.home ?? snapshot.averageGoalsAgainstBeforeMatch.home;
  const awayXga = snapshot.xGABeforeMatch.away ?? snapshot.averageGoalsAgainstBeforeMatch.away;

  const h2hEdge =
    snapshot.h2hBeforeMatch === null
      ? 0
      : snapshot.h2hBeforeMatch.homeWins - snapshot.h2hBeforeMatch.awayWins;

  const standingsHome = snapshot.standingsBeforeMatch.find(
    (entry) => entry.teamName === snapshot.homeTeam
  );
  const standingsAway = snapshot.standingsBeforeMatch.find(
    (entry) => entry.teamName === snapshot.awayTeam
  );
  const leagueEdge =
    standingsHome && standingsAway ? standingsAway.position - standingsHome.position : 0;

  const squadEdge =
    snapshot.squadAvailabilityBeforeMatch === null
      ? 0
      : snapshot.squadAvailabilityBeforeMatch.homeAvailable -
        snapshot.squadAvailabilityBeforeMatch.awayAvailable;

  const contextEdge =
    snapshot.scheduleContextBeforeMatch === null
      ? 0
      : snapshot.scheduleContextBeforeMatch.awayDaysSinceLastMatch -
        snapshot.scheduleContextBeforeMatch.homeDaysSinceLastMatch;

  return [
    {
      id: RECENT_FORM_FEATURE_IDS.winRate,
      category: "moneyline",
      score: homeFormScore - awayFormScore,
      weight: 1,
      confidence: snapshot.recent10BeforeMatch.home.played > 0 ? 0.7 : 0.2,
      reason: "Recent form before match.",
    },
    {
      id: RECENT_FORM_FEATURE_IDS.homeForm,
      category: "moneyline",
      score: homeFormScore,
      weight: 1,
      confidence: snapshot.homeFormBeforeMatch.played > 0 ? 0.65 : 0.2,
      reason: "Home form before match.",
    },
    {
      id: RECENT_FORM_FEATURE_IDS.awayForm,
      category: "moneyline",
      score: -awayFormScore,
      weight: 1,
      confidence: snapshot.awayFormBeforeMatch.played > 0 ? 0.65 : 0.2,
      reason: "Away form before match.",
    },
    {
      id: "h2h.home_win_rate",
      category: "moneyline",
      score: clamp(h2hEdge * 4, -15, 15),
      weight: 1,
      confidence: snapshot.h2hBeforeMatch ? 0.6 : 0.15,
      reason: "Historical H2H before match.",
    },
    {
      id: GOALS_XG_FEATURE_IDS.homeXg,
      category: "totalGoals",
      score: clamp((homeXg - awayXga) * 8, -20, 20),
      weight: 1,
      confidence: snapshot.xGBeforeMatch.home !== null ? 0.72 : 0.25,
      reason: "Home xG before match.",
    },
    {
      id: GOALS_XG_FEATURE_IDS.awayXg,
      category: "totalGoals",
      score: clamp((awayXg - homeXga) * 8, -20, 20),
      weight: 1,
      confidence: snapshot.xGBeforeMatch.away !== null ? 0.72 : 0.25,
      reason: "Away xG before match.",
    },
    {
      id: "league_strength.home_advantage",
      category: "moneyline",
      score: clamp(leagueEdge, -12, 12),
      weight: 1,
      confidence: standingsHome && standingsAway ? 0.55 : 0.15,
      reason: "Standings before match.",
    },
    {
      id: "squad_availability.home_advantage",
      category: "moneyline",
      score: clamp(squadEdge, -10, 10),
      weight: 1,
      confidence: snapshot.squadAvailabilityBeforeMatch ? 0.5 : 0.15,
      reason: "Squad availability before match.",
    },
    {
      id: "match_context.home_advantage",
      category: "moneyline",
      score: clamp(contextEdge, -8, 8),
      weight: 1,
      confidence: snapshot.scheduleContextBeforeMatch ? 0.48 : 0.15,
      reason: "Schedule context before match.",
    },
  ];
}

export function collectEvidenceForSnapshot(snapshot: PreMatchSnapshot): EvidenceReport {
  const features = buildFeatureScoresFromSnapshot(snapshot);
  const fusion = fuseFeatureScores(features);
  const marketSelections: MarketSelection[] =
    snapshot.dataMode === "live_market_snapshot" && snapshot.storedMarketSnapshot
      ? snapshot.storedMarketSnapshot
      : [];

  return collectEvidence({
    fusion,
    features,
    marketSelections,
    providerAudit: null,
    teamProfiles: null,
  });
}

export function buildEvidenceBreakdownForSnapshot(snapshot: PreMatchSnapshot) {
  const report = collectEvidenceForSnapshot(snapshot);
  const integration = integrateEvidenceForSelection(report, 1);
  return {
    report,
    breakdown: integration.evidenceBreakdown,
    evidenceScore: integration.evidenceScore,
    evidenceConfidence: integration.evidenceConfidence,
  };
}
