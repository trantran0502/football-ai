import {
  mapGeminiStructuredToHybridPayload,
  parseGeminiStructuredJson,
} from "@/lib/providers/googleSearch/googleSearchMapper";
import type {
  GeminiFootballStructuredResponse,
  GeminiGenerateContentResponse,
  GeminiGroundingDiagnostics,
  GeminiGroundingMetadata,
  GoogleSearchLiveResult,
  GoogleSearchMatchRequest,
} from "@/lib/providers/googleSearch/googleSearchTypes";

export type GroundingFailureReason =
  | "authentication_failed"
  | "permission_denied"
  | "model_not_found"
  | "model_not_supported_for_grounding"
  | "quota_exhausted"
  | "rate_limited"
  | "safety_blocked"
  | "empty_candidates"
  | "empty_text"
  | "missing_grounding_metadata"
  | "response_parse_failed"
  | "network_error"
  | "rate_limit_exceeded";

const EMPTY_STRUCTURED: GeminiFootballStructuredResponse = {
  recentFormLast10Official: [],
  recentFormLast5Home: [],
  recentFormLast5Away: [],
  includesFriendlies: false,
  includesExtraTime: false,
  includesPenalties: false,
  h2hLast5Official: [],
  standings: [],
  homeMetrics: null,
  awayMetrics: null,
  injuries: [],
  suspensions: [],
  matchStatus: null,
};

function readCandidateFinishReason(
  candidate: NonNullable<GeminiGenerateContentResponse["candidates"]>[number]
): string | null {
  const finishReason = (candidate as { finishReason?: string }).finishReason;
  return typeof finishReason === "string" ? finishReason : null;
}

function readSafetyBlockReason(response: GeminiGenerateContentResponse): string | null {
  const promptBlock = response.promptFeedback?.blockReason;
  if (typeof promptBlock === "string" && promptBlock.length > 0) {
    return promptBlock;
  }

  for (const candidate of response.candidates ?? []) {
    const finishReason = readCandidateFinishReason(candidate);
    if (finishReason?.includes("SAFETY")) {
      return finishReason;
    }
    for (const rating of candidate.safetyRatings ?? []) {
      if (rating.blocked) {
        return rating.category ?? "safety_blocked";
      }
    }
  }

  return null;
}

export function extractGeminiCandidateText(
  response: GeminiGenerateContentResponse
): string | null {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const texts = parts
    .map((part) => (typeof part.text === "string" ? part.text.trim() : ""))
    .filter((value) => value.length > 0);
  if (texts.length === 0) {
    return null;
  }
  return texts.join("\n");
}

export function unwrapJsonTextFromGemini(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return text.trim();
}

export function classifyGeminiHttpFailure(input: {
  httpStatus: number;
  geminiErrorMessage: string | null;
  geminiErrorCode: number | null;
}): GroundingFailureReason {
  const message = (input.geminiErrorMessage ?? "").toLowerCase();

  if (input.httpStatus === 401) {
    return "authentication_failed";
  }
  if (input.httpStatus === 403) {
    return "permission_denied";
  }
  if (input.httpStatus === 404) {
    return "model_not_found";
  }
  if (input.httpStatus === 429) {
    if (message.includes("quota")) {
      return "quota_exhausted";
    }
    return "rate_limited";
  }
  if (
    message.includes("tool use with a response mime type") ||
    message.includes("google_search") && message.includes("unsupported")
  ) {
    return "model_not_supported_for_grounding";
  }

  return "response_parse_failed";
}

export function buildGeminiGroundingDiagnostics(input: {
  httpStatus: number | null;
  model: string;
  fallbackUsed: boolean;
  rawResponse?: GeminiGenerateContentResponse | null;
  parseFailureReason?: string | null;
  failureReason?: GroundingFailureReason | null;
  hasResponseText?: boolean;
  hasGroundingMetadata?: boolean;
}): GeminiGroundingDiagnostics {
  const candidates = input.rawResponse?.candidates ?? [];
  const metadata = candidates[0]?.groundingMetadata;
  const safetyBlockReason = input.rawResponse
    ? readSafetyBlockReason(input.rawResponse)
    : null;

  return {
    httpStatus: input.httpStatus,
    model: input.model,
    groundingFallbackUsed: input.fallbackUsed,
    geminiErrorCode: input.rawResponse?.error?.code ?? null,
    geminiErrorMessage: input.rawResponse?.error?.message ?? null,
    candidateCount: candidates.length,
    finishReason: candidates[0] ? readCandidateFinishReason(candidates[0]) : null,
    safetyBlockReason,
    hasResponseText: input.hasResponseText ?? false,
    hasGroundingMetadata: input.hasGroundingMetadata ?? Boolean(metadata),
    parseFailureReason: input.parseFailureReason ?? null,
    failureReason: input.failureReason ?? null,
    groundingChunksCount: metadata?.groundingChunks?.length ?? 0,
    groundingSupportsCount: metadata?.groundingSupports?.length ?? 0,
    webSearchQueriesCount: metadata?.webSearchQueries?.length ?? 0,
  };
}

