import {
  dataApiError,
  dataApiSuccess,
  resolveErrorMessage,
} from "@/lib/supabase/apiResponse";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { listBetaRollingReportsFromSupabase } from "@/lib/supabase/queries/betaRollingReports";
import { insertRollingReportToSupabase } from "@/lib/supabase/services/betaRollingReportService";
import type { RollingEvaluationReport } from "@/lib/beta/types";

interface CreateRollingReportBody {
  report?: RollingEvaluationReport;
}

export async function GET(request: Request) {
  if (!hasSupabaseEnv()) {
    return dataApiError(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
      503
    );
  }

  const { searchParams } = new URL(request.url);
  const modelVersion = searchParams.get("modelVersion")?.trim();

  try {
    const reports = await listBetaRollingReportsFromSupabase({
      modelVersion: modelVersion || undefined,
    });

    return dataApiSuccess(reports, { count: reports.length });
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

  let body: CreateRollingReportBody;
  try {
    body = (await request.json()) as CreateRollingReportBody;
  } catch {
    return dataApiError("Invalid request body.", 400);
  }

  if (!body.report?.modelVersion || !body.report.evaluatedAt) {
    return dataApiError("report is required.", 400);
  }

  try {
    const saved = await insertRollingReportToSupabase(body.report);
    return dataApiSuccess(saved);
  } catch (error) {
    return dataApiError(resolveErrorMessage(error), 500);
  }
}
