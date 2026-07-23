/**
 * Detect API-Football account-level access failures (suspended / revoked).
 * These are non-retryable: further calls only waste quota and delay fail-fast.
 */

export const API_FOOTBALL_ACCOUNT_SUSPENDED_CODE = "account_suspended" as const;

export class ApiFootballAccountSuspendedError extends Error {
  readonly code = API_FOOTBALL_ACCOUNT_SUSPENDED_CODE;

  constructor(message = "API-Football account suspended.") {
    super(message);
    this.name = "ApiFootballAccountSuspendedError";
  }
}

export function summarizeApiFootballErrors(errors: unknown): string | null {
  if (errors === null || errors === undefined) {
    return null;
  }
  if (Array.isArray(errors)) {
    return errors.length === 0 ? null : errors.map(String).join("; ");
  }
  if (typeof errors === "object") {
    const entries = Object.entries(errors as Record<string, unknown>);
    if (entries.length === 0) {
      return null;
    }
    return entries.map(([key, value]) => `${key}: ${String(value)}`).join("; ");
  }
  const serialized = String(errors).trim();
  return serialized.length > 0 ? serialized : null;
}

export function isApiFootballAccountSuspendedMessage(text: string): boolean {
  return /account is suspended|account suspended|subscription.*(inactive|expired|cancelled)/i.test(
    text
  );
}

/** True when provider envelope errors indicate a suspended / revoked account. */
export function isApiFootballAccountSuspendedErrors(errors: unknown): boolean {
  const summary = summarizeApiFootballErrors(errors);
  if (!summary) {
    return false;
  }
  if (isApiFootballAccountSuspendedMessage(summary)) {
    return true;
  }
  if (errors && typeof errors === "object" && !Array.isArray(errors)) {
    const access = (errors as Record<string, unknown>).access;
    if (typeof access === "string" && isApiFootballAccountSuspendedMessage(access)) {
      return true;
    }
  }
  return false;
}

export function isApiFootballAccountSuspendedError(error: unknown): boolean {
  if (error instanceof ApiFootballAccountSuspendedError) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.message === "API-Football account suspended.") {
    return true;
  }
  return isApiFootballAccountSuspendedMessage(error.message);
}

export function throwIfApiFootballAccountSuspended(errors: unknown): void {
  if (!isApiFootballAccountSuspendedErrors(errors)) {
    return;
  }
  const summary = summarizeApiFootballErrors(errors);
  throw new ApiFootballAccountSuspendedError(
    summary
      ? `API-Football account suspended: ${summary}`
      : "API-Football account suspended."
  );
}
