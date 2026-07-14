import {
  listPendingFromSupabase,
  verifyMatchInSupabase,
} from "@/lib/production/supabaseProductionStore";
import { runResultScheduler } from "@/lib/scheduler/resultScheduler";
import { getApiFootballClient } from "@/lib/providers/apiFootball/apiFootballClient";
import { listMatchRecordsFromSupabase } from "@/lib/supabase/queries/matchRecords";
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

async function handleResultUpdate(request: Request) {
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
    const client = getApiFootballClient();

    const result = await runResultScheduler({
      runDate: isNonEmptyString(runDateInput) ? runDateInput : undefined,
      listPending: listPendingFromSupabase,
      listRecords: async () => {
        const { records } = await listMatchRecordsFromSupabase();
        return records;
      },
      fetchApiFixtures: client.isConfigured()
        ? (date) => client.getFixturesByDate(date)
        : undefined,
      verifyMatch: verifyMatchInSupabase,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch {
    return genericErrorResponse();
  }
}

export async function POST(request: Request) {
  return handleResultUpdate(request);
}

export async function GET(request: Request) {
  return handleResultUpdate(request);
}
