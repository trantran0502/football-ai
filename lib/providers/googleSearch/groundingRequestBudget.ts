export const DEFAULT_GROUNDING_REQUEST_BUDGET_PER_BATCH = 2;

export type GroundingDeferredReason =
  | "grounding_budget_exhausted"
  | "grounding_rate_limited"
  | "grounding_cooldown";

export interface GroundingRequestBudgetSnapshot {
  groundingRequestBudget: number;
  groundingRequestsUsed: number;
  groundingRequestsAvoidedByCache: number;
  groundingRequestsAvoidedByBudget: number;
  groundingRateLimitTriggered: boolean;
  groundingCooldownActive: boolean;
  groundingDeferredCount: number;
  combinedGroundingRequestCount: number;
}

const state = {
  budget: DEFAULT_GROUNDING_REQUEST_BUDGET_PER_BATCH,
  requestsUsed: 0,
  requestsAvoidedByCache: 0,
  requestsAvoidedByBudget: 0,
  rateLimitTriggered: false,
  cooldownActive: false,
  deferredCount: 0,
  combinedRequestCount: 0,
};

export function getGroundingRequestBudgetPerBatch(): number {
  const raw = process.env.GOOGLE_GROUNDING_REQUEST_BUDGET_PER_BATCH?.trim();
  if (!raw) {
    return DEFAULT_GROUNDING_REQUEST_BUDGET_PER_BATCH;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_GROUNDING_REQUEST_BUDGET_PER_BATCH;
  }
  return parsed;
}

export function beginGroundingRequestBudgetBatch(): void {
  state.budget = getGroundingRequestBudgetPerBatch();
  state.requestsUsed = 0;
  state.requestsAvoidedByCache = 0;
  state.requestsAvoidedByBudget = 0;
  state.rateLimitTriggered = false;
  state.cooldownActive = false;
  state.deferredCount = 0;
  state.combinedRequestCount = 0;
}

export function resetGroundingRequestBudgetForTests(): void {
  beginGroundingRequestBudgetBatch();
}

export function canMakeGroundingLiveRequest(): boolean {
  if (state.cooldownActive || state.rateLimitTriggered) {
    return false;
  }
  return state.requestsUsed < state.budget;
}

export function recordGroundingLiveRequestUsed(): void {
  state.requestsUsed += 1;
  state.combinedRequestCount += 1;
}

export function recordGroundingRequestAvoidedByCache(): void {
  state.requestsAvoidedByCache += 1;
}

export function recordGroundingRequestAvoidedByBudget(): void {
  state.requestsAvoidedByBudget += 1;
  state.deferredCount += 1;
}

export function recordGroundingDeferredFixture(): void {
  state.deferredCount += 1;
}

export function triggerGroundingRateLimitCooldown(): void {
  state.rateLimitTriggered = true;
  state.cooldownActive = true;
}

export function isGroundingRateLimitCooldownActive(): boolean {
  return state.cooldownActive;
}

export function getGroundingRequestBudgetSnapshot(): GroundingRequestBudgetSnapshot {
  return {
    groundingRequestBudget: state.budget,
    groundingRequestsUsed: state.requestsUsed,
    groundingRequestsAvoidedByCache: state.requestsAvoidedByCache,
    groundingRequestsAvoidedByBudget: state.requestsAvoidedByBudget,
    groundingRateLimitTriggered: state.rateLimitTriggered,
    groundingCooldownActive: state.cooldownActive,
    groundingDeferredCount: state.deferredCount,
    combinedGroundingRequestCount: state.combinedRequestCount,
  };
}

export function isGroundingDeferredReason(
  reason: string | null | undefined
): reason is GroundingDeferredReason {
  return (
    reason === "grounding_budget_exhausted" ||
    reason === "grounding_rate_limited" ||
    reason === "grounding_cooldown"
  );
}
