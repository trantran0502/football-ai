import { logAdminError } from "@/lib/admin/adminErrorLog";
import { runAdminDailyCron } from "@/lib/admin/runAdminDailyCron";
import { getApiFootballQuotaSnapshot } from "@/lib/providers/apiFootball/apiFootballQuota";
import {
  buildExecutionLogContext,
  completeExecutionLog,
  startExecutionLog,
} from "@/lib/scheduler/executionLogStore";
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

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

async function handleDailySummary(request: Request) {
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
    allowedKeys: ["summaryDate"],
  });
  if (!parsed.ok) {
    return parsed.response;
  }

  const summaryDateInput = readCronStringParam(
    request,
    parsed.body.summaryDate as string | undefined,
    "summaryDate"
  );
  if (summaryDateInput !== undefined && !isNonEmptyString(summaryDateInput)) {
    return NextResponse.json({ ok: false, message: "Bad request." }, { status: 400 });
  }

  const summaryDate = isNonEmptyString(summaryDateInput) ? summaryDateInput : todayKey();
  const apiQuotaStart = getApiFootballQuotaSnapshot().dailyCount;
  const execution = startExecutionLog({
    jobName: "daily_summary",
    runDate: summaryDate,
    context: buildExecutionLogContext({
      jobType: "daily_summary",
      status: "success",
      triggeredBy: "cron_route",
    }),
  });

  try {
    const result = await runAdminDailyCron(summaryDate);
    const apiFootballRequestCount = Math.max(
      0,
      getApiFootballQuotaSnapshot().dailyCount - apiQuotaStart
    );
    const persistResult = await completeExecutionLog({
      id: execution.id,
      success: true,
      context: buildExecutionLogContext({
        jobType: "daily_summary",
        status: "success",
        triggeredBy: "cron_route",
        apiFootballRequestCount,
      }),
    });

    const observabilityWarning = persistResult.persisted
      ? undefined
      : persistResult.persistError;

    if (observabilityWarning) {
      logAdminError({
        category: "scheduler",
        message: "Daily summary execution log persist failed",
        context: { summaryDate, error: observabilityWarning },
      });
    }

    return NextResponse.json({
      ok: true,
      executionLogId: execution.id,
      observabilityWarning,
      ...result,
    });
  } catch {
    const apiFootballRequestCount = Math.max(
      0,
      getApiFootballQuotaSnapshot().dailyCount - apiQuotaStart
    );
    await completeExecutionLog({
      id: execution.id,
      success: false,
      errorMessage: "Daily summary cron failed",
      context: buildExecutionLogContext({
        jobType: "daily_summary",
        status: "failed",
        triggeredBy: "cron_route",
        apiFootballRequestCount,
      }),
    });
    return genericErrorResponse();
  }
}

export async function POST(request: Request) {
  return handleDailySummary(request);
}

export async function GET(request: Request) {
  return handleDailySummary(request);
}
