import {
  PRE_MATCH_KICKOFF_BUFFER_MS,
  parseKickoffTimeUtc,
} from "@/lib/scheduler/preMatchFixtureEligibility";
import type { GroundingDeferredReason } from "@/lib/providers/googleSearch/groundingRequestBudget";

export function shouldSkipGroundingDeferredRetry(input: {
  kickoffTime: string | null | undefined;
  now: Date;
  bufferMs?: number;
}): boolean {
  const kickoffMs = parseKickoffTimeUtc(input.kickoffTime);
  if (kickoffMs === null) {
    return true;
  }

  const nowMs = input.now.getTime();
  const bufferMs = input.bufferMs ?? PRE_MATCH_KICKOFF_BUFFER_MS;
  return kickoffMs <= nowMs || kickoffMs <= nowMs + bufferMs;
}

export function resolveGroundingSkippedReason(input: {
  budgetExhausted?: boolean;
  rateLimited?: boolean;
  cooldownActive?: boolean;
}): GroundingDeferredReason {
  if (input.rateLimited) {
    return "grounding_rate_limited";
  }
  if (input.cooldownActive) {
    return "grounding_cooldown";
  }
  return "grounding_budget_exhausted";
}
