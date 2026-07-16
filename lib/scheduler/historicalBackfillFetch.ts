import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import {
  isPlanDateAccessError,
  parseApiFootballPlanDateRestriction,
  type ApiFootballPlanDateRange,
} from "@/lib/scheduler/historicalBackfillPlanErrors";

export type HistoricalBackfillFetchOutcome =
  | { kind: "ok"; fixtures: ApiFootballFixtureRecord[] }
  | { kind: "plan_date_restricted"; restriction: ApiFootballPlanDateRange };

export async function fetchHistoricalBackfillFixtures(input: {
  date: string;
  fetchFixturesByDate: (date: string) => Promise<ApiFootballFixtureRecord[]>;
  maxRetries: number;
  retryDelayMs: number;
}): Promise<HistoricalBackfillFetchOutcome> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < input.maxRetries; attempt += 1) {
    try {
      const fixtures = await input.fetchFixturesByDate(input.date);
      return { kind: "ok", fixtures };
    } catch (error) {
      if (isPlanDateAccessError(error)) {
        const restriction = parseApiFootballPlanDateRestriction(error);
        if (restriction) {
          return { kind: "plan_date_restricted", restriction };
        }
      }

      lastError = error;
      if (attempt < input.maxRetries - 1) {
        await sleep(input.retryDelayMs * (attempt + 1));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
