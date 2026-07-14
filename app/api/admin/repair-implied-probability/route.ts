import {
  getAdminRepairKey,
  verifyAdminRepairKey,
} from "@/lib/admin/adminRepairAuth";
import {
  runImpliedProbabilityRepairApply,
  runImpliedProbabilityRepairDryRun,
} from "@/lib/admin/repairImpliedProbability";
import { resolveErrorMessage } from "@/lib/supabase/apiResponse";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface RepairRequestBody {
  dryRun?: boolean;
}

function unauthorizedResponse() {
  return NextResponse.json(
    { ok: false, message: "Unauthorized." },
    { status: 401 }
  );
}

function missingConfigResponse(message: string, status = 503) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  if (!getAdminRepairKey()) {
    return missingConfigResponse("Missing ADMIN_REPAIR_KEY environment variable.");
  }

  if (!verifyAdminRepairKey(request)) {
    return unauthorizedResponse();
  }

  if (!hasSupabaseEnv()) {
    return missingConfigResponse(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  let body: RepairRequestBody;
  try {
    body = (await request.json()) as RepairRequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid request body." },
      { status: 400 }
    );
  }

  const dryRun = body.dryRun !== false;

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
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: resolveErrorMessage(error) },
      { status: 500 }
    );
  }
}
