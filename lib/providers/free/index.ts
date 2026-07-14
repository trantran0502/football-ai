export type {
  ApiUsageInfo,
  BasicMatchStatistics,
  DataCompleteness,
  FinalScore,
  FixtureInfo,
  FootballDataMode,
  FreeDataSource,
  PremiumUnavailableData,
  PremiumUnavailableField,
  RecentMatchSummary,
  StandingRow,
  TeamDataPackage,
  TeamDataRequest,
  TeamDataResponse,
  TeamRecentForm,
  UNAVAILABLE_FREE_LABEL,
  PREMIUM_UNAVAILABLE_FIELDS,
} from "@/lib/providers/free/types";

export {
  API_FOOTBALL_BASE_URL,
  CLIENT_CACHE_PREFIX,
  CLIENT_FINAL_SCORE_PREFIX,
  CLIENT_USAGE_KEY,
  FIXTURE_CACHE_TTL_MS,
  FOOTBALL_DATA_MODE,
  FOOTBALL_DATA_ORG_BASE_URL,
  FREE_DAILY_API_LIMIT,
  RECENT_MATCH_SAMPLE_SIZE,
  RECENT_MATCHES_CACHE_TTL_MS,
  isFreeMode,
} from "@/lib/providers/free/config";

export {
  calculateTeamRecentForm,
  toRecentMatchSummary,
} from "@/lib/providers/free/recentFormCalculator";

export {
  buildFixtureCacheKey,
  getCachedTeamData,
  getStoredApiUsage,
  saveApiUsage,
  setCachedTeamData,
} from "@/lib/providers/free/providerCache";

export {
  fetchTeamDataClient,
  formatUnavailableField,
  summarizeTeamForm,
} from "@/lib/providers/free/fetchTeamDataClient";
