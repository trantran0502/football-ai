import { BETA_ROLLING_REPORT_KEY, BETA_STORAGE_KEY } from "@/lib/beta/config";
import { readLocalBetaRecommendations, readLocalRollingReports } from "@/lib/beta/betaLocalStorage";
import { readLocalMatchRecords } from "@/lib/database/localStorageDatabase";
import {
  P0_EXPORT_SCHEMA_VERSION,
  type P0ExportBundle,
} from "@/lib/migration/p0ExportTypes";

export function buildP0ExportBundle(): P0ExportBundle {
  const matchRecords = readLocalMatchRecords();
  const betaRecommendations = readLocalBetaRecommendations();
  const betaRollingReports = readLocalRollingReports();

  return {
    schemaVersion: P0_EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    source: "localStorage",
    keys: {
      matchRecords: "football-ai-match-records",
      betaRecommendations: BETA_STORAGE_KEY,
      betaRollingReports: BETA_ROLLING_REPORT_KEY,
    },
    counts: {
      matchRecords: matchRecords.length,
      betaRecommendations: betaRecommendations.length,
      betaRollingReports: betaRollingReports.length,
    },
    data: {
      matchRecords,
      betaRecommendations,
      betaRollingReports,
    },
  };
}

export function serializeP0ExportBundle(bundle: P0ExportBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function downloadP0ExportBundle(bundle: P0ExportBundle = buildP0ExportBundle()): void {
  if (typeof window === "undefined") {
    throw new Error("P0 export download is only available in the browser.");
  }

  const blob = new Blob([serializeP0ExportBundle(bundle)], {
    type: "application/json;charset=utf-8",
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const timestamp = bundle.exportedAt.replace(/[:.]/g, "-");
  anchor.href = url;
  anchor.download = `football-ai-p0-export-${timestamp}.json`;
  anchor.click();
  window.URL.revokeObjectURL(url);
}
