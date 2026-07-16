import { logAdminError } from "@/lib/admin/adminErrorLog";
import { runHistoricalMatchBackfillScheduler } from "@/lib/scheduler/historicalMatchBackfillScheduler";
import { getApiFootballClient } from "@/lib/providers/apiFootball/apiFootballClient";
import {
  insertHistoricalBackfillRecord,
  loadHistoricalBackfillDuplicateCheck,
  loadMatchKeysForDateInSupabase,
} from "@/lib/supabase/services/historicalBackfillService";
import {
  genericErrorResponse,
  requireCronAuthAndRateLimit,
  RATE_LIMIT_PRESETS,
} from "@/lib/security";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

async function handleHistoricalMatchBackfill(request: Request) {
  const guardFailure = await requireCronAuthAndRateLimit(
    request,
    RATE_LIMIT_PRESETS.adminCron
  );
  if (guardFailure) {
    return guardFailure;
  }

  if (!hasSupabaseEnv()) {
    return genericErrorResponse(503);
  }

  try {
    const client = getApiFootballClient();
    const result = await runHistoricalMatchBackfillScheduler({
      fetchFixturesByDate: client.isConfigured()
        ? (date) => client.getFixturesByDate(date)
        : undefined,
      loadDuplicateCheck: loadHistoricalBackfillDuplicateCheck,
      insertRecord: insertHistoricalBackfillRecord,
      loadMatchKeysForDate: loadMatchKeysForDateInSupabase,
    });

    if (result.observabilityWarning) {
      logAdminError({
        category: "scheduler",
        message: "Historical match backfill execution log persist failed",
        context: {
          error: result.observabilityWarning,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      observabilityWarning: result.observabilityWarning,
      ...result,
    });
  } catch {
    return genericErrorResponse();
  }
}

export async function POST(request: Request) {
  return handleHistoricalMatchBackfill(request);
}

export async function GET(request: Request) {
  return handleHistoricalMatchBackfill(request);
}
