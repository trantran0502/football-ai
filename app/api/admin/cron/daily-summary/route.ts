import { runAdminDailyCron } from "@/lib/admin/runAdminDailyCron";
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

  try {
    const result = await runAdminDailyCron(
      isNonEmptyString(summaryDateInput) ? summaryDateInput : undefined
    );
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return genericErrorResponse();
  }
}

export async function POST(request: Request) {
  return handleDailySummary(request);
}

export async function GET(request: Request) {
  return handleDailySummary(request);
}
