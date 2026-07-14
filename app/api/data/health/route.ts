import { NextResponse } from "next/server";
import { getSupabaseHealthSnapshot } from "@/lib/supabase/health";

export async function GET() {
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
}
