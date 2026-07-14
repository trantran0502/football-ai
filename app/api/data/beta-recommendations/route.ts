import {
  dataApiError,
  dataApiSuccess,
  resolveErrorMessage,
} from "@/lib/supabase/apiResponse";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { listBetaRecommendationsFromSupabase } from "@/lib/supabase/queries/betaRecommendations";
import {
  insertBetaRecommendationsToSupabase,
  updateBetaRecommendationInSupabase,
} from "@/lib/supabase/services/betaRecommendationService";
import type { BetaRecommendationRecord } from "@/lib/beta/types";

interface CreateBetaRecommendationsBody {
  records?: BetaRecommendationRecord[];
}

interface UpdateBetaRecommendationBody {
  record?: BetaRecommendationRecord;
}

export async function GET(request: Request) {
  if (!hasSupabaseEnv()) {
    return dataApiError(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
      503
    );
  }

  const { searchParams } = new URL(request.url);
  const matchRecordId = searchParams.get("matchRecordId")?.trim();
  const modelVersion = searchParams.get("modelVersion")?.trim();

  try {
    const records = await listBetaRecommendationsFromSupabase({
      matchRecordId: matchRecordId || undefined,
      modelVersion: modelVersion || undefined,
    });

    return dataApiSuccess(records, { count: records.length });
  } catch (error) {
    return dataApiError(resolveErrorMessage(error), 500);
  }
}

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) {
    return dataApiError(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
      503
    );
  }

  let body: CreateBetaRecommendationsBody;
  try {
    body = (await request.json()) as CreateBetaRecommendationsBody;
  } catch {
    return dataApiError("Invalid request body.", 400);
  }

  if (!Array.isArray(body.records) || body.records.length === 0) {
    return dataApiError("records array is required.", 400);
  }

  try {
    const saved = await insertBetaRecommendationsToSupabase(body.records);
    return dataApiSuccess(saved, { count: saved.length });
  } catch (error) {
    return dataApiError(resolveErrorMessage(error), 500);
  }
}

export async function PATCH(request: Request) {
  if (!hasSupabaseEnv()) {
    return dataApiError(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
      503
    );
  }

  let body: UpdateBetaRecommendationBody;
  try {
    body = (await request.json()) as UpdateBetaRecommendationBody;
  } catch {
    return dataApiError("Invalid request body.", 400);
  }

  if (!body.record?.id) {
    return dataApiError("record.id is required.", 400);
  }

  try {
    const saved = await updateBetaRecommendationInSupabase(body.record);
    if (!saved) {
      return dataApiError("Beta recommendation not found.", 404);
    }
    return dataApiSuccess(saved);
  } catch (error) {
    return dataApiError(resolveErrorMessage(error), 500);
  }
}
