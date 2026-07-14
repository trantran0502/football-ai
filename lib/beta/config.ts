export const CURRENT_MODEL_VERSION = "beta-0.1";

export const BETA_STORAGE_KEY = "football-ai-beta-recommendations";
export const BETA_ROLLING_REPORT_KEY = "football-ai-beta-rolling-reports";

export function isBetaRecommendationModeEnabled(): boolean {
  return (
    process.env.BETA_RECOMMENDATION_MODE === "true" ||
    process.env.NEXT_PUBLIC_BETA_RECOMMENDATION_MODE === "true"
  );
}

export const BETA_EMPTY_MESSAGE = "目前沒有足夠依據產生推薦";

export const BETA_DISCLAIMER =
  "Beta 推薦，尚未經足夠樣本驗證";

export const ROLLING_WINDOW_SIZE = 20;
