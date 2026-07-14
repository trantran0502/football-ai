export const FOOTBALL_DATA_MODE =
  process.env.FOOTBALL_DATA_MODE === "free" ? "free" : "free";

export const API_FOOTBALL_BASE_URL =
  process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";

export const FOOTBALL_DATA_ORG_BASE_URL =
  process.env.FOOTBALL_DATA_ORG_BASE_URL ?? "https://api.football-data.org/v4";

/** API-Football 免費方案每日上限 */
export const FREE_DAILY_API_LIMIT = Number(
  process.env.FREE_DAILY_API_LIMIT ?? "100"
);

export const FIXTURE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const RECENT_MATCHES_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export const RECENT_MATCH_SAMPLE_SIZE = 10;

export const CLIENT_CACHE_PREFIX = "football-ai-free-data";
export const CLIENT_USAGE_KEY = "football-ai-api-usage";
export const CLIENT_FINAL_SCORE_PREFIX = "football-ai-final-score";

export function isFreeMode(): boolean {
  return FOOTBALL_DATA_MODE === "free";
}

export function getApiFootballKey(): string | undefined {
  return process.env.API_FOOTBALL_KEY;
}

export function getFootballDataOrgKey(): string | undefined {
  return process.env.FOOTBALL_DATA_ORG_KEY;
}
