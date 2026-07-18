import type { HistoricalMatchRecord, UpdateMatchResultInput } from "@/lib/database/matchSchema";
import { filterTrulyPendingVerificationRecords } from "@/lib/supabase/services/matchRecordPendingPolicy";
import type {
  ProductionResultUpdate,
  ResultPipelineItemResult,
  ResultPipelineResult,
} from "@/lib/production/productionTypes";

export interface ResultUpdatePipelineDependencies {
  verifyMatch?: (
    matchId: string,
    input: UpdateMatchResultInput
  ) => Promise<HistoricalMatchRecord | null>;
  listPending?: () => Promise<HistoricalMatchRecord[]>;
}

export async function runResultUpdatePipeline(
  updates: ProductionResultUpdate[],
  dependencies: ResultUpdatePipelineDependencies = {}
): Promise<ResultPipelineResult> {
  const verifyMatch =
    dependencies.verifyMatch ??
    (async () => {
      throw new Error("verifyMatch dependency is required for production persistence.");
    });

  const items: ResultPipelineItemResult[] = [];
  let verified = 0;
  let failed = 0;
  let skipped = 0;

  for (const update of updates) {
    try {
      const record = await verifyMatch(update.matchId, {
        fullTimeHomeGoals: update.fullTimeHomeGoals,
        fullTimeAwayGoals: update.fullTimeAwayGoals,
        halfTimeHomeGoals: update.halfTimeHomeGoals,
        halfTimeAwayGoals: update.halfTimeAwayGoals,
      });

      if (!record) {
        skipped += 1;
        items.push({
          matchId: update.matchId,
          status: "not_found",
        });
        continue;
      }

      if (record.status === "VERIFIED") {
        verified += 1;
        items.push({
          matchId: update.matchId,
          status: "verified",
        });
        continue;
      }

      if (record.status === "FAILED") {
        failed += 1;
        items.push({
          matchId: update.matchId,
          status: "failed",
        });
        continue;
      }

      skipped += 1;
      items.push({
        matchId: update.matchId,
        status: "skipped",
      });
    } catch (error) {
      failed += 1;
      items.push({
        matchId: update.matchId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    processed: updates.length,
    verified,
    failed,
    skipped,
    items,
  };
}

export function buildResultUpdatesFromFixtures(
  pendingRecords: HistoricalMatchRecord[],
  finalScores: Array<{
    homeTeam: string;
    awayTeam: string;
    matchDate: string;
    fullTimeHomeGoals: number;
    fullTimeAwayGoals: number;
    halfTimeHomeGoals: number;
    halfTimeAwayGoals: number;
  }>
): ProductionResultUpdate[] {
  const updates: ProductionResultUpdate[] = [];

  for (const score of finalScores) {
    const record = pendingRecords.find(
      (item) =>
        item.homeTeam === score.homeTeam &&
        item.awayTeam === score.awayTeam &&
        item.matchDate === score.matchDate
    );
    if (!record) {
      continue;
    }
    updates.push({
      matchId: record.id,
      fullTimeHomeGoals: score.fullTimeHomeGoals,
      fullTimeAwayGoals: score.fullTimeAwayGoals,
      halfTimeHomeGoals: score.halfTimeHomeGoals,
      halfTimeAwayGoals: score.halfTimeAwayGoals,
    });
  }

  return updates;
}

export function listPendingProductionMatches(
  records: HistoricalMatchRecord[],
  now = new Date()
): HistoricalMatchRecord[] {
  return filterTrulyPendingVerificationRecords(records, now);
}
