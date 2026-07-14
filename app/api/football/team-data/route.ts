import { NextResponse } from "next/server";
import { isFreeMode } from "@/lib/providers/free/config";
import { fetchFreeTeamData } from "@/lib/providers/free/server/freeFootballService";
import type { TeamDataRequest } from "@/lib/providers/free/types";

export async function POST(request: Request) {
  if (!isFreeMode()) {
    return NextResponse.json(
      {
        ok: false,
        data: null,
        fromCache: false,
        message: "目前僅支援 FOOTBALL_DATA_MODE=free。",
      },
      { status: 400 }
    );
  }

  let body: TeamDataRequest;
  try {
    body = (await request.json()) as TeamDataRequest;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        data: null,
        fromCache: false,
        message: "Invalid request body.",
      },
      { status: 400 }
    );
  }

  if (!body.homeTeam?.trim() || !body.awayTeam?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        data: null,
        fromCache: false,
        message: "homeTeam and awayTeam are required.",
      },
      { status: 400 }
    );
  }

  try {
    const data = await fetchFreeTeamData({
      homeTeam: body.homeTeam.trim(),
      awayTeam: body.awayTeam.trim(),
      matchDate: body.matchDate,
      league: body.league,
    });

    return NextResponse.json({
      ok: true,
      data,
      fromCache: false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        data: null,
        fromCache: false,
        message:
          error instanceof Error ? error.message : "Failed to fetch team data.",
      },
      { status: 500 }
    );
  }
}
