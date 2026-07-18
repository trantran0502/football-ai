import type { AnalysisReport } from "@/lib/analysis/types";
import type {
  HistoricalMatchRecord,
  MatchHistoryStats,
  SaveMatchOutcome,
  UpdateMatchResultInput,
} from "@/lib/database/matchSchema";
import type { MatchRecordVerifyResult } from "@/lib/database/matchRecordApiTypes";

export type MatchRecordStorageSource = "supabase" | "local";

export type MatchRecordWriteResult = SaveMatchOutcome & {
  storage: MatchRecordStorageSource;
};

export interface MatchHistoryLoadResult {
  matches: HistoricalMatchRecord[];
  stats: MatchHistoryStats;
  storage: MatchRecordStorageSource;
}

export type { MatchRecordVerifyResult };

export interface CreateMatchRecordRequest {
  rawOdds: string;
  report: AnalysisReport;
  matchDate?: string;
}

export interface VerifyMatchRecordRequest extends UpdateMatchResultInput {
  id: string;
}

export interface MatchRecordsApiListResponse {
  ok: boolean;
  data: HistoricalMatchRecord[] | null;
  stats?: MatchHistoryStats;
  message?: string | null;
}

export interface MatchRecordsApiWriteResponse {
  ok: boolean;
  data: HistoricalMatchRecord | null;
  status?: SaveMatchOutcome["status"];
  message?: string | null;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function listMatchRecordsViaApi(): Promise<MatchHistoryLoadResult | null> {
  try {
    const response = await fetch("/api/data/match-records", {
      method: "GET",
      cache: "no-store",
    });
    const payload = await parseJsonResponse<MatchRecordsApiListResponse>(response);

    if (!response.ok || !payload.ok || !payload.data) {
      return null;
    }

    return {
      matches: payload.data,
      stats: payload.stats ?? {
        total: payload.data.length,
        pending: 0,
        verified: 0,
        failed: 0,
        cancelled: 0,
      },
      storage: "supabase",
    };
  } catch {
    return null;
  }
}

export async function createMatchRecordViaApi(
  request: CreateMatchRecordRequest
): Promise<MatchRecordWriteResult | null> {
  try {
    const response = await fetch("/api/data/match-records", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });
    const payload = await parseJsonResponse<MatchRecordsApiWriteResponse>(response);

    if (!response.ok || !payload.ok || !payload.status) {
      return null;
    }

    if (!payload.data) {
      return null;
    }

    const base = {
      record: payload.data,
      storage: "supabase" as const,
    };

    switch (payload.status) {
      case "created":
      case "duplicate":
      case "enriched":
        return { status: payload.status, ...base };
      case "incomplete_analysis_rejected":
        return {
          status: payload.status,
          reason: "oddsMissing",
          ...base,
        };
      case "conflicting_record":
        return {
          status: payload.status,
          reason: "Conflicting record.",
          ...base,
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export async function verifyMatchRecordViaApi(
  request: VerifyMatchRecordRequest
): Promise<MatchRecordVerifyResult | null> {
  try {
    const response = await fetch("/api/data/match-records", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });
    const payload = await parseJsonResponse<MatchRecordsApiWriteResponse>(response);

    if (!response.ok || !payload.ok) {
      return null;
    }

    return {
      record: payload.data,
      storage: "supabase",
    };
  } catch {
    return null;
  }
}
