export interface RetryAttemptLog {
  attempt: number;
  label: string;
  request: string;
  error: string;
  response: string | null;
  durationMs: number;
  timestamp: string;
}

export type RetryResult<T> =
  | { ok: true; value: T; attempts: RetryAttemptLog[] }
  | { ok: false; error: string; attempts: RetryAttemptLog[] };

function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("fetch failed") ||
    lower.includes("timeout") ||
    lower.includes("network") ||
    lower.includes("socket") ||
    lower.includes("aborted")
  );
}

function extractResponse(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const record = error as Record<string, unknown>;
  const parts = [
    record.details,
    record.hint,
    record.code,
    record.status,
  ]
    .filter((value) => value !== undefined && value !== null)
    .map(String);
  return parts.length > 0 ? parts.join(" | ") : null;
}

export async function withSupabaseRetry<T>(
  label: string,
  request: string,
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<RetryResult<T>> {
  const attempts: RetryAttemptLog[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now();
    try {
      const value = await fn();
      attempts.push({
        attempt,
        label,
        request,
        error: "",
        response: "ok",
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      });
      return { ok: true, value, attempts };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attempts.push({
        attempt,
        label,
        request,
        error: message,
        response: extractResponse(error),
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      });

      const retryable = isRetryableError(error);
      if (!retryable || attempt >= maxAttempts) {
        return { ok: false, error: message, attempts };
      }

      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }

  return {
    ok: false,
    error: attempts.at(-1)?.error ?? "unknown_error",
    attempts,
  };
}
