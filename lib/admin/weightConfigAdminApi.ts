import {
  assertMarketBlendWeight,
  parseProviderWeights,
} from "@/lib/recommendation/weightConfigRuntime";
import type {
  CreateWeightConfigDraftInput,
  RuntimeWeightConfig,
  WeightConfigActivationResult,
  WeightConfigRollbackResult,
  WeightConfigVersion,
} from "@/lib/recommendation/weightConfigTypes";
import {
  badRequestResponse,
  genericErrorResponse,
  isFiniteNumber,
  isPlainObject,
  parseJsonBody,
  requireAdminApiKey,
  requireAdminApiKeyAndRateLimit,
  RATE_LIMIT_PRESETS,
} from "@/lib/security";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import {
  WeightConfigAlreadyActiveError,
  WeightConfigConflictError,
  WeightConfigError,
  WeightConfigInvalidStatusError,
  WeightConfigNoActiveVersionError,
  WeightConfigNotFoundError,
  WeightConfigRollbackTargetNotFoundError,
  WeightConfigTransactionError,
} from "@/lib/supabase/services/weightConfigErrors";
import {
  activateWeightConfig,
  createWeightConfigDraft,
  getActiveWeightConfig,
  listWeightConfigVersions,
  rollbackWeightConfig,
} from "@/lib/supabase/services/weightConfigService";
import { NextResponse } from "next/server";

export const WEIGHT_CONFIG_ADMIN_CREATED_BY = "admin-api";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DRAFT_BODY_MAX_BYTES = 65_536;
const ROLLBACK_BODY_MAX_BYTES = 4_096;

export class WeightConfigApiValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeightConfigApiValidationError";
  }
}

export interface WeightConfigAdminApiDeps {
  createWeightConfigDraft: (
    input: CreateWeightConfigDraftInput
  ) => Promise<WeightConfigVersion>;
  listWeightConfigVersions: () => Promise<WeightConfigVersion[]>;
  getActiveWeightConfig: () => Promise<RuntimeWeightConfig>;
  activateWeightConfig: (versionId: string) => Promise<WeightConfigActivationResult>;
  rollbackWeightConfig: (
    targetVersionId?: string
  ) => Promise<WeightConfigRollbackResult>;
}

export interface ActiveWeightConfigApiPayload {
  providerWeights: RuntimeWeightConfig["providerWeights"];
  marketBlendWeight: number;
  source: "database" | "fallback";
  hasActiveVersion: boolean;
  activeVersion: WeightConfigVersion | null;
}

const defaultDeps: WeightConfigAdminApiDeps = {
  createWeightConfigDraft,
  listWeightConfigVersions,
  getActiveWeightConfig,
  activateWeightConfig,
  rollbackWeightConfig,
};

function hasWeightConfigTransactionEnv(): boolean {
  return Boolean(
    process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim()
  );
}

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function parseCreateWeightConfigDraftBody(
  body: Record<string, unknown>
): CreateWeightConfigDraftInput {
  if (!("providerWeights" in body)) {
    throw new WeightConfigApiValidationError("providerWeights is required.");
  }

  if (!("marketBlendWeight" in body)) {
    throw new WeightConfigApiValidationError("marketBlendWeight is required.");
  }

  if (!isFiniteNumber(body.marketBlendWeight)) {
    throw new WeightConfigApiValidationError("marketBlendWeight must be a finite number.");
  }

  let providerWeights;
  try {
    providerWeights = parseProviderWeights(body.providerWeights);
  } catch (error) {
    throw new WeightConfigApiValidationError(
      error instanceof Error ? error.message : "Invalid providerWeights."
    );
  }

  try {
    assertMarketBlendWeight(body.marketBlendWeight);
  } catch (error) {
    throw new WeightConfigApiValidationError(
      error instanceof Error ? error.message : "Invalid marketBlendWeight."
    );
  }

  let sourceReportSnapshot: CreateWeightConfigDraftInput["sourceReportSnapshot"] = {};
  if ("sourceReportSnapshot" in body) {
    if (!isPlainObject(body.sourceReportSnapshot)) {
      throw new WeightConfigApiValidationError("sourceReportSnapshot must be an object.");
    }
    sourceReportSnapshot = body.sourceReportSnapshot;
  }

  return {
    providerWeights,
    marketBlendWeight: body.marketBlendWeight,
    sourceReportSnapshot,
    createdBy: WEIGHT_CONFIG_ADMIN_CREATED_BY,
  };
}

export function parseRollbackWeightConfigBody(
  body: Record<string, unknown>
): { targetVersionId?: string } {
  if (!("targetVersionId" in body)) {
    return {};
  }

  const targetVersionId = body.targetVersionId;
  if (targetVersionId === null || targetVersionId === undefined) {
    return {};
  }

  if (typeof targetVersionId !== "string" || !targetVersionId.trim()) {
    throw new WeightConfigApiValidationError("targetVersionId must be a non-empty string.");
  }

  const normalized = targetVersionId.trim();
  if (!isUuid(normalized)) {
    throw new WeightConfigApiValidationError("targetVersionId must be a UUID.");
  }

  return { targetVersionId: normalized };
}

