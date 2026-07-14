import { NextResponse } from "next/server";

export function dataApiError(message: string, status = 500) {
  return NextResponse.json({ ok: false, data: null, message }, { status });
}

export function dataApiSuccess<T>(data: T, extra?: Record<string, unknown>) {
  return NextResponse.json({
    ok: true,
    data,
    message: null,
    ...extra,
  });
}

export function resolveErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected server error.";
}
