import {
  isAdminApiKeyConfigured,
  isAdminDashboardAuthRequired,
  verifyAdminApiKey,
} from "@/lib/security/adminAuth";
import { verifyCronSecret, isCronSecretConfigured } from "@/lib/security/cronAuth";
import { requireSchedulerEnabled } from "@/lib/scheduler/schedulerEnabled";
import {
  checkRateLimit,
  type RateLimitConfig,
} from "@/lib/security/rateLimiter";
import {
  rateLimitedResponse,
  serviceUnavailableResponse,
  unauthorizedResponse,
} from "@/lib/security/securityResponse";
import type { NextResponse } from "next/server";

export function requireAdminApiKey(request: Request): NextResponse | null {
  if (!isAdminApiKeyConfigured()) {
    return serviceUnavailableResponse();
  }

  if (!verifyAdminApiKey(request)) {
    return unauthorizedResponse();
  }

  return null;
}

export function requireAdminDashboardAuth(request: Request): NextResponse | null {
  if (!isAdminDashboardAuthRequired()) {
    return null;
  }

  return requireAdminApiKey(request);
}

export function requireCronAuth(request: Request): NextResponse | null {
  if (!isCronSecretConfigured()) {
    return serviceUnavailableResponse();
  }

  if (!verifyCronSecret(request)) {
    return unauthorizedResponse();
  }

  return null;
}

export async function requireRateLimit(
  request: Request,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  const decision = await checkRateLimit(request, config);
  if (decision === "deny") {
    return rateLimitedResponse();
  }
  return null;
}

export async function requireAdminApiKeyAndRateLimit(
  request: Request,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  const authFailure = requireAdminApiKey(request);
  if (authFailure) {
    return authFailure;
  }

  return requireRateLimit(request, config);
}

export async function requireCronAuthAndRateLimit(
  request: Request,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  const schedulerFailure = requireSchedulerEnabled();
  if (schedulerFailure) {
    return schedulerFailure;
  }

  const authFailure = requireCronAuth(request);
  if (authFailure) {
    return authFailure;
  }

  return requireRateLimit(request, config);
}
