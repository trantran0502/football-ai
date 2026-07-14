import type { BetaRecommendationRecord, RollingEvaluationReport } from "@/lib/beta/types";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";

export const P0_EXPORT_SCHEMA_VERSION = 1;

export interface P0ExportBundle {
  schemaVersion: typeof P0_EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  source: "localStorage";
  keys: {
    matchRecords: "football-ai-match-records";
    betaRecommendations: "football-ai-beta-recommendations";
    betaRollingReports: "football-ai-beta-rolling-reports";
  };
  counts: {
    matchRecords: number;
    betaRecommendations: number;
    betaRollingReports: number;
  };
  data: {
    matchRecords: HistoricalMatchRecord[];
    betaRecommendations: BetaRecommendationRecord[];
    betaRollingReports: RollingEvaluationReport[];
  };
}

export interface P0ImportSectionResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export interface P0ImportResult {
  matchRecords: P0ImportSectionResult;
  betaRecommendations: P0ImportSectionResult;
  betaRollingReports: P0ImportSectionResult;
  totals: {
    imported: number;
    skipped: number;
    failed: number;
  };
}

export function summarizeP0ImportResult(result: P0ImportResult): P0ImportResult["totals"] {
  const sections = [
    result.matchRecords,
    result.betaRecommendations,
    result.betaRollingReports,
  ];

  return {
    imported: sections.reduce((sum, item) => sum + item.imported, 0),
    skipped: sections.reduce((sum, item) => sum + item.skipped, 0),
    failed: sections.reduce((sum, item) => sum + item.failed, 0),
  };
}

export function createEmptyP0ImportSectionResult(): P0ImportSectionResult {
  return {
    imported: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
}

export function createEmptyP0ImportResult(): P0ImportResult {
  return {
    matchRecords: createEmptyP0ImportSectionResult(),
    betaRecommendations: createEmptyP0ImportSectionResult(),
    betaRollingReports: createEmptyP0ImportSectionResult(),
    totals: {
      imported: 0,
      skipped: 0,
      failed: 0,
    },
  };
}

export function isP0ExportBundle(value: unknown): value is P0ExportBundle {
  if (!value || typeof value !== "object") {
    return false;
  }

  const bundle = value as Partial<P0ExportBundle>;
  return (
    bundle.schemaVersion === P0_EXPORT_SCHEMA_VERSION &&
    typeof bundle.exportedAt === "string" &&
    bundle.source === "localStorage" &&
    !!bundle.data &&
    Array.isArray(bundle.data.matchRecords) &&
    Array.isArray(bundle.data.betaRecommendations) &&
    Array.isArray(bundle.data.betaRollingReports)
  );
}
