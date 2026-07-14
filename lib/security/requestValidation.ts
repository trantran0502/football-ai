import { badRequestResponse } from "@/lib/security/securityResponse";
import type { NextResponse } from "next/server";

const JSON_CONTENT_TYPE = "application/json";

export interface ParsedJsonBody<T> {
  ok: true;
  body: T;
}

export interface ParsedJsonBodyError {
  ok: false;
  response: NextResponse;
}

export type ParseJsonBodyResult<T> = ParsedJsonBody<T> | ParsedJsonBodyError;

export async function parseJsonBody<T extends Record<string, unknown>>(
  request: Request,
  options: {
    maxBytes: number;
    allowedKeys?: readonly string[];
  }
): Promise<ParseJsonBodyResult<T>> {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== JSON_CONTENT_TYPE) {
    return {
      ok: false,
      response: badRequestResponse("Content-Type must be application/json."),
    };
  }

  const raw = await request.text();
  if (raw.length > options.maxBytes) {
    return {
      ok: false,
      response: badRequestResponse("Request body too large."),
    };
  }

  if (raw.length === 0) {
    return { ok: true, body: {} as T };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {
      ok: false,
      response: badRequestResponse("Invalid JSON body."),
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      response: badRequestResponse("JSON body must be an object."),
    };
  }

  const record = parsed as Record<string, unknown>;

  if (options.allowedKeys) {
    const unknownKeys = Object.keys(record).filter(
      (key) => !options.allowedKeys!.includes(key)
    );
    if (unknownKeys.length > 0) {
      return {
        ok: false,
        response: badRequestResponse("Request body contains unknown fields."),
      };
    }
  }

  const blockedFields = ["createdAt", "updatedAt", "source", "verifiedAt"];
  for (const key of blockedFields) {
    if (key in record) {
      return {
        ok: false,
        response: badRequestResponse("Request body contains disallowed fields."),
      };
    }
  }

  return { ok: true, body: record as T };
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
