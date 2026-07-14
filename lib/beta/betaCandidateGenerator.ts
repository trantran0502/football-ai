import { buildMarketId } from "@/lib/analysis/featureBuilder";
import type { CrossMarketValidation } from "@/lib/analysis/types";
import {
  BETA_EMPTY_MESSAGE,
  CURRENT_MODEL_VERSION,
} from "@/lib/beta/config";
import {
  buildMarketEvidenceContext,
  getBttsLeanSide,
  getFavoriteSide,
  getHandicapSupportedSide,
  getTotalLeanSide,
} from "@/lib/beta/evidenceBuilder";
import type {
  BetaCandidate,
  BetaConfidenceLevel,
  BetaGenerationResult,
} from "@/lib/beta/types";
import {
  pickPrimaryBtts,
  pickPrimaryHandicap,
  pickPrimaryMoneyline,
  pickPrimaryTotalGoals,
} from "@/lib/rules/marketPickers";
import type { MarketSelection, MarketSide } from "@/types/match";

const SINGLE_MARKET_NOTICE = "僅依單一市場判斷，缺少交叉驗證。";

interface CandidateProposal {
  selection: MarketSelection;
  supporting: string[];
  opposing: string[];
  rulesUsed: string[];
  reasons: string[];
}

function resolveConfidence(
  availableMarkets: number,
  opposingCount: number,
  rulesCount: number
): BetaConfidenceLevel {
  if (availableMarkets <= 1) {
    return "low";
  }
  if (availableMarkets === 2) {
    if (rulesCount >= 1 && opposingCount === 0) {
      return "medium";
    }
    return "low";
  }
  if (rulesCount >= 1 && opposingCount === 0) {
    return "high";
  }
  if (rulesCount >= 1) {
    return "medium";
  }
  return "low";
}

function findSelection(
  markets: MarketSelection[],
  marketType: MarketSelection["marketType"],
  side: MarketSide
): MarketSelection | null {
  const pickers: Record<string, () => MarketSelection[]> = {
    moneyline: () => pickPrimaryMoneyline(markets),
    handicap: () => pickPrimaryHandicap(markets),
    totalGoals: () => pickPrimaryTotalGoals(markets),
    btts: () => pickPrimaryBtts(markets),
  };

  const group = pickers[marketType]?.() ?? markets.filter((m) => m.marketType === marketType);
  return group.find((item) => item.side === side) ?? null;
}

function buildProposals(
  markets: MarketSelection[],
  context: ReturnType<typeof buildMarketEvidenceContext>
): CandidateProposal[] {
  const proposals: CandidateProposal[] = [];
  const favorite = getFavoriteSide(markets);
  const handicapSide = getHandicapSupportedSide(markets);
  const totalSide = getTotalLeanSide(markets);
  const bttsSide = getBttsLeanSide(markets);

  if (favorite) {
    const selection = findSelection(markets, "moneyline", favorite);
    if (selection) {
      proposals.push({
        selection,
        supporting: [...context.supporting, `獨贏市場偏向 ${favorite}`],
        opposing: [...context.opposing],
        rulesUsed: context.rulesUsed,
        reasons: ["獨贏盤口提供方向依據。"],
      });
    }
  }

  if (handicapSide) {
    const selection = findSelection(markets, "handicap", handicapSide);
    if (selection) {
      proposals.push({
        selection,
        supporting: [...context.supporting, `讓分市場支持 ${handicapSide}`],
        opposing: [...context.opposing],
        rulesUsed: context.rulesUsed,
        reasons: ["讓分盤提供方向依據。"],
      });
    }
  }

  if (totalSide) {
    const selection = findSelection(markets, "totalGoals", totalSide);
    if (selection) {
      proposals.push({
        selection,
        supporting: [...context.supporting, `大小球傾向 ${totalSide}`],
        opposing: [...context.opposing],
        rulesUsed: context.rulesUsed,
        reasons: ["大小球盤口提供進球傾向。"],
      });
    }
  }

  if (bttsSide) {
    const selection = findSelection(markets, "btts", bttsSide);
    if (selection) {
      proposals.push({
        selection,
        supporting: [...context.supporting, `BTTS 傾向 ${bttsSide}`],
        opposing: [...context.opposing],
        rulesUsed: context.rulesUsed,
        reasons: ["BTTS 盤口提供進球傾向。"],
      });
    }
  }

  return proposals;
}

function toBetaCandidate(
  proposal: CandidateProposal,
  availableMarkets: number
): BetaCandidate {
  const uniqueSupporting = [...new Set(proposal.supporting)];
  const uniqueOpposing = [...new Set(proposal.opposing)];
  const reasons = [...proposal.reasons];

  if (availableMarkets <= 1) {
    reasons.push(SINGLE_MARKET_NOTICE);
  }

  return {
    marketType: proposal.selection.marketType,
    title: proposal.selection.title,
    side: proposal.selection.side,
    rawLine: proposal.selection.rawLine,
    odds: proposal.selection.odds,
    reasons,
    supportingEvidence: uniqueSupporting,
    opposingEvidence: uniqueOpposing,
    rulesUsed: [...new Set(proposal.rulesUsed)],
    confidenceLevel: resolveConfidence(
      availableMarkets,
      uniqueOpposing.length,
      proposal.rulesUsed.length
    ),
    modelVersion: CURRENT_MODEL_VERSION,
    createdAt: new Date().toISOString(),
  };
}

function passesRecommendationGate(
  candidate: BetaCandidate,
  availableMarkets: number
): boolean {
  if (
    candidate.opposingEvidence.length > 0 &&
    candidate.supportingEvidence.length <= candidate.opposingEvidence.length
  ) {
    return false;
  }

  if (availableMarkets <= 1) {
    return candidate.supportingEvidence.length >= 1;
  }

  return (
    candidate.rulesUsed.length >= 1 &&
    candidate.supportingEvidence.length > candidate.opposingEvidence.length
  );
}

export function generateBetaCandidates(
  markets: MarketSelection[],
  validation: CrossMarketValidation
): BetaGenerationResult {
  const context = buildMarketEvidenceContext(markets, validation);

  if (context.hasMajorConflict) {
    return { candidates: [], message: BETA_EMPTY_MESSAGE };
  }

  const proposals = buildProposals(markets, context);
  const candidates = proposals
    .map((proposal) => toBetaCandidate(proposal, context.availableMarkets))
    .filter((candidate) =>
      passesRecommendationGate(candidate, context.availableMarkets)
    )
    .sort((left, right) => {
      const leftScore =
        left.supportingEvidence.length - left.opposingEvidence.length;
      const rightScore =
        right.supportingEvidence.length - right.opposingEvidence.length;
      return rightScore - leftScore;
    });

  if (candidates.length === 0) {
    return { candidates: [], message: BETA_EMPTY_MESSAGE };
  }

  return {
    candidates: [candidates[0]],
    message: "",
  };
}

export function betaCandidateToAnalysisCandidate(
  candidate: BetaCandidate,
  markets: MarketSelection[]
): import("@/lib/analysis/types").AnalysisCandidate {
  const selection = markets.find(
    (item) =>
      item.marketType === candidate.marketType &&
      item.title === candidate.title &&
      item.side === candidate.side
  );

  const period = selection?.period ?? "full";
  const marketId = selection
    ? buildMarketId(selection)
    : `${candidate.marketType}::${candidate.title}::${period}`;

  return {
    marketId,
    marketType: candidate.marketType,
    title: candidate.title,
    period,
    side: candidate.side,
    reason: candidate.reasons,
    confidence: candidate.confidenceLevel,
  };
}
