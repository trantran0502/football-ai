import {
  genericErrorResponse,
  isNonEmptyString,
  isPlainObject,
  parseJsonBody,
  requireAdminApiKey,
} from "@/lib/security";
import type { RollingEvaluationReport } from "@/lib/beta/types";
import { dataApiError, dataApiSuccess } from "@/lib/supabase/apiResponse";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { listBetaRollingReportsFromSupabase } from "@/lib/supabase/queries/betaRollingReports";
import { insertRollingReportToSupabase } from "@/lib/supabase/services/betaRollingReportService";

const MAX_BODY_BYTES = 256_000;

export async function GET(request: Request) {
  const authFailure = requireAdminApiKey(request);
  if (authFailure) {
    return authFailure;
  }

  if (!hasSupabaseEnv()) {
    return genericErrorResponse(503);
  }

  const { searchParams } = new URL(request.url);
  const modelVersion = searchParams.get("modelVersion")?.trim();

  try {
    const reports = await listBetaRollingReportsFromSupabase({
      modelVersion: modelVersion || undefined,
    });

    return dataApiSuccess(reports, { count: reports.length });
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
    allowedKeys: ["report"],
  });
  if (!parsed.ok) {
    return parsed.response;
  }

  const report = parsed.body.report;
  if (
    !isPlainObject(report) ||
    !isNonEmptyString(report.modelVersion) ||
    !isNonEmptyString(report.evaluatedAt)
  ) {
    return dataApiError("Invalid request body.", 400);
  }

  try {
    const saved = await insertRollingReportToSupabase(
      report as unknown as RollingEvaluationReport
    );
    return dataApiSuccess(saved);
  } catch {
    return genericErrorResponse();
  }
}
