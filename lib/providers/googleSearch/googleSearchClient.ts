import { fetchGoogleLiveResult } from "@/lib/providers/googleSearch/googleSearchService";
import type {
  GoogleSearchLiveResult,
  GoogleSearchMatchRequest,
} from "@/lib/providers/googleSearch/googleSearchTypes";

export interface GoogleSearchStructuredResult {
  payload: GoogleSearchLiveResult["payload"];
  rawResponse?: unknown;
}

export interface GoogleSearchClient {
  isConfigured(): boolean;
  fetchTeamContext(
    request: GoogleSearchMatchRequest
  ): Promise<GoogleSearchStructuredResult | null>;
}

let testClientOverride: GoogleSearchClient | null = null;

export class LiveGoogleSearchClient implements GoogleSearchClient {
  isConfigured(): boolean {
    return Boolean(process.env.GOOGLE_GEMINI_API_KEY);
  }

  async fetchTeamContext(
    request: GoogleSearchMatchRequest
  ): Promise<GoogleSearchStructuredResult | null> {
    const result = await fetchGoogleLiveResult(request);
    if (!result) {
      return null;
    }
    return {
      payload: result.payload,
      rawResponse: result.rawResponse,
    };
  }
}

export function getGoogleSearchClient(): GoogleSearchClient {
  return testClientOverride ?? new LiveGoogleSearchClient();
}

export function setGoogleSearchClientForTests(client: GoogleSearchClient | null): void {
  testClientOverride = client;
}

export type { GoogleSearchMatchRequest };
