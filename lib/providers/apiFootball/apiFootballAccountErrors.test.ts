import {
  ApiFootballAccountSuspendedError,
  isApiFootballAccountSuspendedError,
  isApiFootballAccountSuspendedErrors,
  isApiFootballAccountSuspendedMessage,
  throwIfApiFootballAccountSuspended,
} from "@/lib/providers/apiFootball/apiFootballAccountErrors";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  isApiFootballAccountSuspendedMessage(
    "Your account is suspended, check on https://dashboard.api-football.com."
  ),
  "should detect suspended message"
);

assert(
  isApiFootballAccountSuspendedErrors({
    access: "Your account is suspended, check on https://dashboard.api-football.com.",
  }),
  "should detect suspended errors object"
);

assert(
  !isApiFootballAccountSuspendedErrors({ rateLimit: "Too many requests" }),
  "should not treat rate limit as suspended"
);

try {
  throwIfApiFootballAccountSuspended({
    access: "Your account is suspended.",
  });
  assert(false, "should have thrown");
} catch (error) {
  assert(error instanceof ApiFootballAccountSuspendedError, "wrong error type");
  assert(isApiFootballAccountSuspendedError(error), "detector should match");
}

console.log("apiFootballAccountErrors.test.ts: ok");
