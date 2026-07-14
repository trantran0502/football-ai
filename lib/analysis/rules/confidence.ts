export type AnalysisConfidence = "low" | "medium" | "high";

export function confidenceFromGap(gap: number): AnalysisConfidence {
  if (gap >= 0.15) {
    return "high";
  }
  if (gap >= 0.07) {
    return "medium";
  }
  return "low";
}

export function confidenceFromStrength(
  strength: AnalysisConfidence
): AnalysisConfidence {
  return strength;
}

export function mergeConfidence(
  values: Array<AnalysisConfidence | undefined>
): AnalysisConfidence {
  const present = values.filter(
    (value): value is AnalysisConfidence => value !== undefined
  );

  if (present.length === 0) {
    return "low";
  }
  if (present.every((value) => value === "high")) {
    return "high";
  }
  if (present.some((value) => value === "low")) {
    return "low";
  }
  return "medium";
}
