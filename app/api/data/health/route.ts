import { verifyAdminApiKey } from "@/lib/security/adminAuth";
import { publicHealthResponse } from "@/lib/security/securityResponse";
import { getSupabaseHealthSnapshot } from "@/lib/supabase/health";
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
