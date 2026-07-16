import type { ProviderRecommendationDiagnostic } from "@/lib/recommendation/providerWeightEngine";
import type { ProviderDataSource } from "@/lib/providers/registry/types";
import { toReplayDataSource } from "@/lib/providers/teamProfile/teamProfileProviderPipeline";
import type {
  ReplayDataSource,
  ReplayProviderRecommendationDiagnostic,
} from "@/lib/replay/replayTypes";

export interface RecommendationProviderDiagnosticRow {
  providerKey: string;
  source: ReplayDataSource;
  confidence: number;
  weight: number;
  contribution: number;
}

export interface RecommendationValidationDashboardData {
  usableProviderCount: number;
  unavailableProviderCount: number;
  providerOverallConfidence: number | null;
  providerDiagnostics: RecommendationProviderDiagnosticRow[];
}

const SOURCE_LABELS: Record<ReplayDataSource, string> = {
  api: "API",
  "api-football": "API-Football",
  google: "Google",
  cache: "Cache",
  mock: "Mock",
  hybrid: "Hybrid",
  "team-profile": "Team Profile",
  "match-records": "Match Records",
  unavailable: "Unavailable",
  unknown: "Unknown",
};

export function getProviderDiagnosticSourceLabel(
  source: ReplayDataSource
): string {
  return SOURCE_LABELS[source] ?? source;
}

export function getProviderDiagnosticSourceColorClass(
  source: ReplayDataSource
): string {
  switch (source) {
    case "match-records":
    case "team-profile":
    case "google":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
    case "unavailable":
      return "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";
  }
}

export function sortProviderDiagnosticsByContribution(
  rows: RecommendationProviderDiagnosticRow[]
): RecommendationProviderDiagnosticRow[] {
  return [...rows].sort((left, right) => {
    if (right.contribution !== left.contribution) {
      return right.contribution - left.contribution;
    }
    return right.weight - left.weight;
  });
}

export function mapEngineProviderDiagnostics(
  diagnostics: ProviderRecommendationDiagnostic[]
): ReplayProviderRecommendationDiagnostic[] {
  return diagnostics.map((entry) => ({
    providerKey: entry.providerKey,
    providerWeight: entry.providerWeight,
    providerContribution: entry.providerContribution,
    providerSource: toReplayDataSource(
      entry.providerSource as ProviderDataSource,
      entry.providerKey
    ),
    providerConfidence: entry.providerConfidence,
  }));
}

export function mapReplayProviderDiagnostics(
  diagnostics: ReplayProviderRecommendationDiagnostic[]
): RecommendationProviderDiagnosticRow[] {
  return diagnostics.map((entry) => ({
    providerKey: entry.providerKey,
    source: entry.providerSource,
    confidence: entry.providerConfidence,
    weight: entry.providerWeight,
    contribution: entry.providerContribution,
  }));
}

export function buildRecommendationValidationDashboardData(input: {
  usableProviderCount: number;
  unavailableProviderCount: number;
  providerOverallConfidence: number | null;
  providerDiagnostics: ReplayProviderRecommendationDiagnostic[];
}): RecommendationValidationDashboardData {
  return {
    usableProviderCount: input.usableProviderCount,
    unavailableProviderCount: input.unavailableProviderCount,
    providerOverallConfidence: input.providerOverallConfidence,
    providerDiagnostics: sortProviderDiagnosticsByContribution(
      mapReplayProviderDiagnostics(input.providerDiagnostics)
    ),
  };
}

export function buildRecommendationValidationDashboardFromEngine(input: {
  usableProviderCount: number;
  unavailableProviderCount: number;
  providerOverallConfidence: number | null;
  providerDiagnostics: ProviderRecommendationDiagnostic[];
}): RecommendationValidationDashboardData {
  const mapped = mapEngineProviderDiagnostics(input.providerDiagnostics);
  return buildRecommendationValidationDashboardData({
    usableProviderCount: input.usableProviderCount,
    unavailableProviderCount: input.unavailableProviderCount,
    providerOverallConfidence: input.providerOverallConfidence,
    providerDiagnostics: mapped,
  });
}

export function extractRecommendationValidationDashboardProps(
  record: import("@/lib/database/matchSchema").HistoricalMatchRecord
): {
  usableProviderCount: number;
  unavailableProviderCount: number;
  providerOverallConfidence: number | null;
  providerDiagnostics: ReplayProviderRecommendationDiagnostic[];
  matchLabel: string;
  matchId: string;
} | null {
  const replayRecommendation = record.analysisSnapshot?.replay?.recommendation;
  if (replayRecommendation) {
    return {
      usableProviderCount: replayRecommendation.usableProviderCount ?? 0,
      unavailableProviderCount: replayRecommendation.unavailableProviderCount ?? 0,
      providerOverallConfidence: replayRecommendation.providerOverallConfidence ?? null,
      providerDiagnostics: replayRecommendation.providerDiagnostics ?? [],
      matchLabel: `${record.homeTeam} vs ${record.awayTeam}`,
      matchId: record.id,
    };
  }

  const result = record.analysisSnapshot?.recommendation?.result;
  if (!result) {
    return null;
  }

  return {
    usableProviderCount: result.usableProviderCount ?? 0,
    unavailableProviderCount: result.unavailableProviderCount ?? 0,
    providerOverallConfidence: result.providerOverallConfidence ?? null,
    providerDiagnostics: mapEngineProviderDiagnostics(result.providerDiagnostics ?? []),
    matchLabel: `${record.homeTeam} vs ${record.awayTeam}`,
    matchId: record.id,
  };
}
