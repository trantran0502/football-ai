import {
  buildRecommendationValidationDashboardData,
  buildRecommendationValidationDashboardFromEngine,
  getProviderDiagnosticSourceColorClass,
  mapEngineProviderDiagnostics,
  sortProviderDiagnosticsByContribution,
} from "@/lib/recommendation/recommendationValidationDashboard";
import type { ProviderRecommendationDiagnostic } from "@/lib/recommendation/providerWeightEngine";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function runTests(): void {
  const diagnostics: ProviderRecommendationDiagnostic[] = [
    {
      providerKey: "recentForm",
      providerWeight: 0.4,
      providerContribution: 12.5,
      providerSource: "matchRecords",
      providerConfidence: 0.8,
    },
    {
      providerKey: "h2h",
      providerWeight: 0.2,
      providerContribution: 20,
      providerSource: "googleSearch",
      providerConfidence: 0.7,
    },
    {
      providerKey: "squadAvailability",
      providerWeight: 0,
      providerContribution: 0,
      providerSource: "unavailable",
      providerConfidence: 0.1,
    },
  ];

  const mapped = mapEngineProviderDiagnostics(diagnostics);
  assert(mapped[0].providerSource === "match-records", "matchRecords maps to match-records");
  assert(mapped[1].providerSource === "google", "googleSearch maps to google");

  const dashboard = buildRecommendationValidationDashboardFromEngine({
    usableProviderCount: 2,
    unavailableProviderCount: 1,
    providerOverallConfidence: 0.76,
    providerDiagnostics: diagnostics,
  });

  assert(dashboard.usableProviderCount === 2, "usableProviderCount preserved");
  assert(dashboard.unavailableProviderCount === 1, "unavailableProviderCount preserved");
  assert(
    dashboard.providerOverallConfidence === 0.76,
    "providerOverallConfidence preserved"
  );
  assert(
    dashboard.providerDiagnostics[0].providerKey === "h2h",
    "should sort by contribution desc"
  );
  assert(
    dashboard.providerDiagnostics[0].contribution === 20,
    "top contribution should be h2h"
  );

  const replayData = buildRecommendationValidationDashboardData({
    usableProviderCount: 2,
    unavailableProviderCount: 1,
    providerOverallConfidence: 0.76,
    providerDiagnostics: mapped,
  });
  assert(
    replayData.providerDiagnostics.length === 3,
    "replay and dashboard should share same row count"
  );

  assert(
    getProviderDiagnosticSourceColorClass("google").includes("emerald"),
    "google source should use green styling"
  );
  assert(
    getProviderDiagnosticSourceColorClass("team-profile").includes("emerald"),
    "team-profile source should use green styling"
  );
  assert(
    getProviderDiagnosticSourceColorClass("unavailable").includes("zinc"),
    "unavailable source should use gray styling"
  );

  const sorted = sortProviderDiagnosticsByContribution([
    {
      providerKey: "a",
      source: "google",
      confidence: 0.5,
      weight: 0.1,
      contribution: 1,
    },
    {
      providerKey: "b",
      source: "match-records",
      confidence: 0.5,
      weight: 0.2,
      contribution: 5,
    },
  ]);
  assert(sorted[0].providerKey === "b", "sort by contribution desc");

  console.log("Recommendation Validation Dashboard tests passed.");
}

runTests();

export {};
