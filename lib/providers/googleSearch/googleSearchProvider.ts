import {
  buildGeminiGroundingPrompt,
  buildGeminiSearchQuery,
  GEMINI_FOOTBALL_RESPONSE_SCHEMA,
} from "@/lib/providers/googleSearch/googleSearchPrompt";
import {
  mapGeminiStructuredToHybridPayload,
  parseGeminiStructuredJson,
} from "@/lib/providers/googleSearch/googleSearchMapper";
import type {
  GeminiGenerateContentResponse,
  GoogleSearchLiveResult,
  GoogleSearchMatchRequest,
  GoogleSearchProviderConfig,
} from "@/lib/providers/googleSearch/googleSearchTypes";

const DEFAULT_MODEL = "gemini-2.0-flash";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REQUESTS_PER_MINUTE = 10;
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiFetchFn = (
  url: string,
  init: RequestInit
) => Promise<Response>;

let testFetchOverride: GeminiFetchFn | null = null;
let testProviderOverride: GoogleSearchProvider | null = null;

export class GoogleSearchProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRequestsPerMinute: number;
  private minuteKey = "";
  private minuteCount = 0;

  constructor(config: GoogleSearchProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.GOOGLE_GEMINI_API_KEY ?? "";
    this.model = config.model ?? process.env.GOOGLE_GEMINI_MODEL ?? DEFAULT_MODEL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRequestsPerMinute =
      config.maxRequestsPerMinute ?? DEFAULT_MAX_REQUESTS_PER_MINUTE;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  canMakeRequest(now = Date.now()): boolean {
    this.refreshMinuteWindow(now);
    return this.minuteCount < this.maxRequestsPerMinute;
  }

  async fetchTeamContext(
    request: GoogleSearchMatchRequest
  ): Promise<GoogleSearchLiveResult | null> {
    if (!this.isConfigured()) {
      return null;
    }

    if (!this.canMakeRequest()) {
      console.warn("Gemini unavailable:", new Error("Google Search rate limit exceeded."));
      return null;
    }

    const query = buildGeminiSearchQuery(request);
    const prompt = buildGeminiGroundingPrompt(request);
    const searchTime = new Date().toISOString();
    const url = `${GEMINI_BASE_URL}/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      this.recordRequest();
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          tools: [{ google_search: {} }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: GEMINI_FOOTBALL_RESPONSE_SCHEMA,
          },
        }),
        signal: controller.signal,
        cache: "no-store",
      });

      const rawResponse = (await response.json()) as GeminiGenerateContentResponse;

      if (!response.ok) {
        console.warn(
          "Gemini unavailable:",
          new Error(
            rawResponse.error?.message ??
              `Gemini request failed with status ${response.status}`
          )
        );
        return null;
      }

      const text = rawResponse.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        return null;
      }

      const structured = parseGeminiStructuredJson(text);
      const metadata = rawResponse.candidates?.[0]?.groundingMetadata;

      return mapGeminiStructuredToHybridPayload(
        request,
        structured,
        metadata,
        searchTime,
        query,
        rawResponse
      );
    } catch (error) {
      console.warn("Gemini unavailable:", error);
      return null;
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

export type { GoogleSearchLiveResult, GoogleSearchMatchRequest };
