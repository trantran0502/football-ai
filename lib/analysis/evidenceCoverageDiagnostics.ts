import { getGoogleSearchProvider } from "@/lib/providers/googleSearch/googleSearchProvider";
import { getApiFootballClient } from "@/lib/providers/apiFootball/apiFootballClient";

export type EvidenceCoverageStatus =
  | "implemented"
  | "configured"
  | "called"
  | "persisted"
  | "available"
  | "unavailable";

export interface EvidenceProviderCoverageReport {
  provider: string;
  implemented: boolean;
  configured: boolean;
  called: boolean;
  persisted: boolean;
  available: boolean;
  unavailableReason: string | null;
}

export interface EvidenceCoverageDiagnosticsInput {
  recentFormAvailable?: boolean;
  homeAwayAvailable?: boolean;
  goalsMetricsAvailable?: boolean;
  h2hAvailable?: boolean;
  xgAvailable?: boolean;
  xgaAvailable?: boolean;
  leagueStrengthAvailable?: boolean;
  squadAvailabilityAvailable?: boolean;
  matchContextAvailable?: boolean;
  groundingConfigured?: boolean;
  groundingCalled?: boolean;
  groundingPersisted?: boolean;
}

export function buildEvidenceCoverageDiagnostics(
  input: EvidenceCoverageDiagnosticsInput = {}
): EvidenceProviderCoverageReport[] {
  const apiConfigured = getApiFootballClient().isConfigured();
  const googleConfigured = getGoogleSearchProvider().isConfigured();

  return [
    {
      provider: "recent_form",
      implemented: true,
      configured: apiConfigured,
      called: input.recentFormAvailable ?? false,
      persisted: input.recentFormAvailable ?? false,
      available: input.recentFormAvailable ?? false,
      unavailableReason: input.recentFormAvailable ? null : "team_profile_recent_form_missing",
    },
    {
      provider: "home_away",
      implemented: true,
      configured: apiConfigured,
      called: input.homeAwayAvailable ?? false,
      persisted: input.homeAwayAvailable ?? false,
      available: input.homeAwayAvailable ?? false,
      unavailableReason: input.homeAwayAvailable ? null : "home_away_metrics_missing",
    },
    {
      provider: "goals_scored_conceded",
      implemented: true,
      configured: apiConfigured,
      called: input.goalsMetricsAvailable ?? false,
      persisted: input.goalsMetricsAvailable ?? false,
      available: input.goalsMetricsAvailable ?? false,
      unavailableReason: input.goalsMetricsAvailable ? null : "goals_metrics_missing",
    },
    {
      provider: "h2h",
      implemented: true,
      configured: true,
      called: input.h2hAvailable ?? false,
      persisted: input.h2hAvailable ?? false,
      available: input.h2hAvailable ?? false,
      unavailableReason: input.h2hAvailable ? null : "insufficient_verified_h2h_history",
    },
    {
      provider: "xg",
      implemented: true,
      configured: apiConfigured,
      called: input.xgAvailable ?? false,
      persisted: input.xgAvailable ?? false,
      available: input.xgAvailable ?? false,
      unavailableReason: input.xgAvailable ? null : "api_football_xg_not_available_on_plan",
    },
    {
      provider: "xga",
      implemented: true,
      configured: apiConfigured,
      called: input.xgaAvailable ?? false,
      persisted: input.xgaAvailable ?? false,
      available: input.xgaAvailable ?? false,
      unavailableReason: input.xgaAvailable ? null : "api_football_xga_not_available_on_plan",
    },
    {
      provider: "league_strength",
      implemented: true,
      configured: true,
      called: input.leagueStrengthAvailable ?? false,
      persisted: input.leagueStrengthAvailable ?? false,
      available: input.leagueStrengthAvailable ?? false,
      unavailableReason: input.leagueStrengthAvailable ? null : "insufficient_league_history",
    },
    {
      provider: "squad_availability",
      implemented: true,
      configured: googleConfigured,
      called: input.squadAvailabilityAvailable ?? false,
      persisted: input.squadAvailabilityAvailable ?? false,
      available: input.squadAvailabilityAvailable ?? false,
      unavailableReason: googleConfigured
        ? input.squadAvailabilityAvailable
          ? null
          : "grounding_or_match_records_unavailable"
        : "google_grounding_not_configured",
    },
    {
      provider: "match_context",
      implemented: true,
      configured: googleConfigured,
      called: input.matchContextAvailable ?? false,
      persisted: input.matchContextAvailable ?? false,
      available: input.matchContextAvailable ?? false,
      unavailableReason: googleConfigured
        ? input.matchContextAvailable
          ? null
          : "grounding_or_match_records_unavailable"
        : "google_grounding_not_configured",
    },
    {
      provider: "google_grounding",
      implemented: true,
      configured: googleConfigured,
      called: input.groundingCalled ?? false,
      persisted: input.groundingPersisted ?? false,
      available: input.groundingPersisted ?? false,
      unavailableReason: googleConfigured
        ? input.groundingPersisted
          ? null
          : "grounding_not_persisted"
        : "not_configured",
    },
  ];
}
