"use server";

import type { AnalysisReport } from "@/lib/analysis/types";
import type { UpdateMatchResultInput } from "@/lib/database/matchSchema";
import {
  loadMatchHistoryServerSide,
  saveMatchFromAnalysisServerSide,
  verifyMatchServerSide,
} from "@/lib/database/serverMatchStorage";

export async function loadMatchHistoryForBrowserAction() {
  return loadMatchHistoryServerSide();
}

export async function saveMatchFromAnalysisForBrowserAction(
  rawOdds: string,
  report: AnalysisReport
) {
  return saveMatchFromAnalysisServerSide(rawOdds, report);
}

export async function verifyMatchForBrowserAction(
  matchId: string,
  input: UpdateMatchResultInput
) {
  return verifyMatchServerSide(matchId, input);
}
