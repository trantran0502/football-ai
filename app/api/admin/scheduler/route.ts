import { getSchedulerStatus } from "@/lib/scheduler/schedulerService";
import { listMatchRecordsFromSupabase } from "@/lib/supabase/queries/matchRecords";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import {
  genericErrorResponse,
  requireAdminApiKey,
} from "@/lib/security";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authFailure = requireAdminApiKey(request);
  if (authFailure) {
    return authFailure;
  }

  try {
    const url = new URL(request.url);
    const runDate = url.searchParams.get("runDate") ?? undefined;

    const status = await getSchedulerStatus({
      runDate: runDate ?? undefined,
      listRecords: hasSupabaseEnv()
        ? async () => {
            const { records } = await listMatchRecordsFromSupabase();
            return records;
          }
        : undefined,
    });

    return NextResponse.json({ ok: true, ...status });
  } catch {
    return genericErrorResponse();
  }
}
