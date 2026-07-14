import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  detectSupabaseKeyFormat,
  getSupabaseEnv,
} from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";

let adminClient: SupabaseClient<Database> | null = null;

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("Supabase admin client must only be used on the server.");
  }
}

function shouldUseApiKeyOnlyHeader(apiKey: string): boolean {
  const keyFormat = detectSupabaseKeyFormat(apiKey);
  return keyFormat === "sb_secret" || keyFormat === "sb_publishable";
}

/**
 * New-format Supabase keys (`sb_secret_…`) must be sent on the `apikey` header only.
 * supabase-js still falls back to `Authorization: Bearer <key>` for PostgREST when there
 * is no session, which makes Supabase reject the request with HTTP 401 / Invalid JWT.
 */
function createApiKeyOnlyFetch(
  apiKey: string,
  baseFetch: typeof fetch = fetch
): typeof fetch {
  if (!shouldUseApiKeyOnlyHeader(apiKey)) {
    return baseFetch;
  }

  return async (input, init) => {
    const headers = new Headers(
      input instanceof Request ? input.headers : undefined
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => {
        headers.set(key, value);
      });
    }

    headers.set("apikey", apiKey);
    headers.delete("Authorization");

    if (input instanceof Request) {
      return baseFetch(new Request(input, { ...init, headers }));
    }

    return baseFetch(input, { ...init, headers });
  };
}

export function getSupabaseAdmin(): SupabaseClient<Database> {
  assertServerOnly();

  if (!adminClient) {
    const { url, serviceRoleKey } = getSupabaseEnv();
    adminClient = createClient<Database>(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: createApiKeyOnlyFetch(serviceRoleKey),
      },
    });
  }

  return adminClient;
}

export async function probeSupabaseApiKeyAccess(
  url: string,
  apiKey: string
): Promise<{ status: number; statusText: string }> {
  const response = await fetch(`${url}/rest/v1/match_records?select=id`, {
    method: "HEAD",
    headers: {
      apikey: apiKey,
      Accept: "application/json",
      Prefer: "count=exact",
    },
  });

  return {
    status: response.status,
    statusText: response.statusText,
  };
}

export function resetSupabaseAdminForTests(): void {
  adminClient = null;
}
