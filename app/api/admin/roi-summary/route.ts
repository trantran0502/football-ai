import { loadRoiPerformanceResponse } from "@/lib/admin/roiPerformanceLoader";
import { parseRoiPerformanceSearchParams } from "@/lib/admin/roiPerformanceService";
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
    const url = new URL(request.url);
    const filters = parseRoiPerformanceSearchParams(url.searchParams);
    const payload = await loadRoiPerformanceResponse(filters);
    return NextResponse.json({
      ok: true,
      summary: payload.summary,
      breakdowns: payload.breakdowns,
      records: payload.records,
      excludedReasonCounts: payload.excludedReasonCounts,
      pagination: payload.pagination,
      filterOptions: payload.filterOptions,
      filters: payload.filters,
      generatedAt: payload.generatedAt,
    });
  } catch {
    return genericErrorResponse();
  }
}
