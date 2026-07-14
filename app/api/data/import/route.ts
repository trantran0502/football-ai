import { NextResponse } from "next/server";
import {
  dataApiError,
  dataApiSuccess,
  resolveErrorMessage,
} from "@/lib/supabase/apiResponse";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { isP0ExportBundle } from "@/lib/migration/p0ExportTypes";
import { importP0BundleToSupabase } from "@/lib/supabase/services/p0ImportService";

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) {
    return dataApiError(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
      503
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return dataApiError("Invalid request body.", 400);
  }

  if (!isP0ExportBundle(body)) {
    return dataApiError("Invalid P0 export bundle.", 400);
  }

  try {
    const result = await importP0BundleToSupabase(body);
    return dataApiSuccess(result);
  } catch (error) {
    return dataApiError(resolveErrorMessage(error), 500);
  }
}
