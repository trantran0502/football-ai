import {
  buildGeminiGenerateContentUrl,
  buildGeminiGroundingRequestBody,
  GROUNDING_COMPATIBLE_FALLBACK_MODEL,
  normalizeGeminiModelId,
  sanitizeGeminiUrlForLogs,
  shouldRetryGroundingWithFallbackModel,
} from "@/lib/providers/googleSearch/geminiGroundingConfig";
import {
  extractGeminiCandidateText,
  parseGeminiGroundingResponse,
  unwrapJsonTextFromGemini,
} from "@/lib/providers/googleSearch/geminiGroundingParser";
import {
  GoogleSearchProvider,
  resetGoogleSearchProviderForTests,
  setGeminiFetchForTests,
} from "@/lib/providers/googleSearch/googleSearchProvider";
import { resetGoogleSearchCacheForTests } from "@/lib/providers/googleSearch/googleSearchCache";
import type { GeminiGenerateContentResponse } from "@/lib/providers/googleSearch/googleSearchTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const REQUEST = {
  homeTeam: "Arsenal",
  awayTeam: "Liverpool",
  matchDate: "2026-07-20",
  leagueName: "Premier League",
};

const STRUCTURED = {
  recentFormLast10Official: [],
  recentFormLast5Home: [],
  recentFormLast5Away: [],
  includesFriendlies: false,
  includesExtraTime: false,
  includesPenalties: false,
  h2hLast5Official: [],
  standings: [],
  injuries: [
    {
      teamName: "Arsenal",
      playerName: "Player A",
      reason: "Knee",
      status: "Out",
      sourceUrl: "https://example.com/injury",
    },
  ],
  suspensions: [],
  matchStatus: {
    importance: "High",
    mustWin: true,
    alreadyQualified: false,
    alreadyEliminated: false,
    weather: "Clear",
    longTravelAway: false,
    congestedSchedule: false,
    coachNews: "Rotation expected",
    officialNews: null,
    rotation: "2 changes",
  },
};

function successResponse(text: string, metadata?: GeminiGenerateContentResponse["candidates"]): GeminiGenerateContentResponse {
  return {
    candidates: [
      {
        content: {
          parts: [{ text }],
        },
        groundingMetadata: metadata?.[0]?.groundingMetadata ?? {
          webSearchQueries: ["Arsenal vs Liverpool injuries"],
          groundingChunks: [
            {
              web: {
                uri: "https://example.com/source",
                title: "Example Source",
              },
            },
          ],
        },
      },
    ],
  };
}

function testRequestBodyDoesNotUseStructuredOutput(): void {
  const body = buildGeminiGroundingRequestBody("prompt");
  const generationConfig = body.generationConfig as Record<string, unknown>;
  assert(generationConfig.responseMimeType == null, "grounding request must not set responseMimeType");
  assert(generationConfig.responseSchema == null, "grounding request must not set responseSchema");
  assert(Array.isArray(body.tools), "grounding request must include tools");
}

function testNormalTextAndCitations(): void {
  const parsed = parseGeminiGroundingResponse({
    request: REQUEST,
    rawResponse: successResponse(JSON.stringify(STRUCTURED)),
    httpStatus: 200,
    searchTime: "2026-07-20T00:00:00.000Z",
    query: "query",
    model: "gemini-2.0-flash",
    fallbackUsed: false,
  });
  assert(parsed.result != null, "text + citations should succeed");
  assert(parsed.result!.citations.length >= 1, "citations should be preserved");
  assert(parsed.diagnostics.failureReason == null, "success should not expose failureReason");
  assert(parsed.diagnostics.hasResponseText === true, "hasResponseText should be true");
}

function testMetadataOnlyWithoutText(): void {
  const parsed = parseGeminiGroundingResponse({
    request: REQUEST,
    rawResponse: {
      candidates: [
        {
          groundingMetadata: {
            webSearchQueries: ["Arsenal injuries"],
            groundingChunks: [
              { web: { uri: "https://example.com/meta-only", title: "Meta" } },
            ],
          },
        },
      ],
    },
    httpStatus: 200,
    searchTime: "2026-07-20T00:00:00.000Z",
    query: "query",
    model: "gemini-2.0-flash",
    fallbackUsed: false,
  });
  assert(parsed.result != null, "metadata-only response should still succeed");
  assert(parsed.result!.citations.length >= 1, "metadata-only response should preserve citations");
  assert(parsed.diagnostics.parseFailureReason === "metadata_only_no_text", "metadata-only should note parse reason");
}

