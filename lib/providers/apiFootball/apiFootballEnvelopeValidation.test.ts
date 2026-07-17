import {
  classifyConnectivityOutcome,
  classifyDataOutcome,
  parseApiFootballEnvelope,
} from "@/lib/providers/apiFootball/apiFootballEnvelopeValidation";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const validEnvelope = {
  get: "timezone",
  parameters: [],
  errors: [],
  results: 425,
  paging: { current: 1, total: 1 },
  response: [{ zone: "Africa/Abidjan", utc: "+00:00" }],
};

const emptySuccessEnvelope = {
  get: "fixtures",
  parameters: { team: "42", season: "2099" },
  errors: [],
  results: 0,
  paging: { current: 1, total: 1 },
  response: [],
};

const providerErrorEnvelope = {
  get: "timezone",
  parameters: [],
  errors: { access: "Your account is suspended." },
  results: 0,
  paging: { current: 1, total: 1 },
  response: [],
};

const parsedValid = parseApiFootballEnvelope(validEnvelope);
assert(parsedValid.envelopeValid, "valid envelope should parse");
assert(!parsedValid.hasBlockingErrors, "empty errors should not block");
assert(
  classifyConnectivityOutcome(200, parsedValid) === "PASS",
  "valid timezone envelope should pass connectivity"
);

const parsedEmpty = parseApiFootballEnvelope(emptySuccessEnvelope);
assert(
  classifyDataOutcome(200, parsedEmpty, false) === "NO_DATA",
  "empty successful fixture query should be NO_DATA"
);

const parsedError = parseApiFootballEnvelope(providerErrorEnvelope);
assert(parsedError.hasBlockingErrors, "provider errors should block");
assert(
  classifyConnectivityOutcome(200, parsedError) === "FAIL",
  "provider errors should fail connectivity even with HTTP 200"
);

console.log("API-Football envelope validation tests passed.");
