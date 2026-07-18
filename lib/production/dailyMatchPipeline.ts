import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import type { SaveMatchOutcome } from "@/lib/database/matchSchema";
import {
  loadRuntimeWeightConfigForProduction,
  type RuntimeWeightConfigLoaderDeps,
} from "@/lib/recommendation/runtimeWeightConfigLoader";
import type {
  DailyPipelineItemResult,
  DailyPipelineResult,
  ProductionFixture,
} from "@/lib/production/productionTypes";

export interface DailyMatchPipelineDependencies {
  analyze?: typeof analyzeMatch;
  saveMatch?: (
    rawOdds: string,
    report: ReturnType<typeof analyzeMatch>,
    matchDate: string
  ) => Promise<SaveMatchOutcome>;
  loadRuntimeWeightConfig?: (
    deps?: RuntimeWeightConfigLoaderDeps
  ) => ReturnType<typeof loadRuntimeWeightConfigForProduction>;
}

export async function runDailyMatchPipeline(
  fixtures: ProductionFixture[],
  runDate: string = new Date().toISOString().split("T")[0],
  dependencies: DailyMatchPipelineDependencies = {}
): Promise<DailyPipelineResult> {
  const analyze = dependencies.analyze ?? analyzeMatch;
  const loadRuntimeWeightConfig =
    dependencies.loadRuntimeWeightConfig ?? loadRuntimeWeightConfigForProduction;
  const saveMatch =
    dependencies.saveMatch ??
    (async () => {
      throw new Error("saveMatch dependency is required for production persistence.");
    });

  const items: DailyPipelineItemResult[] = [];
  let created = 0;
  let duplicates = 0;
  let failed = 0;

  const runtimeWeightConfig = await loadRuntimeWeightConfig();

  for (const fixture of fixtures) {
    try {
      const report = analyze(fixture.rawOdds, { runtimeWeightConfig });
      const outcome = await saveMatch(
        fixture.rawOdds,
        report,
        fixture.matchDate
      );

      if (outcome.status === "created" || outcome.status === "enriched") {
        created += 1;
        items.push({
          fixture,
          status: outcome.status === "enriched" ? "enriched" : "created",
          matchId: outcome.record.id,
        });
      } else if (outcome.record) {
        duplicates += 1;
        items.push({
          fixture,
          status: "duplicate",
          matchId: outcome.record.id,
        });
      } else {
        failed += 1;
        items.push({
          fixture,
          status: "failed",
          error:
            outcome.status === "incomplete_analysis_rejected"
              ? outcome.reason
              : "Save rejected.",
        });
      }
    } catch (error) {
      failed += 1;
      items.push({
        fixture,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    runDate,
    processed: fixtures.length,
    created,
    duplicates,
    failed,
    items,
  };
}

export function filterFixturesForDate(
  fixtures: ProductionFixture[],
  matchDate: string
): ProductionFixture[] {
  return fixtures.filter((fixture) => fixture.matchDate === matchDate);
}
