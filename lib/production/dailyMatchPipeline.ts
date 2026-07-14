import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import type { SaveMatchOutcome } from "@/lib/database/matchSchema";
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
}

export async function runDailyMatchPipeline(
  fixtures: ProductionFixture[],
  runDate: string = new Date().toISOString().split("T")[0],
  dependencies: DailyMatchPipelineDependencies = {}
): Promise<DailyPipelineResult> {
  const analyze = dependencies.analyze ?? analyzeMatch;
  const saveMatch =
    dependencies.saveMatch ??
    (async () => {
      throw new Error("saveMatch dependency is required for production persistence.");
    });

  const items: DailyPipelineItemResult[] = [];
  let created = 0;
  let duplicates = 0;
  let failed = 0;

  for (const fixture of fixtures) {
    try {
      const report = analyze(fixture.rawOdds);
      const outcome = await saveMatch(
        fixture.rawOdds,
        report,
        fixture.matchDate
      );

      if (outcome.status === "created") {
        created += 1;
        items.push({
          fixture,
          status: "created",
          matchId: outcome.record.id,
        });
      } else {
        duplicates += 1;
        items.push({
          fixture,
          status: "duplicate",
          matchId: outcome.record.id,
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
