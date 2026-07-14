import { loadAdminMatchRecords } from "@/lib/admin/adminRecordLoader";
import { buildLearningEngineReport } from "@/lib/learning/learningEngine";
import {
  genericErrorResponse,
  requireAdminDashboardAuth,
} from "@/lib/security";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authFailure = requireAdminDashboardAuth(request);
  if (authFailure) {
    return authFailure;
  }

  try {
    const records = await loadAdminMatchRecords();
    const report = buildLearningEngineReport(records);
    return NextResponse.json({ ok: true, report });
  } catch {
    return genericErrorResponse();
  }
}
