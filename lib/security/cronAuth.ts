import { timingSafeEqualString } from "@/lib/security/cryptoUtils";

export function getCronSecret(): string | null {
  const secret = process.env.CRON_SECRET?.trim();
  return secret ? secret : null;
}

export function isCronSecretConfigured(): boolean {
  return getCronSecret() !== null;
}

export function isVercelCronInvocation(request: Request): boolean {
  const userAgent = request.headers.get("user-agent")?.trim().toLowerCase() ?? "";
  return userAgent.startsWith("vercel-cron/");
}

export function verifyCronSecret(request: Request): boolean {
  const expected = getCronSecret();
  if (!expected) {
    return false;
  }

  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  const provided = authorization.slice("Bearer ".length).trim();
  return timingSafeEqualString(provided, expected);
}

/**
 * Vercel Cron sends GET with Authorization: Bearer ${CRON_SECRET} when CRON_SECRET is set.
 * Manual triggers may use POST with the same header.
 */
export function verifyCronRequest(request: Request): boolean {
  return verifyCronSecret(request);
}
