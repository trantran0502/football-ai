import {
  dataApiError,
  dataApiSuccess,
  resolveErrorMessage,
} from "@/lib/supabase/apiResponse";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import {
  getMatchRecordFromSupabase,
  listMatchRecordsFromSupabase,
} from "@/lib/supabase/queries/matchRecords";
import {
  saveMatchFromAnalysisInSupabase,
  verifyMatchInSupabase,
} from "@/lib/supabase/services/matchRecordService";
import type { AnalysisReport } from "@/lib/analysis/types";
import type { UpdateMatchResultInput } from "@/lib/database/matchSchema";

interface CreateMatchRecordBody {
  rawOdds?: string;
  report?: AnalysisReport;
  matchDate?: string;
}

interface VerifyMatchRecordBody extends UpdateMatchResultInput {
  id?: string;
}

export async function GET(request: Request) {
  if (!hasSupabaseEnv()) {
    return dataApiError(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
      503
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();

  try {
    if (id) {
      const record = await getMatchRecordFromSupabase(id);
      if (!record) {
        return dataApiError("Match record not found.", 404);
      }
      return dataApiSuccess(record);
    }

    const { records, stats } = await listMatchRecordsFromSupabase();
    return dataApiSuccess(records, { count: records.length, stats });
  } catch (error) {
    return dataApiError(resolveErrorMessage(error), 500);
  }
}

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) {
    return dataApiError(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
      503
    );
  }

  let body: CreateMatchRecordBody;
  try {
    body = (await request.json()) as CreateMatchRecordBody;
  } catch {
    return dataApiError("Invalid request body.", 400);
  }

  if (!body.rawOdds?.trim() || !body.report?.match) {
    return dataApiError("rawOdds and report are required.", 400);
  }

  try {
    const outcome = await saveMatchFromAnalysisInSupabase(
      body.rawOdds.trim(),
      body.report,
      body.matchDate
    );

    return dataApiSuccess(outcome.record, { status: outcome.status });
  } catch (error) {
    return dataApiError(resolveErrorMessage(error), 500);
  }
}

export async function PATCH(request: Request) {
  if (!hasSupabaseEnv()) {
    return dataApiError(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
      503
    );
  }

  let body: VerifyMatchRecordBody;
  try {
    body = (await request.json()) as VerifyMatchRecordBody;
  } catch {
    return dataApiError("Invalid request body.", 400);
  }

  if (!body.id?.trim()) {
    return dataApiError("id is required.", 400);
  }

  const {
    id,
    fullTimeHomeGoals,
    fullTimeAwayGoals,
    halfTimeHomeGoals,
    halfTimeAwayGoals,
  } = body;

  if (
    fullTimeHomeGoals === undefined ||
    fullTimeAwayGoals === undefined ||
    halfTimeHomeGoals === undefined ||
    halfTimeAwayGoals === undefined
  ) {
    return dataApiError("All goal fields are required.", 400);
  }

  try {
    const record = await verifyMatchInSupabase(id.trim(), {
      fullTimeHomeGoals,
      fullTimeAwayGoals,
      halfTimeHomeGoals,
      halfTimeAwayGoals,
    });

    if (!record) {
      return dataApiError("Match record not found or not pending.", 404);
    }

    return dataApiSuccess(record);
  } catch (error) {
    return dataApiError(resolveErrorMessage(error), 500);
  }
}
