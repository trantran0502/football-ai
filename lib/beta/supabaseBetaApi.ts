import type {
  BetaRecommendationRecord,
  RollingEvaluationReport,
} from "@/lib/beta/types";

export interface BetaRecommendationsApiListResponse {
  ok: boolean;
  data: BetaRecommendationRecord[] | null;
  message?: string | null;
}

export interface BetaRecommendationsApiWriteResponse {
  ok: boolean;
  data: BetaRecommendationRecord[] | BetaRecommendationRecord | null;
  message?: string | null;
}

export interface BetaRollingReportsApiListResponse {
  ok: boolean;
  data: RollingEvaluationReport[] | null;
  message?: string | null;
}

export interface BetaRollingReportsApiWriteResponse {
  ok: boolean;
  data: RollingEvaluationReport | null;
  message?: string | null;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function listBetaRecommendationsViaApi(): Promise<
  BetaRecommendationRecord[] | null
> {
  try {
    const response = await fetch("/api/data/beta-recommendations", {
      method: "GET",
      cache: "no-store",
    });
    const payload =
      await parseJsonResponse<BetaRecommendationsApiListResponse>(response);

    if (!response.ok || !payload.ok || !payload.data) {
      return null;
    }

    return payload.data;
  } catch {
    return null;
  }
}

export async function createBetaRecommendationsViaApi(
  records: BetaRecommendationRecord[]
): Promise<BetaRecommendationRecord[] | null> {
  try {
    const response = await fetch("/api/data/beta-recommendations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records }),
    });
    const payload =
      await parseJsonResponse<BetaRecommendationsApiWriteResponse>(response);

    if (!response.ok || !payload.ok || !payload.data || !Array.isArray(payload.data)) {
      return null;
    }

    return payload.data;
  } catch {
    return null;
  }
}

export async function updateBetaRecommendationViaApi(
  record: BetaRecommendationRecord
): Promise<BetaRecommendationRecord | null> {
  try {
    const response = await fetch("/api/data/beta-recommendations", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ record }),
    });
    const payload =
      await parseJsonResponse<BetaRecommendationsApiWriteResponse>(response);

    if (!response.ok || !payload.ok || !payload.data || Array.isArray(payload.data)) {
      return null;
    }

    return payload.data;
  } catch {
    return null;
  }
}

export async function listRollingReportsViaApi(): Promise<
  RollingEvaluationReport[] | null
> {
  try {
    const response = await fetch("/api/data/beta-rolling-reports", {
      method: "GET",
      cache: "no-store",
    });
    const payload =
      await parseJsonResponse<BetaRollingReportsApiListResponse>(response);

    if (!response.ok || !payload.ok || !payload.data) {
      return null;
    }

    return payload.data;
  } catch {
    return null;
  }
}

export async function createRollingReportViaApi(
  report: RollingEvaluationReport
): Promise<RollingEvaluationReport | null> {
  try {
    const response = await fetch("/api/data/beta-rolling-reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ report }),
    });
    const payload =
      await parseJsonResponse<BetaRollingReportsApiWriteResponse>(response);

    if (!response.ok || !payload.ok || !payload.data) {
      return null;
    }

    return payload.data;
  } catch {
    return null;
  }
}
