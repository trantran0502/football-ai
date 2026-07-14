import { getMoneylineStrength } from "@/lib/knowledge/rules/moneylineStrength";
import {
  pickPrimaryHandicap,
  pickPrimaryMoneyline,
  pickPrimaryTotalGoals,
} from "@/lib/rules/marketPickers";
import type {
  ExplainConflict,
  MarketReason,
  RuleExplainStatus,
  RuleReason,
} from "@/lib/explain/types";
import type {
  AnalysisCandidate,
  AnalysisReport,
  CrossMarketRuleResult,
} from "@/lib/analysis/types";
import type { MarketSelection } from "@/types/match";

const MONEYLINE_STRENGTH_LABELS: Record<string, string> = {
  SUPER_HEAVY_FAVORITE: "主隊為超級熱門",
  HEAVY_FAVORITE: "主隊為大熱門",
  FAVORITE: "主隊為熱門",
  SLIGHT_FAVORITE: "主隊為輕微熱門",
  BALANCED: "勝負均衡，無明顯熱門",
  UNDERDOG: "主隊為冷門",
  HEAVY_UNDERDOG: "主隊為大冷門",
};

function findBtts(markets: MarketSelection[]): MarketSelection[] {
  return markets.filter(
    (item) =>
      item.marketType === "btts" &&
      item.period === "full" &&
      /雙方|双方|BTTS|btts/i.test(item.title)
  );
}

function pickPrimaryBtts(markets: MarketSelection[]): MarketSelection[] {
  const groups = new Map<string, MarketSelection[]>();
  for (const item of findBtts(markets)) {
    const bucket = groups.get(item.title) ?? [];
    bucket.push(item);
    groups.set(item.title, bucket);
  }
  const entries = [...groups.entries()];
  const preferred = entries.find(([title]) => /雙方|双方/.test(title));
  return preferred?.[1] ?? entries[0]?.[1] ?? [];
}

function formatHandicapLine(selection: MarketSelection | undefined): string {
  if (!selection) {
    return "未知";
  }
  const raw = selection.rawLine ?? String(selection.line ?? "");
  if (raw === "0" || raw === "0-50" || raw === "0+50") {
    return "平手";
  }
  if ((selection.line ?? 0) > 0) {
    return `主讓 ${selection.line}`;
  }
  if ((selection.line ?? 0) < 0) {
    return `客讓 ${Math.abs(selection.line ?? 0)}`;
  }
  return raw || "平手";
}

function describeTotalGoalsLevel(line: number): string {
  if (line <= 2) {
    return "偏低進球";
  }
  if (line <= 2.5) {
    return "中等進球";
  }
  if (line <= 3) {
    return "中高進球";
  }
  return "高進球";
}

export function buildMoneylineReason(
  markets: MarketSelection[]
): MarketReason | null {
  const moneyline = pickPrimaryMoneyline(markets);
  const home = moneyline.find((item) => item.side === "home");
  const draw = moneyline.find((item) => item.side === "draw");
  const away = moneyline.find((item) => item.side === "away");

  if (!home && !draw && !away) {
    return null;
  }

  const entries = [
    { side: "home" as const, label: "主隊", odds: home?.odds },
    { side: "draw" as const, label: "和局", odds: draw?.odds },
    { side: "away" as const, label: "客隊", odds: away?.odds },
  ].filter((item) => item.odds !== undefined);

  if (entries.length === 0) {
    return null;
  }

  const favorite = entries.reduce((best, item) =>
    (item.odds ?? Infinity) < (best.odds ?? Infinity) ? item : best
  );

  const reasons: string[] = [];
  if (favorite.side === "home" && home) {
    const strength = getMoneylineStrength(home.odds);
    reasons.push(MONEYLINE_STRENGTH_LABELS[strength] ?? "主隊為熱門");
    reasons.push(`主勝賠率 ${home.odds} 為三項中最低。`);
  } else if (favorite.side === "away") {
    reasons.push("客隊為熱門。");
    reasons.push(`客勝賠率 ${favorite.odds} 為三項中最低。`);
  } else {
    reasons.push("和局為熱門選項。");
    reasons.push(`和局賠率 ${favorite.odds} 為三項中最低。`);
  }

  return {
    marketType: "moneyline",
    label: "Moneyline",
    reasons,
    evidence: {
      homeOdds: home?.odds ?? null,
      drawOdds: draw?.odds ?? null,
      awayOdds: away?.odds ?? null,
      favorite: favorite.side,
    },
  };
}

