import { detectSupabaseKeyFormat, validateSupabaseUrl } from "@/lib/supabase/env";
import type { EnvVarAuditEntry } from "@/lib/healthCheck/types";

const ENV_SPECS: Array<{
  name: string;
  required: boolean;
  clientSafe: boolean;
  serverOnly: boolean;
  validate?: (value: string) => boolean;
}> = [
  { name: "SUPABASE_URL", required: true, clientSafe: false, serverOnly: true },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    required: true,
    clientSafe: false,
    serverOnly: true,
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    required: false,
    clientSafe: true,
    serverOnly: false,
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    required: false,
    clientSafe: true,
    serverOnly: false,
  },
  { name: "API_FOOTBALL_KEY", required: true, clientSafe: false, serverOnly: true },
  {
    name: "GOOGLE_GEMINI_API_KEY",
    required: false,
    clientSafe: false,
    serverOnly: true,
  },
  { name: "ADMIN_API_KEY", required: true, clientSafe: false, serverOnly: true },
  { name: "CRON_SECRET", required: true, clientSafe: false, serverOnly: true },
  { name: "FOOTBALL_DATA_MODE", required: false, clientSafe: false, serverOnly: true },
  { name: "SCHEDULER_ENABLED", required: false, clientSafe: false, serverOnly: true },
  {
    name: "NEXT_PUBLIC_BETA_RECOMMENDATION_MODE",
    required: false,
    clientSafe: true,
    serverOnly: false,
  },
  { name: "BETA_RECOMMENDATION_MODE", required: false, clientSafe: false, serverOnly: true },
  { name: "RATE_LIMIT_ADAPTER", required: false, clientSafe: false, serverOnly: true },
  { name: "GOOGLE_GEMINI_MODEL", required: false, clientSafe: false, serverOnly: true },
  { name: "API_FOOTBALL_BASE_URL", required: false, clientSafe: false, serverOnly: true },
];

function maskSecret(value: string): string {
  if (value.length <= 8) {
    return "***";
  }
  return `${value.slice(0, 4)}…${value.slice(-4)} (len=${value.length})`;
}

export function auditEnvironmentVariables(): EnvVarAuditEntry[] {
  return ENV_SPECS.map((spec) => {
    const raw = process.env[spec.name]?.trim() ?? "";
    const present = raw.length > 0;
    let invalidFormat = false;

    if (present && spec.name === "SUPABASE_URL") {
      try {
        validateSupabaseUrl(raw);
      } catch {
        invalidFormat = true;
      }
    }

    if (present && spec.name === "SUPABASE_SERVICE_ROLE_KEY") {
      const format = detectSupabaseKeyFormat(raw);
      if (format === "sb_publishable" || format === "unknown") {
        invalidFormat = true;
      }
    }

    if (present && spec.validate && !spec.validate(raw)) {
      invalidFormat = true;
    }

    return {
      name: spec.name,
      required: spec.required,
      present,
      clientSafe: spec.clientSafe,
      serverOnly: spec.serverOnly,
      invalidFormat: present ? invalidFormat : undefined,
      maskedValue: present ? maskSecret(raw) : undefined,
    };
  });
}
