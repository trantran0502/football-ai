import type { EvidenceCategory } from "@/lib/evidence/evidenceTypes";

export interface EvidenceWeightSuggestion {
  category: EvidenceCategory;
  label: string;
  usageCount: number;
  hitRate: number;
  roi: number;
  averageConfidence: number;
  averageImpactScore: number;
  currentWeight: number;
  suggestedWeight: number;
  weightChange: number;
  sampleSize: number;
  reliability: number;
  reason: string;
  disableCandidate: boolean;
  disableReason: string | null;
}

export interface EvidenceWeightOptimizerReport {
  generatedAt: string;
  optimizerMode: "analysis";
  weightsApplied: false;
  totalSampleSize: number;
  suggestions: EvidenceWeightSuggestion[];
  recommendedDisable: EvidenceWeightSuggestion[];
  normalizedWeightSum: number;
}

export const EVIDENCE_MIN_SAMPLE_FOR_INCREASE = 30;
export const EVIDENCE_MAX_WEIGHT_CHANGE = 0.1;