export function buildHandicapReason(
  markets: MarketSelection[]
): MarketReason | null {
  const handicap = pickPrimaryHandicap(markets);
  const home = handicap.find((item) => item.side === "home");
  const away = handicap.find((item) => item.side === "away");

  if (!home && !away) {
    return null;
  }

  const reasons: string[] = [];
  const lineText = formatHandicapLine(home ?? away);
  reasons.push(`亞洲盤口為 ${lineText}。`);

  if (home && away) {
    if (home.odds < away.odds) {
      reasons.push("亞洲盤支持主隊（主隊賠率較低）。");
    } else if (away.odds < home.odds) {
      reasons.push("亞洲盤支持客隊（客隊賠率較低）。");
    } else {
      reasons.push("亞洲盤兩側賠率接近，支持度均衡。");
    }
  }

  return {
    marketType: "handicap",
    label: "Handicap",
    reasons,
    evidence: {
      homeLine: home?.rawLine ?? home?.line ?? null,
      awayLine: away?.rawLine ?? away?.line ?? null,
      homeOdds: home?.odds ?? null,
      awayOdds: away?.odds ?? null,
    },
  };
}

export function buildTotalGoalsReason(
  markets: MarketSelection[]
): MarketReason | null {
  const totalGoals = pickPrimaryTotalGoals(markets);
  const over = totalGoals.find((item) => item.side === "over");
  const under = totalGoals.find((item) => item.side === "under");

  if (!over && !under) {
    return null;
  }

  const line = over?.line ?? under?.line ?? null;
  const reasons: string[] = [];

  if (line !== null) {
    reasons.push(`大小球盤口為 ${line} 球。`);
    reasons.push(`市場預期${describeTotalGoalsLevel(line)}。`);
  }

  if (over && under) {
    if (over.odds < under.odds) {
      reasons.push("大球賠率較低，市場傾向大球。");
    } else if (under.odds < over.odds) {
      reasons.push("小球賠率較低，市場傾向小球。");
    } else {
      reasons.push("大小球兩側賠率接近。");
    }
  }

  return {
    marketType: "totalGoals",
    label: "Total Goals",
    reasons,
    evidence: {
      line,
      overOdds: over?.odds ?? null,
      underOdds: under?.odds ?? null,
    },
  };
}

export function buildBttsReason(markets: MarketSelection[]): MarketReason | null {
  const btts = pickPrimaryBtts(markets);
  const yes = btts.find((item) => item.side === "yes");
  const no = btts.find((item) => item.side === "no");

  if (!yes && !no) {
    return null;
  }

  const reasons: string[] = [];
  if (yes && no) {
    if (yes.odds < no.odds) {
      reasons.push("市場傾向雙方進球（是 的賠率較低）。");
    } else if (no.odds < yes.odds) {
      reasons.push("市場傾向至少一方零封（否 的賠率較低）。");
    } else {
      reasons.push("雙方進球兩側賠率接近。");
    }
  }

  return {
    marketType: "btts",
    label: "BTTS",
    reasons,
    evidence: {
      yesOdds: yes?.odds ?? null,
      noOdds: no?.odds ?? null,
    },
  };
}

export function buildMarketReasons(report: AnalysisReport): MarketReason[] {
  const builders = [
    buildMoneylineReason,
    buildHandicapReason,
    buildTotalGoalsReason,
    buildBttsReason,
  ];

  return builders
    .map((builder) => builder(report.markets))
    .filter((item): item is MarketReason => item !== null);
}

function resolveRuleStatus(result: CrossMarketRuleResult): RuleExplainStatus {
  return result.status;
}

function ruleInfluencedCandidates(
  status: RuleExplainStatus,
  candidates: AnalysisCandidate[]
): boolean {
  if (candidates.length === 0) {
    return false;
  }
  return status === "PASS";
}

