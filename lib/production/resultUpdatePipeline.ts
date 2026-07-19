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

export interface ResultUpdateFixtureScore {
  fixtureId?: number | null;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  fullTimeHomeGoals: number;
  fullTimeAwayGoals: number;
  halfTimeHomeGoals: number | null;
  halfTimeAwayGoals: number | null;
}

export interface ResultUpdateBuildDiagnostics {
  matchedByFixtureId: number;
  matchedByFallback: number;
  unmatchedPendingCount: number;
  matchedPendingIds: string[];
}

export interface ResultUpdateBuildOutcome {
  updates: ProductionResultUpdate[];
  diagnostics: ResultUpdateBuildDiagnostics;
}

const TEAM_NAME_PUNCTUATION = /[.,'"()[\]]/g;

export function normalizeResultUpdateMatchDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.split("T")[0]?.slice(0, 10) ?? trimmed;
}

export function normalizeResultUpdateTeamName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(TEAM_NAME_PUNCTUATION, "")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findPendingMatchForScore(
  pendingRecords: HistoricalMatchRecord[],
  score: ResultUpdateFixtureScore,
  usedPendingIds: Set<string>
): { record: HistoricalMatchRecord; method: "fixtureId" | "fallback" } | null {
  const available = pendingRecords.filter((item) => !usedPendingIds.has(item.id));

  if (score.fixtureId != null) {
    const byFixtureId = available.find(
      (item) => item.fixtureId != null && item.fixtureId === score.fixtureId
    );
    if (byFixtureId) {
      return { record: byFixtureId, method: "fixtureId" };
    }
  }

  const normalizedDate = normalizeResultUpdateMatchDate(score.matchDate);
  const normalizedHome = normalizeResultUpdateTeamName(score.homeTeam);
  const normalizedAway = normalizeResultUpdateTeamName(score.awayTeam);

  const byFallback = available.find(
    (item) =>
      normalizeResultUpdateMatchDate(item.matchDate) === normalizedDate &&
      normalizeResultUpdateTeamName(item.homeTeam) === normalizedHome &&
      normalizeResultUpdateTeamName(item.awayTeam) === normalizedAway
  );
  if (byFallback) {
    return { record: byFallback, method: "fallback" };
  }

  return null;
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

export function buildResultUpdatesFromFixturesWithDiagnostics(
  pendingRecords: HistoricalMatchRecord[],
  finalScores: ResultUpdateFixtureScore[]
): ResultUpdateBuildOutcome {
  const updates: ProductionResultUpdate[] = [];
  const usedPendingIds = new Set<string>();
  let matchedByFixtureId = 0;
  let matchedByFallback = 0;

  for (const score of finalScores) {
    const match = findPendingMatchForScore(pendingRecords, score, usedPendingIds);
    if (!match) {
      continue;
    }

    usedPendingIds.add(match.record.id);
    if (match.method === "fixtureId") {
      matchedByFixtureId += 1;
    } else {
      matchedByFallback += 1;
    }

    updates.push({
      matchId: match.record.id,
      fullTimeHomeGoals: score.fullTimeHomeGoals,
      fullTimeAwayGoals: score.fullTimeAwayGoals,
      halfTimeHomeGoals: score.halfTimeHomeGoals,
      halfTimeAwayGoals: score.halfTimeAwayGoals,
    });
  }

  return {
    updates,
    diagnostics: {
      matchedByFixtureId,
      matchedByFallback,
      unmatchedPendingCount: pendingRecords.filter(
        (record) => !usedPendingIds.has(record.id)
      ).length,
      matchedPendingIds: [...usedPendingIds],
    },
  };
}

export function buildResultUpdatesFromFixtures(
  pendingRecords: HistoricalMatchRecord[],
  finalScores: ResultUpdateFixtureScore[]
): ProductionResultUpdate[] {
  return buildResultUpdatesFromFixturesWithDiagnostics(pendingRecords, finalScores)
    .updates;
}

export function listPendingProductionMatches(
  records: HistoricalMatchRecord[],
  now = new Date()
): HistoricalMatchRecord[] {
  return filterTrulyPendingVerificationRecords(records, now);
}
