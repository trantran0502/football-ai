import {
  genericErrorResponse,
  isFiniteNumber,
  isNonEmptyString,
  isPlainObject,
  parseJsonBody,
  requireAdminApiKey,
} from "@/lib/security";
import {
  dataApiError,
  dataApiSuccess,
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

const MAX_BODY_BYTES = 512_000;

export async function GET(request: Request) {
  const authFailure = requireAdminApiKey(request);
  if (authFailure) {
    return authFailure;
  }

  if (!hasSupabaseEnv()) {
    return genericErrorResponse(503);
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();

  try {
    if (id) {
      const record = await getMatchRecordFromSupabase(id);
      if (!record) {
        return dataApiError("Not found.", 404);
      }
      return dataApiSuccess(record);
    }

    const { records, stats } = await listMatchRecordsFromSupabase();
    return dataApiSuccess(records, { count: records.length, stats });
  } catch {
    return genericErrorResponse();
  }
}

export async function POST(request: Request) {
  const authFailure = requireAdminApiKey(request);
  if (authFailure) {
    return authFailure;
  }

  if (!hasSupabaseEnv()) {
    return genericErrorResponse(503);
  }

  const parsed = await parseJsonBody<Record<string, unknown>>(request, {
    maxBytes: MAX_BODY_BYTES,
    allowedKeys: ["rawOdds", "report", "matchDate"],
  });
  if (!parsed.ok) {
    return parsed.response;
  }

  const { rawOdds, report, matchDate } = parsed.body;
  if (!isNonEmptyString(rawOdds) || !isPlainObject(report)) {
    return dataApiError("Invalid request body.", 400);
  }

  const reportObject = report as unknown as AnalysisReport;
  const match = reportObject.match;
  if (!isPlainObject(match) || !isNonEmptyString(match.homeTeam) || !isNonEmptyString(match.awayTeam)) {
    return dataApiError("Invalid request body.", 400);
  }

  try {
    const outcome = await saveMatchFromAnalysisInSupabase(
      rawOdds.trim(),
      reportObject,
      isNonEmptyString(matchDate) ? matchDate : undefined
    );

    if (outcome.status === "incomplete_analysis_rejected" && !outcome.record) {
      return dataApiError(`Analysis incomplete: ${outcome.reason}.`, 422);
    }

    if (outcome.status === "conflicting_record") {
      return dataApiError(outcome.reason, 409);
    }

    if (!outcome.record) {
      return genericErrorResponse();
    }

    return dataApiSuccess(outcome.record, {
      status: outcome.status,
      ...(outcome.status === "incomplete_analysis_rejected"
        ? { reason: outcome.reason }
        : {}),
    });
  } catch {
    return genericErrorResponse();
  }
}

export async function PATCH(request: Request) {
  const authFailure = requireAdminApiKey(request);
  if (authFailure) {
    return authFailure;
  }

  if (!hasSupabaseEnv()) {
    return genericErrorResponse(503);
  }

  const parsed = await parseJsonBody<Record<string, unknown>>(request, {
    maxBytes: 8_192,
    allowedKeys: [
      "id",
      "fullTimeHomeGoals",
      "fullTimeAwayGoals",
      "halfTimeHomeGoals",
      "halfTimeAwayGoals",
    ],
  });
  if (!parsed.ok) {
    return parsed.response;
  }

  const {
    id,
    fullTimeHomeGoals,
    fullTimeAwayGoals,
    halfTimeHomeGoals,
    halfTimeAwayGoals,
  } = parsed.body;

  if (!isNonEmptyString(id)) {
    return dataApiError("Invalid request body.", 400);
  }

  if (
    !isFiniteNumber(fullTimeHomeGoals) ||
    !isFiniteNumber(fullTimeAwayGoals) ||
    !isFiniteNumber(halfTimeHomeGoals) ||
    !isFiniteNumber(halfTimeAwayGoals)
  ) {
    return dataApiError("Invalid request body.", 400);
  }

  try {
    const record = await verifyMatchInSupabase(id.trim(), {
      fullTimeHomeGoals,
      fullTimeAwayGoals,
      halfTimeHomeGoals,
      halfTimeAwayGoals,
    });

    if (!record) {
      return dataApiError("Not found.", 404);
    }

    return dataApiSuccess(record);
  } catch {
    return genericErrorResponse();
  }
}
