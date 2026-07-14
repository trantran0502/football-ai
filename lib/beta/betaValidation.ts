import { calculateProfit } from "@/lib/backtest/betEvaluator";
import { settleBet } from "@/lib/backtest/settlement";
import type { BetResult } from "@/lib/backtest/types";
import { buildMatchResult, type MatchResult } from "@/lib/database/matchSchema";
import {
  getBetaRecommendationsByMatch,
  updateBetaRecommendation,
} from "@/lib/beta/betaStorage";
import type { BetaRecommendationRecord } from "@/lib/beta/types";
import type { UpdateMatchResultInput } from "@/lib/database/matchSchema";

function isHit(result: BetResult): boolean {
  return result === "WIN" || result === "HALF_WIN";
}

function settleBetaRecord(
  record: BetaRecommendationRecord,
  matchResult: MatchResult
): BetaRecommendationRecord {
  const selection = record.marketSelections.find(
    (item) =>
      item.marketType === record.candidate.marketType &&
      item.title === record.candidate.title &&
      item.side === record.candidate.side
  );

  if (!selection) {
    return {
      ...record,
      status: "VERIFIED",
      finalScore: matchResult,
      settlement: "LOSE",
      profit: -1,
      hit: false,
      verifiedAt: new Date().toISOString(),
    };
  }

  const settlement = settleBet(selection, matchResult);
  const profit = calculateProfit(settlement, selection.odds, 1);

  return {
    ...record,
    status: "VERIFIED",
    finalScore: matchResult,
    settlement,
    profit,
    hit: isHit(settlement),
    verifiedAt: new Date().toISOString(),
  };
}

export async function settleBetaRecommendationsForMatch(
  matchRecordId: string,
  input: UpdateMatchResultInput
): Promise<BetaRecommendationRecord[]> {
  const matchResult = buildMatchResult(input);
  const pending = getBetaRecommendationsByMatch(matchRecordId).filter(
    (item) => item.status === "PENDING"
  );

  const settled: BetaRecommendationRecord[] = [];
  for (const record of pending) {
    const updated = settleBetaRecord(record, matchResult);
    await updateBetaRecommendation(updated);
    settled.push(updated);
  }

  return settled;
}