export function buildRuleReasons(report: AnalysisReport): RuleReason[] {
  const validation = report.crossMarketValidation;
  const rule1Status = resolveRuleStatus(validation.moneylineHandicap);
  const rule2Status = resolveRuleStatus(validation.handicapTotalGoals);
  const rule3Status = resolveRuleStatus(validation.totalGoalsBtts);

  return [
    {
      ruleId: "rule-1",
      ruleName: "MoneylineHandicapRule",
      displayName: "Moneyline × Handicap",
      status: rule1Status,
      reason: validation.moneylineHandicap.reason,
      influencedCandidates: ruleInfluencedCandidates(
        rule1Status,
        report.candidates
      ),
    },
    {
      ruleId: "rule-2",
      ruleName: "HandicapTotalGoalsRule",
      displayName: "Handicap × Total Goals",
      status: rule2Status,
      reason: validation.handicapTotalGoals.reason,
      influencedCandidates: ruleInfluencedCandidates(
        rule2Status,
        report.candidates
      ),
    },
    {
      ruleId: "rule-3",
      ruleName: "TotalGoalsBttsRule",
      displayName: "Total Goals × BTTS",
      status: rule3Status,
      reason: validation.totalGoalsBtts.reason,
      influencedCandidates: false,
    },
  ];
}

export function buildConflicts(ruleReasons: RuleReason[]): ExplainConflict[] {
  const conflictMessages: Record<string, string> = {
    "rule-1": "Moneyline 與 Handicap 不一致。",
    "rule-2": "Handicap 與 Total Goals 不一致。",
  };

  return ruleReasons
    .filter((item) => item.status === "FAIL")
    .map((item) => ({
      ruleId: item.ruleId,
      ruleName: item.ruleName,
      message: conflictMessages[item.ruleId] ?? `${item.displayName} 存在衝突。`,
      detail: item.reason,
    }));
}

export function buildConfidenceReason(
  report: AnalysisReport,
  conflicts: ExplainConflict[],
  ruleReasons: RuleReason[]
): string {
  if (report.candidates.length === 0) {
    if (conflicts.length > 0) {
      return "交叉市場存在衝突，候選產生規則尚未實作，目前不產生推薦；信心評估需待衝突排除後再建立。";
    }

    const skipped = ruleReasons.filter((item) => item.status === "SKIPPED");
    if (skipped.length > 0) {
      return "部分交叉市場 Rule 因資料不足跳過，候選產生規則尚未實作，暫無可輸出的信心依據。";
    }

    return "候選產生規則尚未實作，目前無候選推薦；交叉市場 Rule 已執行，但尚未轉換為可下注信心。";
  }

  const conflictCount = conflicts.length;
  const passCount = ruleReasons.filter((item) => item.status === "PASS").length;

  if (conflictCount > 0) {
    return `候選推薦參考了 ${passCount} 條通過的 Rule，但有 ${conflictCount} 條交叉市場衝突，整體信心受衝突拖累。`;
  }

  const highConfidence = report.candidates.filter(
    (item) => item.confidence === "high"
  ).length;

  if (highConfidence > 0) {
    return `共有 ${report.candidates.length} 個候選，其中 ${highConfidence} 個為高信心；依據來自 ${passCount} 條通過的交叉市場 Rule 與市場盤口敘事。`;
  }

  return `共有 ${report.candidates.length} 個候選；信心依據來自 ${passCount} 條通過的交叉市場 Rule 與各市場盤口。`;
}

export function buildExplainInputs(report: AnalysisReport): {
  marketReasons: MarketReason[];
  ruleReasons: RuleReason[];
  conflicts: ExplainConflict[];
  confidenceReason: string;
} {
  const marketReasons = buildMarketReasons(report);
  const ruleReasons = buildRuleReasons(report);
  const conflicts = buildConflicts(ruleReasons);
  const confidenceReason = buildConfidenceReason(
    report,
    conflicts,
    ruleReasons
  );

  return {
    marketReasons,
    ruleReasons,
    conflicts,
    confidenceReason,
  };
}
