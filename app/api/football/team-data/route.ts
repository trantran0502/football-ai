import {
  genericErrorResponse,
  isNonEmptyString,
  parseJsonBody,
  requireAdminApiKey,
  requireAdminApiKeyAndRateLimit,
  RATE_LIMIT_PRESETS,
} from "@/lib/security";
import { isFreeMode } from "@/lib/providers/free/config";
import { fetchFreeTeamData } from "@/lib/providers/free/server/freeFootballService";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const guardFailure = await requireAdminApiKeyAndRateLimit(
    request,
    RATE_LIMIT_PRESETS.teamData
  );
  if (guardFailure) {
    return guardFailure;
  }

  if (!isFreeMode()) {
    return NextResponse.json({ ok: false, message: "Bad request." }, { status: 400 });
  }

  const parsed = await parseJsonBody<Record<string, unknown>>(request, {
    maxBytes: 8_192,
    allowedKeys: ["homeTeam", "awayTeam", "matchDate", "league"],
  });
  if (!parsed.ok) {
    return parsed.response;
  }

  const { homeTeam, awayTeam, matchDate, league } = parsed.body;
  if (!isNonEmptyString(homeTeam) || !isNonEmptyString(awayTeam)) {
    return NextResponse.json({ ok: false, message: "Bad request." }, { status: 400 });
  }

  try {
    const data = await fetchFreeTeamData({
      homeTeam: homeTeam.trim(),
      awayTeam: awayTeam.trim(),
      matchDate: isNonEmptyString(matchDate) ? matchDate : undefined,
      league: isNonEmptyString(league) ? league : undefined,
    });

    return NextResponse.json({
      ok: true,
      data,
      fromCache: false,
    });
  } catch {
    return genericErrorResponse();
  }
}
