import { parseJsonBody } from "@/lib/security/requestValidation";
import type { ParseJsonBodyResult } from "@/lib/security/requestValidation";

export async function parseCronJsonBody<T extends Record<string, unknown>>(
  request: Request,
  options: {
    maxBytes: number;
    allowedKeys?: readonly string[];
  }
): Promise<ParseJsonBodyResult<T>> {
  if (request.method === "GET") {
    return { ok: true, body: {} as T };
  }

  return parseJsonBody<T>(request, options);
}

export function readCronStringParam(
  request: Request,
  bodyValue: string | undefined,
  paramName: string
): string | undefined {
  if (bodyValue !== undefined) {
    return bodyValue;
  }

  if (request.method !== "GET") {
    return undefined;
  }

  const fromQuery = new URL(request.url).searchParams.get(paramName)?.trim();
  return fromQuery ? fromQuery : undefined;
}
