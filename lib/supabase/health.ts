import { probeSupabaseApiKeyAccess } from "@/lib/supabase/admin";
import {
  getSupabaseConfigSummary,
  getSupabaseEnv,
  hasSupabaseEnv,
} from "@/lib/supabase/env";
import {
  normalizeUnknownError,
  type SupabaseErrorDetails,
} from "@/lib/supabase/errors";
import { countBetaRecommendationsFromSupabase } from "@/lib/supabase/queries/betaRecommendations";
import { countBetaRollingReportsFromSupabase } from "@/lib/supabase/queries/betaRollingReports";
import { countMatchRecordsFromSupabase } from "@/lib/supabase/queries/matchRecords";

export interface SupabaseHealthSnapshot {
  configured: boolean;
  connected: boolean;
  config?: {
    urlHost: string;
    keyFormat: "legacy_jwt" | "sb_secret" | "sb_publishable" | "unknown";
  };
  probe?: {
    apiKeyOnlyStatus: number;
    apiKeyOnlyStatusText: string;
  };
  tables: {
    match_records: number;
    beta_recommendations: number;
    beta_rolling_reports: number;
  };
  error?: SupabaseErrorDetails;
}

export async function getSupabaseHealthSnapshot(): Promise<SupabaseHealthSnapshot> {
  const configSummary = getSupabaseConfigSummary();

  if (!hasSupabaseEnv()) {
    return {
      configured: false,
      connected: false,
      tables: {
        match_records: 0,
        beta_recommendations: 0,
        beta_rolling_reports: 0,
      },
      error: {
        name: "ConfigurationError",
        message: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
        code: null,
        details: null,
        hint: null,
        status: null,
      },
    };
  }

  try {
    const env = getSupabaseEnv();
    const probe = await probeSupabaseApiKeyAccess(env.url, env.serviceRoleKey);

    const [matchRecords, betaRecommendations, betaRollingReports] =
      await Promise.all([
        countMatchRecordsFromSupabase(),
        countBetaRecommendationsFromSupabase(),
        countBetaRollingReportsFromSupabase(),
      ]);

    return {
      configured: true,
      connected: true,
      config:
        configSummary.configured === true
          ? {
              urlHost: configSummary.urlHost,
              keyFormat: configSummary.keyFormat,
            }
          : undefined,
      probe: {
        apiKeyOnlyStatus: probe.status,
        apiKeyOnlyStatusText: probe.statusText,
      },
      tables: {
        match_records: matchRecords,
        beta_recommendations: betaRecommendations,
        beta_rolling_reports: betaRollingReports,
      },
    };
  } catch (error) {
    let probe: SupabaseHealthSnapshot["probe"];
    try {
      const env = getSupabaseEnv();
      const probeResult = await probeSupabaseApiKeyAccess(
        env.url,
        env.serviceRoleKey
      );
      probe = {
        apiKeyOnlyStatus: probeResult.status,
        apiKeyOnlyStatusText: probeResult.statusText,
      };
    } catch {
      probe = undefined;
    }

    return {
      configured: true,
      connected: false,
      config:
        configSummary.configured === true
          ? {
              urlHost: configSummary.urlHost,
              keyFormat: configSummary.keyFormat,
            }
          : undefined,
      probe,
      tables: {
        match_records: 0,
        beta_recommendations: 0,
        beta_rolling_reports: 0,
      },
      error: enrichHealthError(normalizeUnknownError(error), {
        keyFormat:
          configSummary.configured === true
            ? configSummary.keyFormat
            : undefined,
        probeStatus: probe?.apiKeyOnlyStatus,
      }),
    };
  }
}

function enrichHealthError(
  error: SupabaseErrorDetails,
  context: {
    keyFormat?: "legacy_jwt" | "sb_secret" | "sb_publishable" | "unknown";
    probeStatus?: number;
  }
): SupabaseErrorDetails {
  if (error.status !== 401) {
    return error;
  }

  const hints: string[] = [];

  if (context.keyFormat === "sb_secret") {
    hints.push(
      "sb_secret_ keys must not be sent as Authorization Bearer. This server strips that header automatically."
    );
    if (context.probeStatus === 401) {
      hints.push(
        "The secret key itself was rejected. Confirm it matches this project, is not revoked, and is copied from Project Settings → API Keys → Secret keys."
      );
      hints.push(
        "Alternatively, use the Legacy service_role JWT from Project Settings → API → Legacy API Keys → service_role → Reveal, and set it as SUPABASE_SERVICE_ROLE_KEY."
      );
    }
  } else if (context.keyFormat === "legacy_jwt") {
    hints.push(
      "Confirm SUPABASE_SERVICE_ROLE_KEY is the Legacy service_role JWT (starts with eyJ), not the anon/publishable key."
    );
  }

  if (hints.length === 0) {
    return error;
  }

  const hint = [error.hint, ...hints].filter(Boolean).join(" ");

  return {
    ...error,
    hint: hint || null,
  };
}
