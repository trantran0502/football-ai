export function isRecommendationDualWriteEnabled(): boolean {
  const value = process.env.RECOMMENDATION_DUAL_WRITE?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}
