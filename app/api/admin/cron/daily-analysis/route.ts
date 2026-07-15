import { runDailyScheduler } from "@/lib/scheduler/dailyScheduler";
import { logAdminError } from "@/lib/admin/adminErrorLog";
import { getApiFootballClient } from "@/lib/providers/apiFootball/apiFootballClient";
import { listMatchRecordsFromSupabase } from "@/lib/supabase/queries/matchRecords";
import { saveMatchFromAnalysisInSupabase } from "@/lib/supabase/services/matchRecordService";
import {
  genericErrorResponse,
  isNonEmptyString,
  parseCronJsonBody,
  readCronStringParam,
  requireCronAuthAndRateLimit,
  RATE_LIMIT_PRESETS,
} from "@/lib/security";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

async function handleDailyAnalysis(request: Request) {
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

  const parsed = await parseCronJsonBody<Record<string, unknown>>(request, {
    maxBytes: 4_096,
    allowedKeys: ["runDate"],
  });
  if (!parsed.ok) {
    return parsed.response;
  }

  const runDateInput = readCronStringParam(request, parsed.body.runDate as string | undefined, "runDate");
  if (runDateInput !== undefined && !isNonEmptyString(runDateInput)) {
    return NextResponse.json({ ok: false, message: "Bad request." }, { status: 400 });
  }

  try {
    const listRecords = async () => {
      const { records } = await listMatchRecordsFromSupabase();
      return records;
    };

    const client = getApiFootballClient();
    const result = await runDailyScheduler({
      runDate: isNonEmptyString(runDateInput) ? runDateInput : undefined,
      fetchFixtures: client.isConfigured()
        ? async (date) => {
            const fixtures = await client.getFixturesByDate(date);
            const { fetchFixturesByDate: intake } = await import("@/lib/scheduler/fixtureIntake");
            return intake(date, {
              fetchFromApi: async () => fixtures,
            });
          }
        : undefined,
      saveMatch: saveMatchFromAnalysisInSupabase,
      listRecords,
    });

    if (result.observabilityWarning) {
      logAdminError({
        category: "scheduler",
        message: "Daily analysis execution log persist failed",
        context: {
          runDate: result.runDate,
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
  return handleDailyAnalysis(request);
}

export async function GET(request: Request) {
  return handleDailyAnalysis(request);
}