export function hasUsableGroundingMetadata(
  metadata: GeminiGroundingMetadata | undefined
): boolean {
  if (!metadata) {
    return false;
  }
  return (
    (metadata.groundingChunks?.length ?? 0) > 0 ||
    (metadata.groundingSupports?.length ?? 0) > 0 ||
    (metadata.webSearchQueries?.length ?? 0) > 0
  );
}

export function parseGeminiGroundingResponse(input: {
  request: GoogleSearchMatchRequest;
  rawResponse: GeminiGenerateContentResponse;
  httpStatus: number;
  searchTime: string;
  query: string;
  model: string;
  fallbackUsed: boolean;
}): {
  result: GoogleSearchLiveResult | null;
  diagnostics: GeminiGroundingDiagnostics;
} {
  if (!input.httpStatus || input.httpStatus >= 400 || input.rawResponse.error) {
    const failureReason = classifyGeminiHttpFailure({
      httpStatus: input.httpStatus,
      geminiErrorMessage: input.rawResponse.error?.message ?? null,
      geminiErrorCode: input.rawResponse.error?.code ?? null,
    });
    return {
      result: null,
      diagnostics: buildGeminiGroundingDiagnostics({
        httpStatus: input.httpStatus,
        model: input.model,
        fallbackUsed: input.fallbackUsed,
        rawResponse: input.rawResponse,
        failureReason,
      }),
    };
  }

  const candidates = input.rawResponse.candidates ?? [];
  if (candidates.length === 0) {
    return {
      result: null,
      diagnostics: buildGeminiGroundingDiagnostics({
        httpStatus: input.httpStatus,
        model: input.model,
        fallbackUsed: input.fallbackUsed,
        rawResponse: input.rawResponse,
        failureReason: "empty_candidates",
      }),
    };
  }

  const safetyBlockReason = readSafetyBlockReason(input.rawResponse);
  if (safetyBlockReason) {
    return {
      result: null,
      diagnostics: buildGeminiGroundingDiagnostics({
        httpStatus: input.httpStatus,
        model: input.model,
        fallbackUsed: input.fallbackUsed,
        rawResponse: input.rawResponse,
        failureReason: "safety_blocked",
      }),
    };
  }

  const text = extractGeminiCandidateText(input.rawResponse);
  const metadata = candidates[0]?.groundingMetadata;
  const hasMetadata = hasUsableGroundingMetadata(metadata);

  if (!text && !hasMetadata) {
    return {
      result: null,
      diagnostics: buildGeminiGroundingDiagnostics({
        httpStatus: input.httpStatus,
        model: input.model,
        fallbackUsed: input.fallbackUsed,
        rawResponse: input.rawResponse,
        hasResponseText: false,
        hasGroundingMetadata: false,
        failureReason: "empty_text",
      }),
    };
  }

  let structured = EMPTY_STRUCTURED;
  let parseFailureReason: string | null = null;

  if (text) {
    try {
      structured = parseGeminiStructuredJson(unwrapJsonTextFromGemini(text));
    } catch (error) {
      parseFailureReason =
        error instanceof Error ? error.message : "response_parse_failed";
      if (!hasMetadata) {
        return {
          result: null,
          diagnostics: buildGeminiGroundingDiagnostics({
            httpStatus: input.httpStatus,
            model: input.model,
            fallbackUsed: input.fallbackUsed,
            rawResponse: input.rawResponse,
            hasResponseText: true,
            hasGroundingMetadata: false,
            parseFailureReason,
            failureReason: "response_parse_failed",
          }),
        };
      }
    }
  } else if (hasMetadata) {
    parseFailureReason = "metadata_only_no_text";
  }

  const mapped = mapGeminiStructuredToHybridPayload(
    input.request,
    structured,
    metadata,
    input.searchTime,
    input.query,
    {
      model: input.model,
      captureSource: "live",
      normalizedAnswer: text,
      groundingMetadata: metadata ?? null,
      httpStatus: input.httpStatus,
      groundingFallbackUsed: input.fallbackUsed,
    }
  );

  if (mapped.citations.length === 0 && !text) {
    return {
      result: null,
      diagnostics: buildGeminiGroundingDiagnostics({
        httpStatus: input.httpStatus,
        model: input.model,
        fallbackUsed: input.fallbackUsed,
        rawResponse: input.rawResponse,
        hasResponseText: false,
        hasGroundingMetadata: hasMetadata,
        parseFailureReason,
        failureReason: hasMetadata ? "response_parse_failed" : "missing_grounding_metadata",
      }),
    };
  }

  return {
    result: mapped,
    diagnostics: buildGeminiGroundingDiagnostics({
      httpStatus: input.httpStatus,
      model: input.model,
      fallbackUsed: input.fallbackUsed,
      rawResponse: input.rawResponse,
      hasResponseText: Boolean(text),
      hasGroundingMetadata: hasMetadata,
      parseFailureReason,
      failureReason: null,
    }),
  };
}
