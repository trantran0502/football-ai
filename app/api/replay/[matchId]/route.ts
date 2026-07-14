import { getReplayForMatch } from "@/lib/replay/replayService";
import {
  genericErrorResponse,
  requireAdminApiKey,
} from "@/lib/security";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ matchId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const authFailure = requireAdminApiKey(request);
  if (authFailure) {
    return authFailure;
  }

  const { matchId } = await context.params;
  const id = matchId?.trim();

  if (!id) {
    return NextResponse.json({ ok: false, message: "Bad request." }, { status: 400 });
  }

  try {
    const replay = await getReplayForMatch(id);
    if (!replay) {
      return NextResponse.json({ ok: false, message: "Not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, replay });
  } catch {
    return genericErrorResponse();
  }
}
