import type { PostgrestError } from "@supabase/supabase-js";

export interface SupabaseErrorDetails {
  name: string;
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
  status: number | null;
}

export interface SupabaseErrorLike {
  message?: string;
  code?: string;
  details?: string;
  hint?: string | null;
}

export interface SupabaseQueryResult {
  error: SupabaseErrorLike | PostgrestError | null;
  status?: number;
}

function redactSecrets(text: string): string {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey || !text) {
    return text;
  }

  return text.split(serviceRoleKey).join("[REDACTED]");
}

export function sanitizeErrorText(text: string | null | undefined): string {
  if (!text) {
    return "";
  }
  return redactSecrets(text);
}

function nullableField(value: string | null | undefined): string | null {
  const sanitized = sanitizeErrorText(value);
  return sanitized || null;
}

function firstNonEmptyField(
  ...values: (string | null | undefined)[]
): string | null {
  for (const value of values) {
    const normalized = nullableField(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

export function isPostgrestError(value: unknown): value is PostgrestError {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    (value as PostgrestError).name === "PostgrestError"
  );
}

export class SupabaseQueryError extends Error {
  readonly code: string | null;
  readonly details: string | null;
  readonly hint: string | null;
  readonly status: number | null;

  constructor(details: SupabaseErrorDetails) {
    super(details.message);
    this.name = details.name;
    this.code = details.code;
    this.details = details.details;
    this.hint = details.hint;
    this.status = details.status;
  }

  toDetails(): SupabaseErrorDetails {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      hint: this.hint,
      status: this.status,
    };
  }
}

export function throwIfSupabaseError(
  error: SupabaseErrorLike | PostgrestError | null,
  status: number | null = null
): asserts error is null {
  if (!error) {
    return;
  }

  const code = nullableField(error.code);
  const details = nullableField(error.details);
  const hint = nullableField(error.hint ?? undefined);
  const message =
    firstNonEmptyField(error.message, details, hint, code) ??
    (status != null && status > 0
      ? `Supabase request failed with HTTP ${status}.`
      : "Supabase query failed.");

  throw new SupabaseQueryError({
    name: isPostgrestError(error) ? error.name : "PostgrestError",
    message,
    code,
    details,
    hint,
    status: status != null && status > 0 ? status : null,
  });
}

export function assertSupabaseCount(result: {
  count: number | null;
  error: SupabaseErrorLike | PostgrestError | null;
  status?: number;
}): number {
  throwIfSupabaseError(result.error, result.status ?? null);
  return result.count ?? 0;
}

export function assertSupabaseData<T>(result: {
  data: T;
  error: SupabaseErrorLike | PostgrestError | null;
  status?: number;
}): T {
  throwIfSupabaseError(result.error, result.status ?? null);
  return result.data;
}

export function normalizeUnknownError(error: unknown): SupabaseErrorDetails {
  if (error instanceof SupabaseQueryError) {
    return error.toDetails();
  }

  if (isPostgrestError(error)) {
    const code = nullableField(error.code);
    const details = nullableField(error.details);
    const hint = nullableField(error.hint);
    return {
      name: error.name,
      message:
        firstNonEmptyField(error.message, details, hint, code) ??
        "Supabase query failed.",
      code,
      details,
      hint,
      status: null,
    };
  }

  if (error && typeof error === "object") {
    const record = error as SupabaseErrorLike & {
      name?: string;
      status?: number;
      statusCode?: number;
    };
    const code = nullableField(record.code);
    const details = nullableField(record.details);
    const hint = nullableField(record.hint ?? undefined);
    const status =
      typeof record.status === "number" && record.status > 0
        ? record.status
        : typeof record.statusCode === "number" && record.statusCode > 0
          ? record.statusCode
          : null;

    return {
      name: record.name || "SupabaseError",
      message:
        firstNonEmptyField(record.message, details, hint, code) ??
        (status ? `Supabase request failed with HTTP ${status}.` : "Unknown error."),
      code,
      details,
      hint,
      status,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: sanitizeErrorText(error.message) || "Unknown error.",
      code: null,
      details: null,
      hint: null,
      status: null,
    };
  }

  return {
    name: "UnknownError",
    message: "Failed to connect to Supabase.",
    code: null,
    details: null,
    hint: null,
    status: null,
  };
}
