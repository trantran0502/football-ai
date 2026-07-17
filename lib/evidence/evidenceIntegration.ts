import type {
  EvidenceBreakdownItem,
  EvidenceCategory,
  EvidenceImpactDirection,
  EvidenceIntegrationResult,
  EvidenceItem,
  EvidenceReport,
} from "@/lib/evidence/evidenceTypes";
import { clampConfidence, clampScore } from "@/lib/analysis/featureScore/oddsConversion";

export const EVIDENCE_NEUTRAL_THRESHOLD = 3;

const CATEGORY_LABELS: Record<EvidenceCategory, string> = {
  marketEngine: "Market Engine",
  h2h: "H2H",
  recent10Matches: "Recent 10 Matches",
  homeForm: "Home Form",
  awayForm: "Away Form",
  teamProfile: "Team Profile",
  teamEngine: "Team Engine",
  xg: "xG",
  xga: "xGA",
  leagueStrength: "League Strength",
  squadAvailability: "Squad Availability",
  matchContext: "Match Context",
};

const CATEGORY_SUPPORT_LABELS: Partial<Record<EvidenceCategory, string>> = {
  recent10Matches: "主隊近10場狀態佳",
  h2h: "H2H 優勢",
  homeForm: "主隊主場狀態佳",
  awayForm: "客隊客場偏弱",
  teamProfile: "Team Profile 資料完整",
  teamEngine: "Team Engine 動能偏向主隊",
  xg: "xG 偏向主隊",
  xga: "xGA 防守表現較佳",
  leagueStrength: "League Strength 支持主隊",
  squadAvailability: "Squad Availability 支持主隊",
  matchContext: "Match Context 支持主隊",
  marketEngine: "Market Engine 支持方向",
};

const CATEGORY_OPPOSE_LABELS: Partial<Record<EvidenceCategory, string>> = {
  recent10Matches: "近10場狀態偏弱",
  h2h: "H2H 劣勢",
  homeForm: "主隊主場狀態偏弱",
  awayForm: "客隊客場狀態佳",
  teamProfile: "Team Profile 資料不足",
  teamEngine: "Team Engine 動能偏向客隊",
  xg: "客隊 xG 偏高",
  xga: "xGA 防守風險偏高",
  leagueStrength: "League Strength 不支持",
  squadAvailability: "傷兵/陣容可信度不足",
  matchContext: "Match Context 不利",
  marketEngine: "Market Engine 反對方向",
};

export function listAllEvidenceItems(report: EvidenceReport): EvidenceItem[] {
  const byId = new Map<string, EvidenceItem>();
  for (const item of [...report.positiveEvidence, ...report.negativeEvidence]) {
    byId.set(item.evidenceId, item);
  }
  return [...byId.values()];
}

function resolveImpact(adjustedScore: number): EvidenceImpactDirection {
  if (adjustedScore > EVIDENCE_NEUTRAL_THRESHOLD) {
    return "support";
  }
  if (adjustedScore < -EVIDENCE_NEUTRAL_THRESHOLD) {
    return "oppose";
  }
  return "neutral";
}

function computeEqualWeightAverageScore(items: EvidenceItem[]): number {
  if (items.length === 0) {
    return 0;
  }
  const total = items.reduce((sum, item) => sum + item.score, 0);
  return clampScore(total / items.length);
}

function computeEqualWeightAverageConfidence(items: EvidenceItem[]): number {
  if (items.length === 0) {
    return 0;
  }
  const total = items.reduce((sum, item) => sum + item.confidence, 0);
  return clampConfidence(total / items.length);
}

function adjustScoreForDirection(score: number, direction: number): number {
  if (direction === 0) {
    return clampScore(score * 0.25);
  }
  return clampScore(score * direction);
}

export function buildEvidenceBreakdown(
  report: EvidenceReport,
  direction = 1
): EvidenceBreakdownItem[] {
  return listAllEvidenceItems(report).map((item) => {
    const adjustedScore = adjustScoreForDirection(item.score, direction);
    const impact = resolveImpact(adjustedScore);

    return {
      evidenceId: item.evidenceId,
      category: item.category,
      rawScore: item.score,
      adjustedScore,
      confidence: item.confidence,
      impact,
      source: item.source,
      summary: item.summary,
    };
  });
}

export function buildEvidenceSummaryLines(
  breakdown: EvidenceBreakdownItem[]
): string[] {
  const lines: string[] = [];

  for (const item of breakdown) {
    if (item.impact === "support") {
      lines.push(
        `+ ${CATEGORY_SUPPORT_LABELS[item.category] ?? `${CATEGORY_LABELS[item.category]} 支持`}`
      );
      continue;
    }
    if (item.impact === "oppose") {
      lines.push(
        `- ${CATEGORY_OPPOSE_LABELS[item.category] ?? `${CATEGORY_LABELS[item.category]} 反對`}`
      );
    }
  }

  return lines;
}

export function integrateEvidenceForSelection(
  report: EvidenceReport | null | undefined,
  direction: number
): EvidenceIntegrationResult {
  if (!report) {
    return {
      evidenceScore: 0,
      evidenceConfidence: 0,
      evidenceSummary: [],
      evidenceBreakdown: [],
    };
  }

  const items = listAllEvidenceItems(report);
  const breakdown = buildEvidenceBreakdown(report, direction);
  const contributing = breakdown.filter((item) => item.impact !== "neutral");
  const evidenceScore =
    contributing.length > 0
      ? clampScore(
          contributing.reduce((sum, item) => sum + item.adjustedScore, 0) /
            contributing.length
        )
      : 0;

  return {
    evidenceScore,
    evidenceConfidence: computeEqualWeightAverageConfidence(items),
    evidenceSummary: buildEvidenceSummaryLines(breakdown),
    evidenceBreakdown: breakdown,
  };
}

export function integrateEvidenceGlobally(
  report: EvidenceReport | null | undefined
): EvidenceIntegrationResult {
  if (!report) {
    return {
      evidenceScore: 0,
      evidenceConfidence: 0,
      evidenceSummary: [],
      evidenceBreakdown: [],
    };
  }

  const items = listAllEvidenceItems(report);
  const breakdown = buildEvidenceBreakdown(report, 1);

  return {
    evidenceScore: computeEqualWeightAverageScore(items),
    evidenceConfidence: computeEqualWeightAverageConfidence(items),
    evidenceSummary: buildEvidenceSummaryLines(breakdown),
    evidenceBreakdown: breakdown,
  };
}

export function buildEvidenceImpact(
  report: EvidenceReport | null | undefined,
  direction = 1
): { supporting: string[]; opposing: string[] } {
  const integration = integrateEvidenceForSelection(report, direction);
  const supporting = integration.evidenceSummary.filter((line) =>
    line.startsWith("+")
  );
  const opposing = integration.evidenceSummary.filter((line) =>
    line.startsWith("-")
  );

  return { supporting, opposing };
}
