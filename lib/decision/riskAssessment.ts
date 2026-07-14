import type { FeatureFusionResult } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import type { BettingIntelligenceResult } from "@/lib/betting/intelligenceTypes";
import type { RecommendationCandidate } from "@/lib/recommendation/recommendationTypes";
import type { RiskAssessmentResult } from "@/lib/decision/decisionTypes";

const RISK_WEIGHTS: Record<string, number> = {
  feature_conflict: 18,
  low_confidence: 12,
  insufficient_data: 15,
  small_sample_size: 10,
  market_divergent: 16,
  market_anomaly: 14,
  steam_move: 8,
  trap_suspected: 20,
  overheated: 12,
  rotation_uncertain: 10,
  injury_uncertain: 10,
  news_inconsistent: 8,
  market_volatility: 10,
};

function addFactor(
  factors: string[],
  objections: string[],
  warnings: string[],
  label: string,
  weightKey: string,
  score: { total: number }
): void {
  factors.push(label);
  objections.push(label);
  warnings.push(label);
  score.total += RISK_WEIGHTS[weightKey] ?? 8;
}

export function assessRisk(input: {
  fusion: FeatureFusionResult | null;
  bettingIntelligence: BettingIntelligenceResult | null;
  candidate: RecommendationCandidate | null;
}): RiskAssessmentResult {
  const factors: string[] = [];
  const objections: string[] = [];
  const warnings: string[] = [];
  const score = { total: 0 };

  if (!input.fusion) {
    addFactor(factors, objections, warnings, "資料不足", "insufficient_data", score);
  } else {
    for (const warning of input.fusion.warnings) {
      if (warning.code === "feature_conflict") {
        addFactor(factors, objections, warnings, "Feature 衝突", "feature_conflict", score);
      }
      if (warning.code === "low_confidence") {
        addFactor(factors, objections, warnings, "整體信心不足", "low_confidence", score);
      }
      if (warning.code === "insufficient_data") {
        addFactor(factors, objections, warnings, "資料不足", "insufficient_data", score);
      }
      if (warning.code === "small_sample_size") {
        addFactor(factors, objections, warnings, "樣本太少", "small_sample_size", score);
      }
    }
    if (input.fusion.ignoredFeatures.length >= 3) {
      addFactor(factors, objections, warnings, "大量 Feature 被忽略", "insufficient_data", score);
    }
  }

  const intelligence = input.bettingIntelligence;
  if (intelligence) {
    if (intelligence.summary.consensusDivergentCount > 0) {
      addFactor(factors, objections, warnings, "市場分歧", "market_divergent", score);
    }
    if (intelligence.steamMove.detected) {
      addFactor(factors, objections, warnings, "市場波動 / Steam Move", "market_volatility", score);
    }
    if (intelligence.reverseLineMovement.detected) {
      addFactor(factors, objections, warnings, "Reverse Line Movement", "market_anomaly", score);
    }

    for (const selection of intelligence.selections) {
      for (const flag of selection.consensus?.anomalyFlags ?? []) {
        if (flag === "trap_suspected") {
          addFactor(factors, objections, warnings, "盤口異常 / 可能誘盤", "trap_suspected", score);
        }
        if (flag === "overheated") {
          addFactor(factors, objections, warnings, "Market Too Hot", "overheated", score);
        }
      }
    }

    const contextSignal = intelligence.signals.find(
      (item) => item.id === "market_stability"
    );
    if (contextSignal && contextSignal.score < 40) {
      addFactor(factors, objections, warnings, "市場不穩定", "market_volatility", score);
    }
  }

  if (input.candidate) {
    for (const warning of input.candidate.warnings) {
      const lower = warning.toLowerCase();
      if (lower.includes("rotation") || lower.includes("輪換")) {
        addFactor(factors, objections, warnings, "Rotation 不確定", "rotation_uncertain", score);
      }
      if (lower.includes("injury") || lower.includes("傷")) {
        addFactor(factors, objections, warnings, "Injury 不確定", "injury_uncertain", score);
      }
      if (lower.includes("weather") || lower.includes("天氣")) {
        addFactor(factors, objections, warnings, "Weather 風險", "news_inconsistent", score);
      }
    }
  }

  return {
    riskScore: Math.min(100, score.total),
    factors,
    warnings,
    objections,
  };
}

export function assessAggregateRisk(
  fusion: FeatureFusionResult | null,
  intelligence: BettingIntelligenceResult | null
): RiskAssessmentResult {
  return assessRisk({ fusion, bettingIntelligence: intelligence, candidate: null });
}
