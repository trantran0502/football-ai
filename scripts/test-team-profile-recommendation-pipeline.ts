import { runFeatureRecommendationPipeline } from "@/lib/analysis/featureRecommendationPipeline";
import { resetFeatureRecommendationPipelineForTests } from "@/lib/analysis/featureRecommendationPipeline";
import { createAnalysisSnapshotFromReport } from "@/lib/database/matchSchema";
import { parseOdds } from "@/lib/parser/parser";
import { normalizeMarketSelections } from "@/lib/parser/normalizeMarketSelections";
import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import type { GoalsXgSnapshot } from "@/lib/analysis/featureScore/providers/goalsXgProvider";
import type { TeamProfile } from "@/lib/teamProfile/teamProfileTypes";
import type { MatchTeamProfilesSnapshot } from "@/lib/teamProfile/teamProfileTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const SAMPLE_ODDS = `Arsenal vs Chelsea
獨贏
主 1.85
和 3.4
客 4.2
全場讓分
主-0.5 0.92
客+0.5 0.98
全場大小
大(2.5) 0.90
小(2.5) 0.96
雙方進球
是 0.82
否 1.02`;

function buildProfile(
  side: "home" | "away",
  overrides: Partial<TeamProfile> = {}
): TeamProfile {
  const base: TeamProfile = {
    teamId: side === "home" ? 42 : 49,
    teamName: side === "home" ? "Arsenal" : "Chelsea",
    leagueId: 39,
    leagueName: "Premier League",
    season: 2024,
    requestedSeason: 2026,
    isHistoricalBaseline: true,
    stalenessYears: 2,
    sampleSize: 10,
    recent10Wins: 6,
    recent10Draws: 2,
    recent10Losses: 2,
    recent10PointsPerGame: 2,
    recent10AvgGoals: 1.9,
    recent10AvgConceded: 1.1,
    home5Matches: 5,
    home5WinRate: 0.8,
    home5AvgGoals: 2.2,
    home5AvgConceded: 0.8,
    away5Matches: 5,
    away5WinRate: 0.4,
    away5AvgGoals: 1.3,
    away5AvgConceded: 1.5,
    bttsRate: 0.6,
    over25Rate: 0.7,
    over35Rate: 0.3,
    under25Rate: 0.3,
    cleanSheetRate: 0.35,
    failedToScoreRate: 0.15,
    avgShots: null,
    avgShotsOnTarget: null,
    avgPossession: null,
    avgXg: null,
    avgXga: null,
    formScore: 72,
    momentumScore: 58,
    source: "api-football",
    dataCompleteness: 85,
    calculatedAt: "2026-07-16T00:00:00.000Z",
  };
  return { ...base, ...overrides };
}

function buildSnapshot(
  overrides: Partial<MatchTeamProfilesSnapshot> = {}
): MatchTeamProfilesSnapshot {
  return {
    home: buildProfile("home"),
    away: buildProfile("away"),
    completeness: 85,
    warnings: [],
    ...overrides,
  };
}

export async function runTeamProfileRecommendationPipelineTests(): Promise<void> {
  resetFeatureRecommendationPipelineForTests();

  const match = parseOdds(SAMPLE_ODDS);
  const markets = normalizeMarketSelections(match.marketSelections);
  const snapshot = buildSnapshot();

  const pipeline = runFeatureRecommendationPipeline(
    { ...match, marketSelections: markets },
    markets,
    { teamProfiles: snapshot, matchDate: "2026-07-16" }
  );

  assert(pipeline.providerAudit !== null, "provider audit should be present");
  const recentForm = pipeline.providerAudit!.resolved.find(
    (entry) => entry.key === "recentForm"
  );
  const homeAway = pipeline.providerAudit!.resolved.find(
    (entry) => entry.key === "homeAway"
  );
  const scoringPattern = pipeline.providerAudit!.resolved.find(
    (entry) => entry.key === "scoringPattern"
  );
  const goalsXg = pipeline.providerAudit!.resolved.find(
    (entry) => entry.key === "goalsXg"
  );

  assert(recentForm?.source === "teamProfile", "recentForm should use team profile");
  assert(homeAway?.source === "teamProfile", "homeAway should use team profile");
  assert(
    scoringPattern?.source === "teamProfile",
    "scoringPattern should use team profile"
  );
  assert(goalsXg?.source === "teamProfile", "goalsXg should use team profile");

  const goalsData = goalsXg?.data as GoalsXgSnapshot;
  assert(goalsData.home.xG === null, "goalsXg xG should remain null");
  assert(goalsData.home.shots === null, "goalsXg shots should remain null");
  assert(
    goalsData.home.averageGoalsFor === 1.9,
    "goalsXg should map averageGoalsFor from team profile"
  );

  const recentFormFeature = pipeline.section.fusion?.strongestFactors.find((factor) =>
    factor.id.startsWith("recent_form.")
  );
  assert(
    pipeline.section.fusion !== null,
    "fusion should be produced with team profile providers"
  );

  const report = analyzeMatch(SAMPLE_ODDS, {
    teamProfiles: snapshot,
    matchDate: "2026-07-16",
  });
  const analysisSnapshot = createAnalysisSnapshotFromReport(
    report,
    "2026-07-16T00:00:00.000Z",
    "match-1",
    "2026-07-16"
  );
  const replayRecentForm = analysisSnapshot.replay?.providers.find(
    (provider) => provider.key === "recentForm"
  );
  const replayFeature = analysisSnapshot.replay?.features.find((feature) =>
    feature.id.startsWith("recent_form.")
  );

  assert(replayRecentForm?.source === "team-profile", "replay provider should be team-profile");
  assert(
    replayFeature?.source === "team-profile",
    "replay feature source should match provider source"
  );
  assert(
    (replayRecentForm?.data as { home: { sampleSize: number } }).home.sampleSize === 10,
    "replay provider data should come from team profile"
  );

  const previousMode = process.env.FOOTBALL_RECOMMENDATION_MODE;
  const previousAllowMock = process.env.ALLOW_MOCK_PROVIDERS;
  process.env.FOOTBALL_RECOMMENDATION_MODE = "production";
  process.env.ALLOW_MOCK_PROVIDERS = "false";
  resetFeatureRecommendationPipelineForTests();

  const incompleteSnapshot = buildSnapshot({
    home: buildProfile("home", { sampleSize: 0, source: "incomplete" }),
  });
  const productionPipeline = runFeatureRecommendationPipeline(
    { ...match, marketSelections: markets },
    markets,
    { teamProfiles: incompleteSnapshot, matchDate: "2026-07-16" }
  );

  const productionRecentForm = productionPipeline.providerAudit?.resolved.find(
    (entry) => entry.key === "recentForm"
  );
  assert(
    productionRecentForm?.source === "unavailable",
    "incomplete profile should not be treated as team profile source"
  );
  assert(
    productionPipeline.recommendation?.globalPass === false,
    "production guard should force pass when critical providers unavailable"
  );
  assert(
    (productionPipeline.recommendation?.passReason ?? "").includes("unavailable") ||
      (productionPipeline.recommendation?.passReason ?? "").includes("mock"),
    "production pass reason should mention unavailable/mock guard"
  );

  process.env.FOOTBALL_RECOMMENDATION_MODE = previousMode;
  process.env.ALLOW_MOCK_PROVIDERS = previousAllowMock;
  resetFeatureRecommendationPipelineForTests();

  void recentFormFeature;
}

if (require.main === module) {
  runTeamProfileRecommendationPipelineTests()
    .then(() => {
      console.log("All team profile recommendation pipeline tests passed.");
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
