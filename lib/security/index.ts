export {
  getAdminApiKey,
  isAdminApiKeyConfigured,
  verifyAdminApiKey,
  isAdminDashboardAuthRequired,
} from "@/lib/security/adminAuth";

export {
  getCronSecret,
  isCronSecretConfigured,
  verifyCronSecret,
  verifyCronRequest,
  isVercelCronInvocation,
} from "@/lib/security/cronAuth";

export {
  parseCronJsonBody,
  readCronStringParam,
} from "@/lib/security/cronRequest";

export {
  unauthorizedResponse,
  rateLimitedResponse,
  badRequestResponse,
  serviceUnavailableResponse,
  genericErrorResponse,
  publicHealthResponse,
} from "@/lib/security/securityResponse";

export {
  parseJsonBody,
  isNonEmptyString,
  isFiniteNumber,
  isPlainObject,
} from "@/lib/security/requestValidation";

export {
  requireAdminApiKey,
  requireAdminDashboardAuth,
  requireCronAuth,
  requireRateLimit,
  requireAdminApiKeyAndRateLimit,
  requireCronAuthAndRateLimit,
} from "@/lib/security/routeGuard";

export {
  checkRateLimit,
  getRateLimitAdapter,
  resetRateLimitForTests,
  setRateLimitAdapterForTests,
  RATE_LIMIT_PRESETS,
} from "@/lib/security/rateLimiter";

export type { RateLimitConfig } from "@/lib/security/rateLimiter";
