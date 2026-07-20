import {
  buildGeminiGenerateContentUrl,
  buildGeminiGroundingRequestBody,
  GROUNDING_COMPATIBLE_FALLBACK_MODEL,
  normalizeGeminiModelId,
  resolveConfiguredGroundingModel,
  sanitizeGeminiUrlForLogs,
  shouldRetryGroundingWithFallbackModel,
} from "@/lib/providers/googleSearch/geminiGroundingConfig";
import {
  buildGeminiGroundingDiagnostics,
  parseGeminiGroundingResponse,
} from "@/lib/providers/googleSearch/geminiGroundingParser";
import {
  buildGeminiGroundingPrompt,
  buildGeminiSearchQuery,
} from "@/lib/providers/googleSearch/googleSearchPrompt";
import type {
  GeminiGenerateContentResponse,
  GeminiGroundingFetchOutcome,
  GoogleSearchLiveResult,
  GoogleSearchMatchRequest,
  GoogleSearchProviderConfig,
} from "@/lib/providers/googleSearch/googleSearchTypes";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REQUESTS_PER_MINUTE = 10;

type GeminiFetchFn = (
  url: string,
  init: RequestInit
) => Promise<Response>;

let testFetchOverride: GeminiFetchFn | null = null;
let testProviderOverride: GoogleSearchProvider | null = null;

export class GoogleSearchProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fallbackModel: string;
  private readonly timeoutMs: number;
  private readonly maxRequestsPerMinute: number;
  private minuteKey = "";
  private minuteCount = 0;

  constructor(config: GoogleSearchProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.GOOGLE_GEMINI_API_KEY ?? "";
    this.model = normalizeGeminiModelId(
      config.model ?? resolveConfiguredGroundingModel()
    );
    this.fallbackModel = normalizeGeminiModelId(
      config.fallbackModel ?? GROUNDING_COMPATIBLE_FALLBACK_MODEL
    );
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRequestsPerMinute =
      config.maxRequestsPerMinute ?? DEFAULT_MAX_REQUESTS_PER_MINUTE;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  getConfiguredModel(): string {
    return this.model;
  }

  canMakeRequest(now = Date.now()): boolean {
    this.refreshMinuteWindow(now);
    return this.minuteCount < this.maxRequestsPerMinute;
  }

  async fetchTeamContext(
    request: GoogleSearchMatchRequest
  ): Promise<GoogleSearchLiveResult | null> {
    const outcome = await this.fetchTeamContextWithDiagnostics(request);
    return outcome.result;
  }

  async fetchTeamContextWithDiagnostics(
    request: GoogleSearchMatchRequest
  ): Promise<GeminiGroundingFetchOutcome> {
    if (!this.isConfigured()) {
      return {
        result: null,
        diagnostics: buildGeminiGroundingDiagnostics({
          httpStatus: null,
          model: this.model,
          fallbackUsed: false,
          failureReason: "response_parse_failed",
          parseFailureReason: "not_configured",
        }),
      };
    }

    if (!this.canMakeRequest()) {
      return {
        result: null,
        diagnostics: buildGeminiGroundingDiagnostics({
          httpStatus: null,
          model: this.model,
          fallbackUsed: false,
          failureReason: "rate_limited",
          parseFailureReason: "provider_rate_limit_exceeded",
        }),
      };
    }

    const primary = await this.fetchWithModel(request, this.model, false);
    if (
      primary.result ||
      primary.diagnostics.httpStatus === 429 ||
      primary.diagnostics.failureReason === "rate_limited" ||
      !shouldRetryGroundingWithFallbackModel({
        httpStatus: primary.diagnostics.httpStatus,
        geminiErrorMessage: primary.diagnostics.geminiErrorMessage,
        failureReason: primary.diagnostics.failureReason,
        fallbackAlreadyUsed: false,
      }) ||
      this.fallbackModel === this.model
    ) {
      return primary;
    }

    const fallback = await this.fetchWithModel(request, this.fallbackModel, true);
    return fallback;
  }

  private async fetchWithModel(
    request: GoogleSearchMatchRequest,
    model: string,
    fallbackUsed: boolean
  ): Promise<GeminiGroundingFetchOutcome> {
    const query = buildGeminiSearchQuery(request);
    const prompt = buildGeminiGroundingPrompt(request);
    const searchTime = new Date().toISOString();
    const url = buildGeminiGenerateContentUrl(model, this.apiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      this.recordRequest();
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildGeminiGroundingRequestBody(prompt)),
        signal: controller.signal,
        cache: "no-store",
      });

      let rawResponse: GeminiGenerateContentResponse;
      try {
        rawResponse = (await response.json()) as GeminiGenerateContentResponse;
      } catch (error) {
        return {
          result: null,
          diagnostics: buildGeminiGroundingDiagnostics({
            httpStatus: response.status,
            model,
            fallbackUsed,
            failureReason: "response_parse_failed",
            parseFailureReason:
              error instanceof Error ? error.message : "invalid_json_response",
          }),
        };
      }

      if (!response.ok) {
        console.warn(
          "Gemini grounding request failed:",
          sanitizeGeminiUrlForLogs(url),
          rawResponse.error?.message ?? response.status
        );
      }

      return parseGeminiGroundingResponse({
        request,
        rawResponse,
        httpStatus: response.status,
        searchTime,
        query,
        model,
        fallbackUsed,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failureReason =
        error instanceof Error && error.name === "AbortError"
          ? "network_error"
          : "network_error";
      console.warn(
        "Gemini grounding unavailable:",
        sanitizeGeminiUrlForLogs(url),
        message
      );
      return {
        result: null,
        diagnostics: buildGeminiGroundingDiagnostics({
          httpStatus: null,
          model,
          fallbackUsed,
          failureReason,
          parseFailureReason: message,
        }),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchImpl(url: string, init: RequestInit): Promise<Response> {
    const fetchFn = testFetchOverride ?? fetch;
    return fetchFn(url, init);
  }

  private recordRequest(now = Date.now()): void {
    this.refreshMinuteWindow(now);
    this.minuteCount += 1;
  }

  private refreshMinuteWindow(now: number): void {
    const key = new Date(now).toISOString().slice(0, 16);
    if (this.minuteKey !== key) {
      this.minuteKey = key;
      this.minuteCount = 0;
    }
  }
}

export function getGoogleSearchProvider(): GoogleSearchProvider {
  return testProviderOverride ?? new GoogleSearchProvider();
}

export function setGoogleSearchProviderForTests(
  provider: GoogleSearchProvider | null
): void {
  testProviderOverride = provider;
}

export function setGeminiFetchForTests(fetchFn: GeminiFetchFn | null): void {
  testFetchOverride = fetchFn;
}

export function resetGoogleSearchProviderForTests(): void {
  testProviderOverride = null;
  testFetchOverride = null;
}

export type { GoogleSearchLiveResult, GoogleSearchMatchRequest, GeminiGroundingFetchOutcome };
