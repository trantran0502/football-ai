import type { MatchContextProviderRequest } from "@/lib/analysis/featureScore/providers/matchContextProvider";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";

/**
 * Future hook: resolve match context from match_records when context columns exist.
 * Currently returns null because match_records do not store match context data yet.
 */
export function resolveMatchContextFromMatchRecords(_input: {
  request: MatchContextProviderRequest;
  records: HistoricalMatchRecord[];
  referenceDate?: string;
}): null {
  return null;
}
