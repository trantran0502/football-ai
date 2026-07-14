import {
  genericErrorResponse,
  isPlainObject,
  parseJsonBody,
  requireAdminApiKeyAndRateLimit,
  RATE_LIMIT_PRESETS,
} from "@/lib/security";
import { isP0ExportBundle } from "@/lib/migration/p0ExportTypes";
import { importP0BundleToSupabase } from "@/lib/supabase/services/p0ImportService";
import { dataApiError, dataApiSuccess } from "@/lib/supabase/apiResponse";
import { hasSupabaseEnv } from "@/lib/supabase/env";

const MAX_IMPORT_BYTES = 5_000_000;

export async function POST(request: Request) {
  const guardFailure = await requireAdminApiKeyAndRateLimit(
    request,
    RATE_LIMIT_PRESETS.dataImport
  );
  if (guardFailure) {
    return guardFailure;
  }

  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return dataApiError("Invalid request body.", 400);
  }

  const raw = await request.text();
  if (raw.length > MAX_IMPORT_BYTES) {
    return dataApiError("Request body too large.", 400);
  }

  if (!hasSupabaseEnv()) {
    return genericErrorResponse(503);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return dataApiError("Invalid request body.", 400);
  }

  if (!isPlainObject(body) || !isP0ExportBundle(body)) {
    return dataApiError("Invalid request body.", 400);
  }

  try {
    const result = await importP0BundleToSupabase(body);
    return dataApiSuccess(result);
  } catch {
    return genericErrorResponse();
  }
}
