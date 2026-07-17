import {
  badRequestResponse,
  publicHealthResponse,
} from "@/lib/security/securityResponse";
import { verifyAdminApiKey } from "@/lib/security/adminAuth";
import { requireAdminApiKey } from "@/lib/security/routeGuard";
import { getSupabaseHealthSnapshot } from "@/lib/supabase/health";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import {
  isValidProductionHealthCheckId,
  runProductionCrudProbe,
} from "@/lib/supabase/productionCrudProbe";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  if (!verifyAdminApiKey(request)) {
    return publicHealthResponse();
  }

  try {
    const health = await getSupabaseHealthSnapshot();
    const httpStatus = health.connected ? 200 : 503;

    return NextResponse.json(
      {
        ok: health.connected,
        httpStatus,
        supabase: health,
      },
      { status: httpStatus }
    );
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const authFailure = requireAdminApiKey(request);
  if (authFailure) {
    return authFailure;
  }

  if (!hasSupabaseEnv()) {
    return NextResponse.json({ ok: false, message: "Service unavailable." }, { status: 503 });
  }

  let body: { action?: string; healthCheckId?: string };
  try {
    body = (await request.json()) as { action?: string; healthCheckId?: string };
  } catch {
    return badRequestResponse("Invalid JSON body.");
  }

  if (body.action !== "production-crud-probe") {
    return badRequestResponse("Unsupported action.");
  }

  const healthCheckId = body.healthCheckId?.trim() ?? "";
  if (!isValidProductionHealthCheckId(healthCheckId)) {
    return badRequestResponse("Invalid healthCheckId.");
  }

  const result = await runProductionCrudProbe(healthCheckId);
  return NextResponse.json(
    {
      ok: result.passed,
      probe: result,
    },
    { status: result.passed ? 200 : 503 }
  );
}
