import { buildAdminDashboardResponse } from "@/lib/admin/adminDashboardService";
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
    const dashboard = await buildAdminDashboardResponse();
    return NextResponse.json({ ok: true, dashboard });
  } catch {
    return genericErrorResponse();
  }
}
