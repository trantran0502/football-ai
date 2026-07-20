export const DEFAULT_GROUNDING_MODEL = "gemini-2.0-flash";

export const GROUNDING_COMPATIBLE_FALLBACK_MODEL =
  process.env.GOOGLE_GEMINI_GROUNDING_FALLBACK_MODEL?.trim() ||
  DEFAULT_GROUNDING_MODEL;

export function normalizeGeminiModelId(model: string): string {
  return model.replace(/^models\//, "").trim();
}

export function resolveConfiguredGroundingModel(
  configuredModel = process.env.GOOGLE_GEMINI_MODEL?.trim() ?? DEFAULT_GROUNDING_MODEL
): string {
  const normalized = normalizeGeminiModelId(configuredModel);
  return normalized.length > 0 ? normalized : DEFAULT_GROUNDING_MODEL;
}

export function buildGeminiGenerateContentUrl(model: string, apiKey: string): string {
  const normalized = normalizeGeminiModelId(model);
  return `https://generativelanguage.googleapis.com/v1beta/models/${normalized}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

export function buildGeminiGroundingRequestBody(prompt: string): Record<string, unknown> {
  return {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0.2,
    },
  };
}

export function shouldRetryGroundingWithFallbackModel(input: {
  httpStatus: number | null;
  geminiErrorMessage: string | null;
  failureReason: string | null;
  fallbackAlreadyUsed: boolean;
}): boolean {
  if (input.fallbackAlreadyUsed) {
    return false;
  }

  if (input.httpStatus === 404) {
    return true;
  }

  const message = `${input.geminiErrorMessage ?? ""} ${input.failureReason ?? ""}`.toLowerCase();
  if (
    message.includes("model") &&
    (message.includes("not found") || message.includes("unsupported"))
  ) {
    return true;
  }

  if (
    message.includes("google_search") &&
    (message.includes("not supported") || message.includes("unsupported"))
  ) {
    return true;
  }

  return false;
}

export function sanitizeGeminiUrlForLogs(url: string): string {
  return url.replace(/([?&]key=)[^&]+/i, "$1[REDACTED]");
}
