export const MAX_DEFERRED_FIXTURE_ATTEMPTS = 5;

export type DeferredFixtureReason =
  | "profile_deferred"
  | "profile_unavailable"
  | "grounding_unavailable"
  | "data_completeness_insufficient"
  | "quota_exhausted"
  | "time_budget_reached";

export interface DeferredFixtureAttemptState {
  deferredFixtureAttempts: Record<string, number>;
  terminalDeferredFixtureIds: number[];
}

export function createDeferredFixtureAttemptState(): DeferredFixtureAttemptState {
  return {
    deferredFixtureAttempts: {},
    terminalDeferredFixtureIds: [],
  };
}

export function isTerminalDeferredFixture(
  fixtureId: number,
  state: DeferredFixtureAttemptState
): boolean {
  return state.terminalDeferredFixtureIds.includes(fixtureId);
}

export function registerDeferredFixtureAttempt(input: {
  fixtureId: number;
  state: DeferredFixtureAttemptState;
  maxAttempts?: number;
}): {
  attempt: number;
  terminal: boolean;
  deferredReason: DeferredFixtureReason;
} {
  const key = String(input.fixtureId);
  const nextAttempt = (input.state.deferredFixtureAttempts[key] ?? 0) + 1;
  input.state.deferredFixtureAttempts[key] = nextAttempt;
  const maxAttempts = input.maxAttempts ?? MAX_DEFERRED_FIXTURE_ATTEMPTS;
  const terminal = nextAttempt >= maxAttempts;
  if (terminal && !input.state.terminalDeferredFixtureIds.includes(input.fixtureId)) {
    input.state.terminalDeferredFixtureIds.push(input.fixtureId);
  }
  return {
    attempt: nextAttempt,
    terminal,
    deferredReason: "data_completeness_insufficient",
  };
}

export function resolvePrimaryDeferredReason(reasons: string[]): DeferredFixtureReason {
  if (reasons.includes("team_profile_deferred") || reasons.includes("profileDeferred")) {
    return "profile_deferred";
  }
  if (reasons.some((reason) => reason.includes("profile"))) {
    return "profile_unavailable";
  }
  if (reasons.includes("trusted_external_source_missing")) {
    return "grounding_unavailable";
  }
  if (reasons.some((reason) => reason.includes("quota"))) {
    return "quota_exhausted";
  }
  return "data_completeness_insufficient";
}
