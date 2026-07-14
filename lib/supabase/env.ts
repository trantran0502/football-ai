export interface SupabaseEnv {
  url: string;
  serviceRoleKey: string;
  keyFormat: SupabaseKeyFormat;
}

export type SupabaseKeyFormat =
  | "legacy_jwt"
  | "sb_secret"
  | "sb_publishable"
  | "unknown";

export function detectSupabaseKeyFormat(key: string): SupabaseKeyFormat {
  if (key.startsWith("sb_secret_")) {
    return "sb_secret";
  }
  if (key.startsWith("sb_publishable_")) {
    return "sb_publishable";
  }
  if (/^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(key)) {
    return "legacy_jwt";
  }
  return "unknown";
}

export function validateSupabaseUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("SUPABASE_URL is not a valid URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("SUPABASE_URL must use https.");
  }

  if (!parsed.hostname.endsWith(".supabase.co")) {
    throw new Error("SUPABASE_URL host must end with .supabase.co.");
  }

  return parsed.origin;
}

export function getSupabaseEnv(): SupabaseEnv {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url) {
    throw new Error("Missing SUPABASE_URL environment variable.");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
  }

  return {
    url: validateSupabaseUrl(url),
    serviceRoleKey,
    keyFormat: detectSupabaseKeyFormat(serviceRoleKey),
  };
}

export function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
}

export function getSupabaseConfigSummary():
  | {
      configured: true;
      urlHost: string;
      keyFormat: SupabaseKeyFormat;
    }
  | { configured: false } {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    return { configured: false };
  }

  try {
    return {
      configured: true,
      urlHost: new URL(validateSupabaseUrl(url)).host,
      keyFormat: detectSupabaseKeyFormat(serviceRoleKey),
    };
  } catch {
    return {
      configured: true,
      urlHost: "invalid-url",
      keyFormat: detectSupabaseKeyFormat(serviceRoleKey),
    };
  }
}
