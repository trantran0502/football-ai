import { registerGoalsXgCollector } from "@/lib/analysis/featureScore/collectors/goalsXgCollector";
import { registerH2HCollector } from "@/lib/analysis/featureScore/collectors/h2hCollector";
import { registerHomeAwayCollector } from "@/lib/analysis/featureScore/collectors/homeAwayCollector";
import { registerLeagueStrengthCollector } from "@/lib/analysis/featureScore/collectors/leagueStrengthCollector";
import { registerMarketOddsCollector } from "@/lib/analysis/featureScore/collectors/marketOddsCollector";
import { registerMatchContextCollector } from "@/lib/analysis/featureScore/collectors/matchContextCollector";
import { registerRecentFormCollector } from "@/lib/analysis/featureScore/collectors/recentFormCollector";
import { registerScoringPatternCollector } from "@/lib/analysis/featureScore/collectors/scoringPatternCollector";
import { registerSquadAvailabilityCollector } from "@/lib/analysis/featureScore/collectors/squadAvailabilityCollector";

export function registerAllFeatureCollectors(): void {
  registerMarketOddsCollector();
  registerRecentFormCollector();
  registerLeagueStrengthCollector();
  registerHomeAwayCollector();
  registerGoalsXgCollector();
  registerScoringPatternCollector();
  registerH2HCollector();
  registerSquadAvailabilityCollector();
  registerMatchContextCollector();
}
