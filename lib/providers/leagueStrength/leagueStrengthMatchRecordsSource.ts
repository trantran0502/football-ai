import type { LeagueStrengthProviderRequest } from "@/lib/analysis/featureScore/providers/leagueStrengthProvider";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { computeLeagueStrengthProviderConfidence } from "@/lib/providers/leagueStrength/leagueStrengthConfidence";
import {
  buildLeagueStrengthSnapshotFromMatches,
  findLeagueMatchRecordsFromHistory,
} from "@/lib/providers/leagueStrength/leagueStrengthNormalizer";
import { getActiveProductionLeagueStrengthContext } from "@/lib/providers/leagueStrength/leagueStrengthProviderContext";
import {
  createEmptyLeagueStrengthDiagnostics,
  type ProductionLeagueStrengthResolution,
} from "@/lib/providers/leagueStrength/leagueStrengthTypes";

export function resolveLeagueStrengthFromMatchRecords(input: {
  request: LeagueStrengthProviderRequest;
  records: HistoricalMatchRecord[];
  referenceDate?: string;
}): ProductionLeagueStrengthResolution | null {
  const referenceDate =
    input.referenceDate ??
    input.request.matchDate ??
    new Date().toISOString().slice(0, 10);
  const { matches, stats } = findLeagueMatchRecordsFromHistory(
    input.records,
    input.request.leagueName
  );

  const diagnostics = createEmptyLeagueStrengthDiagnostics("matchRecords");
  diagnostics.rawCount = input.records.length;
  diagnostics.normalizedCount = matches.length;
  diagnostics.filteredFriendlyCount = stats.filteredFriendlyCount;
  diagnostics.filteredIncompleteCount = stats.filteredIncompleteCount;
  diagnostics.filteredStatusCount = stats.filteredStatusCount;
  diagnostics.filteredLeagueMismatchCount = stats.filteredLeagueMismatchCount;

  if (matches.length === 0) {
    return null;
  }

  const snapshot = buildLeagueStrengthSnapshotFromMatches({
    leagueName: input.request.leagueName,
    matches,
    referenceDate,
  });

  diagnostics.sampleSize = snapshot.sampleSize;
  diagnostics.source = "matchRecords";

  if (snapshot.sampleSize < 10) {
    diagnostics.warnings.push(
      `League strength sample size ${snapshot.sampleSize} is below minimum threshold (10).`
    );
  } else if (snapshot.sampleSize < 20) {
    diagnostics.warnings.push(
      `League strength sample size ${snapshot.sampleSize} is below normal confidence threshold (20).`
    );
  }

  return {
    snapshot,
    source: "matchRecords",
    confidence: computeLeagueStrengthProviderConfidence(
      snapshot.sampleSize,
      "matchRecords"
    ),
    diagnostics,
  };
}

export async function loadMatchRecordsForLeagueStrength(): Promise<
  HistoricalMatchRecord[]
> {
  const context = getActiveProductionLeagueStrengthContext();
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
