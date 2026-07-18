"use client";

import {
  loadMatchHistoryForBrowserAction,
  saveMatchFromAnalysisForBrowserAction,
  verifyMatchForBrowserAction,
} from "@/app/actions/matchRecords";
import type { AnalysisReport } from "@/lib/analysis/types";
import { getBrowserHistoryRepository } from "@/lib/database/browserHistoryRepository";
import type {
  MatchHistoryLoadResult,
  MatchRecordWriteResult,
} from "@/lib/database/compositeMatchStorage";
import type { MatchRecordVerifyResult } from "@/lib/database/matchRecordApiTypes";
import type {
  SaveMatchInput,
  SaveMatchOutcome,
  UpdateMatchResultInput,
} from "@/lib/database/matchSchema";
import { isProductionRuntime } from "@/lib/storage/storageStatus";

export interface BrowserMatchStorageDeps {
  loadFromSupabase?: () => Promise<MatchHistoryLoadResult | null>;
  saveToSupabase?: (
    rawOdds: string,
    report: AnalysisReport
  ) => Promise<MatchRecordWriteResult | null>;
  verifyOnSupabase?: (
    matchId: string,
    input: UpdateMatchResultInput
  ) => Promise<MatchRecordVerifyResult | null>;
}

let testDepsOverride: BrowserMatchStorageDeps | null = null;

export function setBrowserMatchStorageDepsForTests(
  deps: BrowserMatchStorageDeps | null
): void {
  testDepsOverride = deps;
}

function formatUnknownError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function rethrowInProduction(error: unknown): null {
  if (isProductionRuntime()) {
    throw formatUnknownError(error);
  }
  return null;
}

async function defaultLoadFromSupabase(): Promise<MatchHistoryLoadResult | null> {
  try {
    return await loadMatchHistoryForBrowserAction();
  } catch (error) {
    return rethrowInProduction(error);
  }
}

async function defaultSaveToSupabase(
  rawOdds: string,
  report: AnalysisReport
): Promise<MatchRecordWriteResult | null> {
  try {
    return await saveMatchFromAnalysisForBrowserAction(rawOdds, report);
  } catch (error) {
    return rethrowInProduction(error);
  }
}

async function defaultVerifyOnSupabase(
  matchId: string,
  input: UpdateMatchResultInput
): Promise<MatchRecordVerifyResult | null> {
  try {
    return await verifyMatchForBrowserAction(matchId, input);
  } catch (error) {
    return rethrowInProduction(error);
  }
}

function resolveDeps(
  provided?: BrowserMatchStorageDeps
): Required<BrowserMatchStorageDeps> {
  return {
    loadFromSupabase:
      provided?.loadFromSupabase ??
      testDepsOverride?.loadFromSupabase ??
      defaultLoadFromSupabase,
    saveToSupabase:
      provided?.saveToSupabase ??
      testDepsOverride?.saveToSupabase ??
      defaultSaveToSupabase,
    verifyOnSupabase:
      provided?.verifyOnSupabase ??
      testDepsOverride?.verifyOnSupabase ??
      defaultVerifyOnSupabase,
  };
}

function loadMatchHistoryLocally(): MatchHistoryLoadResult {
  const repository = getBrowserHistoryRepository();
  return {
    matches: repository.getAllMatches(),
    stats: repository.getStats(),
    storage: "local",
  };
}

function saveMatchIfNewLocally(input: SaveMatchInput): SaveMatchOutcome {
  return getBrowserHistoryRepository().saveMatchIfNew(input);
}

function verifyMatchLocally(
  matchId: string,
  input: UpdateMatchResultInput
) {
  return getBrowserHistoryRepository().verifyMatch(matchId, input);
}

function buildSaveInput(rawOdds: string, report: AnalysisReport): SaveMatchInput {
  const matchDate = new Date().toISOString().split("T")[0];
  return {
    date: matchDate,
    matchDate,
    league: report.match.league ?? "",
    homeTeam: report.match.homeTeam,
    awayTeam: report.match.awayTeam,
    rawOdds,
    marketSelections: report.markets,
    analysis: report,
    candidates: report.candidates,
    status: "PENDING",
  };
}

function assertSupabaseResultInProduction<T>(
  result: T | null | undefined,
  action: "load" | "save" | "verify"
): asserts result is T {
  if (result) {
    return;
  }

  if (isProductionRuntime()) {
    throw new Error(`Supabase ${action} returned no result in production.`);
  }
}

export async function loadMatchHistoryForBrowser(
  deps?: BrowserMatchStorageDeps
): Promise<MatchHistoryLoadResult> {
  const resolved = resolveDeps(deps);
  const supabaseResult = await resolved.loadFromSupabase();
  assertSupabaseResultInProduction(supabaseResult, "load");
  if (supabaseResult) {
    return supabaseResult;
  }

  return loadMatchHistoryLocally();
}

export async function saveMatchFromAnalysisForBrowser(
  rawOdds: string,
  report: AnalysisReport,
  deps?: BrowserMatchStorageDeps
): Promise<MatchRecordWriteResult> {
  const resolved = resolveDeps(deps);
  const supabaseResult = await resolved.saveToSupabase(rawOdds, report);
  assertSupabaseResultInProduction(supabaseResult, "save");
  if (supabaseResult) {
    return supabaseResult;
  }

  const outcome = saveMatchIfNewLocally(buildSaveInput(rawOdds, report));
  return {
    ...outcome,
    storage: outcome.record ? "local" : "failed",
  };
}

export async function verifyMatchForBrowser(
  matchId: string,
  input: UpdateMatchResultInput,
  deps?: BrowserMatchStorageDeps
): Promise<MatchRecordVerifyResult> {
  const resolved = resolveDeps(deps);
  const supabaseResult = await resolved.verifyOnSupabase(matchId, input);
  if (supabaseResult?.record) {
    return supabaseResult;
  }

  if (isProductionRuntime()) {
    if (!supabaseResult) {
      throw new Error("Supabase verify returned no result in production.");
    }
    throw new Error(`Supabase verify failed for match ${matchId} in production.`);
  }

  const localRecord = verifyMatchLocally(matchId, input);
  return {
    record: localRecord,
    storage: localRecord ? "local" : "failed",
  };
}
