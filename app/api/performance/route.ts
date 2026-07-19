import { buildPerformanceCenterResponse } from "@/lib/performance/performanceService";
import { dataApiSuccess } from "@/lib/supabase/apiResponse";
import { genericErrorResponse } from "@/lib/security";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";

export async function GET() {
  if (!hasSupabaseEnv()) {
    return genericErrorResponse(503);
  }

  try {
    const report = await buildPerformanceCenterResponse();
    return dataApiSuccess(report);
  } catch {
    return genericErrorResponse();
  }
}
