import { loadAdminMatchRecordsByDateRange } from "@/lib/admin/adminRecordLoader";
import {
  buildRoiPerformanceResponse,
  normalizeRoiPerformanceFilters,
  parseRoiPerformanceSearchParams,
} from "@/lib/admin/roiPerformanceService";
import type {
  RoiPerformanceFilters,
  RoiPerformanceResponse,
} from "@/lib/admin/roiPerformanceTypes";

export async function loadRoiPerformanceResponse(
  input: RoiPerformanceFilters = {},
  now: Date = new Date()
): Promise<RoiPerformanceResponse> {
  const filters = normalizeRoiPerformanceFilters(input, now);
  const records = await loadAdminMatchRecordsByDateRange({
    fromDate: filters.fromDate,
    toDate: filters.toDate,
  });
  return buildRoiPerformanceResponse(
    records,
    {
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      market: filters.market ?? undefined,
      league: filters.league ?? undefined,
      verificationResult: filters.verificationResult ?? undefined,
      weightVersion: filters.weightVersion ?? undefined,
      onlyRoiEligible: filters.onlyRoiEligible,
      page: filters.page,
      pageSize: filters.pageSize,
    },
    now
  );
}

export function loadRoiPerformanceFiltersFromSearchParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>
): RoiPerformanceFilters {
  return parseRoiPerformanceSearchParams(params);
}