export function mapActiveWeightConfigResponse(
  config: RuntimeWeightConfig
): ActiveWeightConfigApiPayload {
  const hasActiveVersion = config.activeVersion !== null;
  return {
    providerWeights: config.providerWeights,
    marketBlendWeight: config.marketBlendWeight,
    source: hasActiveVersion ? "database" : "fallback",
    hasActiveVersion,
    activeVersion: config.activeVersion,
  };
}

export function mapWeightConfigErrorToResponse(error: unknown): NextResponse {
  if (error instanceof WeightConfigApiValidationError) {
    return badRequestResponse(error.message);
  }

  if (error instanceof WeightConfigNotFoundError) {
    return NextResponse.json(
      { ok: false, code: error.code, message: "Weight config version not found." },
      { status: 404 }
    );
  }

  if (error instanceof WeightConfigRollbackTargetNotFoundError) {
    return NextResponse.json(
      { ok: false, code: error.code, message: "Rollback target not found." },
      { status: 404 }
    );
  }

  if (
    error instanceof WeightConfigInvalidStatusError ||
    error instanceof WeightConfigAlreadyActiveError ||
    error instanceof WeightConfigNoActiveVersionError
  ) {
    return NextResponse.json(
      { ok: false, code: error.code, message: "Weight config state conflict." },
      { status: 409 }
    );
  }

  if (error instanceof WeightConfigConflictError) {
    return NextResponse.json(
      {
        ok: false,
        code: error.code,
        postgresCode: error.postgresCode,
        message: "Weight config transaction conflict.",
      },
      { status: 409 }
    );
  }

  if (error instanceof WeightConfigTransactionError) {
    return genericErrorResponse();
  }

  if (error instanceof WeightConfigError) {
    return genericErrorResponse();
  }

  return genericErrorResponse();
}

export function createWeightConfigAdminApiHandlers(
  deps: WeightConfigAdminApiDeps = defaultDeps
) {
  async function postDraft(request: Request): Promise<NextResponse> {
    const guardFailure = await requireAdminApiKeyAndRateLimit(
      request,
      RATE_LIMIT_PRESETS.weightConfigAdmin
    );
    if (guardFailure) {
      return guardFailure;
    }

    if (!hasSupabaseEnv()) {
      return genericErrorResponse(503);
    }

    const parsed = await parseJsonBody<Record<string, unknown>>(request, {
      maxBytes: DRAFT_BODY_MAX_BYTES,
      allowedKeys: ["providerWeights", "marketBlendWeight", "sourceReportSnapshot"],
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    try {
      const input = parseCreateWeightConfigDraftBody(parsed.body);
      const version = await deps.createWeightConfigDraft(input);
      return NextResponse.json({ ok: true, version });
    } catch (error) {
      return mapWeightConfigErrorToResponse(error);
    }
  }

  async function getVersions(request: Request): Promise<NextResponse> {
    const authFailure = requireAdminApiKey(request);
    if (authFailure) {
      return authFailure;
    }

    if (!hasSupabaseEnv()) {
      return genericErrorResponse(503);
    }

    try {
      const versions = await deps.listWeightConfigVersions();
      return NextResponse.json({ ok: true, versions });
    } catch {
      return genericErrorResponse();
    }
  }

  async function getActive(request: Request): Promise<NextResponse> {
    const authFailure = requireAdminApiKey(request);
    if (authFailure) {
      return authFailure;
    }

    if (!hasSupabaseEnv()) {
      return genericErrorResponse(503);
    }

    try {
      const config = await deps.getActiveWeightConfig();
      return NextResponse.json({
        ok: true,
        active: mapActiveWeightConfigResponse(config),
      });
    } catch {
      return genericErrorResponse();
    }
  }

  async function postActivate(
    request: Request,
    versionId: string
  ): Promise<NextResponse> {
    const guardFailure = await requireAdminApiKeyAndRateLimit(
      request,
      RATE_LIMIT_PRESETS.weightConfigAdmin
    );
    if (guardFailure) {
      return guardFailure;
    }

    if (!hasWeightConfigTransactionEnv()) {
      return genericErrorResponse(503);
    }

    const normalizedId = versionId.trim();
    if (!isUuid(normalizedId)) {
      return badRequestResponse("version id must be a UUID.");
    }

    try {
      const result = await deps.activateWeightConfig(normalizedId);
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      return mapWeightConfigErrorToResponse(error);
    }
  }

  async function postRollback(request: Request): Promise<NextResponse> {
    const guardFailure = await requireAdminApiKeyAndRateLimit(
      request,
      RATE_LIMIT_PRESETS.weightConfigAdmin
    );
    if (guardFailure) {
      return guardFailure;
    }

    if (!hasWeightConfigTransactionEnv()) {
      return genericErrorResponse(503);
    }

    const parsed = await parseJsonBody<Record<string, unknown>>(request, {
      maxBytes: ROLLBACK_BODY_MAX_BYTES,
      allowedKeys: ["targetVersionId"],
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    try {
      const input = parseRollbackWeightConfigBody(parsed.body);
      const result = await deps.rollbackWeightConfig(input.targetVersionId);
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      return mapWeightConfigErrorToResponse(error);
    }
  }

  return {
    postDraft,
    getVersions,
    getActive,
    postActivate,
    postRollback,
  };
}

export const weightConfigAdminApiHandlers = createWeightConfigAdminApiHandlers();
