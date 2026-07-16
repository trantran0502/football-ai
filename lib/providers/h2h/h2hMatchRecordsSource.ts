import type { H2HProviderRequest } from "@/lib/analysis/featureScore/providers/h2hProvider";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  buildH2HSnapshotFromMatches,
  findH2HMatchRecordsFromHistory,
} from "@/lib/providers/h2h/h2hNormalizer";
import { computeH2HProviderConfidence } from "@/lib/providers/h2h/h2hConfidence";
import {
  createEmptyH2HDiagnostics,
  type ProductionH2HResolution,
} from "@/lib/providers/h2h/h2hTypes";
import { getActiveProductionH2HContext } from "@/lib/providers/h2h/h2hProviderContext";

export function resolveH2HFromMatchRecords(input: {
  request: H2HProviderRequest;
  records: HistoricalMatchRecord[];
}): ProductionH2HResolution | null {
  const referenceDate = input.request.matchDate ?? new Date().toISOString().slice(0, 10);
  const { matches, stats } = findH2HMatchRecordsFromHistory(
    input.records,
    input.request.homeTeam,
    input.request.awayTeam,
    input.request.matchDate
  );

  const diagnostics = createEmptyH2HDiagnostics("matchRecords");
  diagnostics.rawCount = input.records.length;
  diagnostics.normalizedCount = matches.length;
  diagnostics.filteredFriendlyCount = stats.filteredFriendlyCount;
  diagnostics.filteredIncompleteCount = stats.filteredIncompleteCount;
  diagnostics.filteredStatusCount = stats.filteredStatusCount;

  if (matches.length === 0) {
    return null;
  }

  const snapshot = buildH2HSnapshotFromMatches({
    matches,
    referenceDate,
    currentHomeTeam: input.request.homeTeam,
    currentAwayTeam: input.request.awayTeam,
  });

  diagnostics.sampleSize = snapshot.sampleSize;
  diagnostics.source = "matchRecords";

  return {
    snapshot,
    source: "matchRecords",
    confidence: computeH2HProviderConfidence(snapshot, "matchRecords"),
    diagnostics,
  };
}

export async function loadMatchRecordsForH2H(): Promise<HistoricalMatchRecord[]> {
  const context = getActiveProductionH2HContext();
  if (!context) {
    return [];
  }
  if (context.matchRecords) {
    return context.matchRecords;
  }
  if (context.loadMatchRecords) {
    return await context.loadMatchRecords();
  }
  return [];
}

export function fetchMatchRecordsH2HSourceData(
  request: H2HProviderRequest
): ProductionH2HResolution | null {
  const context = getActiveProductionH2HContext();
  const records = context?.matchRecords ?? [];
  if (records.length === 0) {
    return null;
  }
  return resolveH2HFromMatchRecords({ request, records });
}
