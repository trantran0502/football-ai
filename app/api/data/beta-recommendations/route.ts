import {
  genericErrorResponse,
  isNonEmptyString,
  isPlainObject,
  parseJsonBody,
  requireAdminApiKey,
} from "@/lib/security";
import type { BetaRecommendationRecord } from "@/lib/beta/types";
import { dataApiError, dataApiSuccess } from "@/lib/supabase/apiResponse";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { listBetaRecommendationsFromSupabase } from "@/lib/supabase/queries/betaRecommendations";
import {
  insertBetaRecommendationsToSupabase,
  updateBetaRecommendationInSupabase,
} from "@/lib/supabase/services/betaRecommendationService";

const MAX_BODY_BYTES = 512_000;

export async function GET(request: Request) {
  const authFailure = requireAdminApiKey(request);
  if (authFailure) {
    return authFailure;
  }

  if (!hasSupabaseEnv()) {
    return genericErrorResponse(503);
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
  } catch {
    return genericErrorResponse();
  }
}

export async function POST(request: Request) {
  const authFailure = requireAdminApiKey(request);
  if (authFailure) {
    return authFailure;
  }

  if (!hasSupabaseEnv()) {
    return genericErrorResponse(503);
  }

  const parsed = await parseJsonBody<Record<string, unknown>>(request, {
    maxBytes: MAX_BODY_BYTES,
    allowedKeys: ["records"],
  });
  if (!parsed.ok) {
    return parsed.response;
  }

  const records = parsed.body.records;
  if (!Array.isArray(records) || records.length === 0) {
    return dataApiError("Invalid request body.", 400);
  }

  if (!records.every((item) => isPlainObject(item) && isNonEmptyString(item.id))) {
    return dataApiError("Invalid request body.", 400);
  }

  try {
    const saved = await insertBetaRecommendationsToSupabase(
      records as unknown as BetaRecommendationRecord[]
    );
    return dataApiSuccess(saved, { count: saved.length });
  } catch {
    return genericErrorResponse();
  }
}

export async function PATCH(request: Request) {
  const authFailure = requireAdminApiKey(request);
  if (authFailure) {
    return authFailure;
  }

  if (!hasSupabaseEnv()) {
    return genericErrorResponse(503);
  }

  const parsed = await parseJsonBody<Record<string, unknown>>(request, {
    maxBytes: MAX_BODY_BYTES,
    allowedKeys: ["record"],
  });
  if (!parsed.ok) {
    return parsed.response;
  }

  const record = parsed.body.record;
  if (!isPlainObject(record) || !isNonEmptyString(record.id)) {
    return dataApiError("Invalid request body.", 400);
  }

  try {
    const saved = await updateBetaRecommendationInSupabase(
      record as unknown as BetaRecommendationRecord
    );
    if (!saved) {
      return dataApiError("Not found.", 404);
    }
    return dataApiSuccess(saved);
  } catch {
    return genericErrorResponse();
  }
}