function testHttpAuthFailures(): void {
  for (const [status, reason] of [
    [401, "authentication_failed"],
    [403, "permission_denied"],
    [404, "model_not_found"],
    [429, "rate_limited"],
  ] as const) {
    const parsed = parseGeminiGroundingResponse({
      request: REQUEST,
      rawResponse: { error: { message: "failed", code: status } },
      httpStatus: status,
      searchTime: "2026-07-20T00:00:00.000Z",
      query: "query",
      model: "gemini-2.0-flash",
      fallbackUsed: false,
    });
    assert(parsed.result == null, `${status} should fail`);
    assert(parsed.diagnostics.failureReason === reason, `${status} should map to ${reason}`);
  }
}

function testSafetyBlocked(): void {
  const parsed = parseGeminiGroundingResponse({
    request: REQUEST,
    rawResponse: {
      candidates: [
        {
          finishReason: "SAFETY",
          content: { parts: [{ text: JSON.stringify(STRUCTURED) }] },
        },
      ],
    },
    httpStatus: 200,
    searchTime: "2026-07-20T00:00:00.000Z",
    query: "query",
    model: "gemini-2.0-flash",
    fallbackUsed: false,
  });
  assert(parsed.diagnostics.failureReason === "safety_blocked", "safety finishReason should map to safety_blocked");
}

function testEmptyCandidatesAndEmptyText(): void {
  const emptyCandidates = parseGeminiGroundingResponse({
    request: REQUEST,
    rawResponse: { candidates: [] },
    httpStatus: 200,
    searchTime: "2026-07-20T00:00:00.000Z",
    query: "query",
    model: "gemini-2.0-flash",
    fallbackUsed: false,
  });
  assert(emptyCandidates.diagnostics.failureReason === "empty_candidates", "empty candidates should be classified");

  const emptyText = parseGeminiGroundingResponse({
    request: REQUEST,
    rawResponse: { candidates: [{ content: { parts: [{ text: "" }] } }] },
    httpStatus: 200,
    searchTime: "2026-07-20T00:00:00.000Z",
    query: "query",
    model: "gemini-2.0-flash",
    fallbackUsed: false,
  });
  assert(emptyText.diagnostics.failureReason === "empty_text", "missing text should be classified");
}

function testJsonFenceParsing(): void {
  const text = unwrapJsonTextFromGemini("```json\n{\"recentFormLast10Official\":[]}\n```");
  assert(text.startsWith("{"), "json fence should unwrap to json");
  assert(extractGeminiCandidateText(successResponse("hello")) === "hello", "candidate text extraction works");
}

async function testModelFallbackOnce(): Promise<void> {
  resetGoogleSearchProviderForTests();
  resetGoogleSearchCacheForTests();
  process.env.GOOGLE_GEMINI_API_KEY = "test-key";

  let calls = 0;
  setGeminiFetchForTests(async (url) => {
    calls += 1;
    if (url.includes("bad-model")) {
      return new Response(JSON.stringify({ error: { message: "Model not found", code: 404 } }), {
        status: 404,
      });
    }
    return new Response(JSON.stringify(successResponse(JSON.stringify(STRUCTURED))), { status: 200 });
  });

  const provider = new GoogleSearchProvider({
    apiKey: "test-key",
    model: "bad-model",
    fallbackModel: GROUNDING_COMPATIBLE_FALLBACK_MODEL,
  });

  const outcome = await provider.fetchTeamContextWithDiagnostics(REQUEST);
  assert(calls === 2, "unsupported model should fallback exactly once");
  assert(outcome.diagnostics.groundingFallbackUsed === true, "fallback flag should be set");
  assert(outcome.result != null, "fallback model should succeed");

  resetGoogleSearchProviderForTests();
  delete process.env.GOOGLE_GEMINI_API_KEY;
}

function testApiKeyNotLoggedInUrlSanitizer(): void {
  const sanitized = sanitizeGeminiUrlForLogs(
    buildGeminiGenerateContentUrl("gemini-2.0-flash", "secret-key-value")
  );
  assert(!sanitized.includes("secret-key-value"), "sanitized url must not include api key");
  assert(sanitized.includes("[REDACTED]"), "sanitized url should redact key");
}

function testModelNormalization(): void {
  assert(normalizeGeminiModelId("models/gemini-2.0-flash") === "gemini-2.0-flash", "model prefix should normalize");
  assert(
    shouldRetryGroundingWithFallbackModel({
      httpStatus: 404,
      geminiErrorMessage: "Model not found",
      failureReason: "model_not_found",
      fallbackAlreadyUsed: false,
    }),
    "404 should trigger fallback"
  );
}

async function runTests(): Promise<void> {
  testRequestBodyDoesNotUseStructuredOutput();
  testNormalTextAndCitations();
  testMetadataOnlyWithoutText();
  testHttpAuthFailures();
  testSafetyBlocked();
  testEmptyCandidatesAndEmptyText();
  testJsonFenceParsing();
  await testModelFallbackOnce();
  testApiKeyNotLoggedInUrlSanitizer();
  testModelNormalization();
  console.log("geminiGrounding.test.ts passed");
}

void runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
