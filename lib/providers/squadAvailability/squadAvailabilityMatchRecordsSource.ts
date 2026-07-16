import type { SquadAvailabilityProviderRequest } from "@/lib/analysis/featureScore/providers/squadAvailabilityProvider";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";

/**
 * Future hook: resolve squad availability from match_records when injury columns exist.
 * Currently returns null because match_records do not store injury/suspension data yet.
 */
export function resolveSquadAvailabilityFromMatchRecords(_input: {
  request: SquadAvailabilityProviderRequest;
  records: HistoricalMatchRecord[];
  referenceDate?: string;
}): null {
  return null;
}
