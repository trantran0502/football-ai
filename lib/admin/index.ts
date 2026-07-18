export type {
  AdminAiSuggestions,
  AdminAnalysisStatus,
  AdminDailySummaryPayload,
  AdminDashboardDataSource,
  AdminDashboardMetadata,
  AdminDashboardResponse,
  AdminErrorCategory,
  AdminErrorLogEntry,
  AdminPerformanceMetrics,
  AdminSystemSnapshotPayload,
  AdminSystemSnapshotRecord,
  AdminSystemStatus,
} from "@/lib/admin/adminDashboardTypes";

export {
  aggregateDailySummaryFromRecords,
  buildEmptyDailySummary,
  computeRollingHitRate,
  computeRollingRoi,
} from "@/lib/admin/adminDailyAggregation";

export {
  countDailySummariesInSupabase,
  getDailySummaryFromStore,
  getSystemSnapshotFromStore,
  getSystemSnapshotRecordFromStore,
  listDailySummariesFromStore,
  resetAdminDashboardStoreForTests,
  seedDailySummaryForTests,
  seedSystemSnapshotForTests,
  upsertDailySummary,
  upsertSystemSnapshot,
} from "@/lib/admin/adminDashboardStore";

export {
  ADMIN_DASHBOARD_SNAPSHOT_MAX_AGE_MS,
  buildLiveAdminSystemSnapshot,
  isSystemSnapshotFresh,
} from "@/lib/admin/adminDashboardLiveQuery";

export {
  buildAdminDashboardResponse,
  refreshSystemSnapshotTablesCount,
  resolveAdminSystemSnapshot,
} from "@/lib/admin/adminDashboardService";

export {
  logAdminError,
  listRecentAdminErrors,
  loadRecentAdminErrorsFromSupabase,
  resetAdminErrorLogsForTests,
} from "@/lib/admin/adminErrorLog";

export {
  getCacheMetricsSnapshot,
  recordCacheHit,
  recordCacheMiss,
  resetCacheMetricsForTests,
} from "@/lib/admin/adminCacheMetrics";

export {
  getGoogleQuotaSnapshot,
  recordGoogleSearchRequest,
  resetGoogleQuotaForTests,
} from "@/lib/admin/adminGoogleQuota";

export { runAdminDailyCron } from "@/lib/admin/runAdminDailyCron";

export { verifyAdminRepairKey, getAdminRepairKey } from "@/lib/admin/adminRepairAuth";
