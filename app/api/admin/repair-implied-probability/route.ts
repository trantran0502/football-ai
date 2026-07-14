import {
  runImpliedProbabilityRepairApply,
  runImpliedProbabilityRepairDryRun,
} from "@/lib/admin/repairImpliedProbability";
import {
  genericErrorResponse,
  parseJsonBody,
  requireAdminApiKeyAndRateLimit,
  RATE_LIMIT_PRESETS,
} from "@/lib/security";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const guardFailure = await requireAdminApiKeyAndRateLimit(
    request,
    RATE_LIMIT_PRESETS.adminRepair
  );
  if (guardFailure) {
    return guardFailure;
  }

  if (!hasSupabaseEnv()) {
    return genericErrorResponse(503);
  }

  const parsed = await parseJsonBody<Record<string, unknown>>(request, {
    maxBytes: 4_096,
    allowedKeys: ["dryRun"],
  });
  if (!parsed.ok) {
    return parsed.response;
  }

  const dryRun = parsed.body.dryRun !== false;

  try {
    if (dryRun) {
      const result = await runImpliedProbabilityRepairDryRun();
      return NextResponse.json({
        ok: true,
        dryRun: true,
        recordsToRepair: result.recordsToRepair,
        pollutedRecordCount: result.pollutedRecordCount,
        pollutedFieldCount: result.pollutedFieldCount,
      });
    }

    const result = await runImpliedProbabilityRepairApply();
    return NextResponse.json({
      ok: true,
      dryRun: false,
      success: result.success,
      failed: result.failed,
      updatedRecordIds: result.updatedRecordIds,
      pollutedRecordCountBefore: result.pollutedRecordCountBefore,
      pollutedRecordCountAfter: result.pollutedRecordCountAfter,
    });
  } catch {
    return genericErrorResponse();
  }
}
