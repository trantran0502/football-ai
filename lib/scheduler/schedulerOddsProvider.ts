import { ApiFootballOddsAdapter } from "@/lib/providers/odds/apiFootballOddsAdapter";
import { MockOddsAdapter } from "@/lib/providers/odds/mockOddsAdapter";
import type { OddsProvider } from "@/lib/providers/providerTypes";
import {
  assertSchedulerOddsProviderAllowed,
  type SchedulerOddsProviderSource,
} from "@/lib/scheduler/schedulerOddsConfig";

export function createSchedulerOddsProvider(
  source: SchedulerOddsProviderSource
): OddsProvider | null {
  assertSchedulerOddsProviderAllowed(source);

  switch (source) {
    case "mock":
      return new MockOddsAdapter();
    case "api-football":
      return new ApiFootballOddsAdapter();
    default:
      return null;
  }
}
