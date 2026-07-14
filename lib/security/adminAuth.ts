import { timingSafeEqualString } from "@/lib/security/cryptoUtils";

/**
 * Primary admin API key. Legacy ADMIN_REPAIR_KEY is accepted with deprecation warning in logs only.
 */
export function getAdminApiKey(): string | null {
  const primary = process.env.ADMIN_API_KEY?.trim();
  if (primary) {
    return primary;
  }

  const legacy = process.env.ADMIN_REPAIR_KEY?.trim();
  return legacy ? legacy : null;
}

export function isAdminApiKeyConfigured(): boolean {
  return getAdminApiKey() !== null;
}

export function verifyAdminApiKey(request: Request): boolean {
  const expected = getAdminApiKey();
  if (!expected) {
    return false;
  }

  const provided = request.headers.get("x-admin-key")?.trim();
  if (!provided) {
    return false;
  }

  return timingSafeEqualString(provided, expected);
}

export function isAdminDashboardAuthRequired(): boolean {
  return process.env.ADMIN_DASHBOARD_REQUIRE_AUTH !== "false";
}
