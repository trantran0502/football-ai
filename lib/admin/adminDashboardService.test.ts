import type { AdminSystemSnapshotPayload } from "@/lib/admin/adminDashboardTypes";
import {
  buildAdminDashboardResponse,
  resolveAdminSystemSnapshot,
} from "@/lib/admin/adminDashboardService";
import {
  ADMIN_DASHBOARD_SNAPSHOT_MAX_AGE_MS,
  isSystemSnapshotFresh,
} from "@/lib/admin/adminDashboardLiveQuery";
import {
  resetAdminDashboardStoreForTests,
  seedSystemSnapshotForTests,
} from "@/lib/admin/adminDashboardStore";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function buildSnapshotPayload(
  overrides: Partial<AdminSystemSnapshotPayload["analysis"]> = {}
): AdminSystemSnapshotPayload {
  return {
    system: {
      apiFootball: {
        usedToday: 5,
        remainingToday: 95,
        minuteUsed: 1,
        minuteLimit: 10,
      },
      googleGemini: {
        searchesToday: 2,
        remainingToday: 98,
        dailyLimit: 100,
      },
      supabase: {
        configured: true,
        connected: true,
        tables: {
          match_records: 12,
          beta_recommendations: 0,
          beta_rolling_reports: 0,
          admin_daily_summaries: 1,
        },
      },
      cache: {
        hitRate: 0.5,
        hits: 1,
        misses: 1,
      },
      lastSyncAt: "2026-07-19T00:00:00.000Z",
    },
    analysis: {
      pendingCount: 4,
      verifiedCount: 8,
      anomalyCount: 1,
      ...overrides,
    },
  };
}

async function testAlwaysUsesLiveQuery(): Promise<void> {
  resetAdminDashboardStoreForTests();
  const now = new Date("2026-07-19T12:00:00.000Z");
  const snapshotTime = "2026-07-19T11:30:00.000Z";

  seedSystemSnapshotForTests(buildSnapshotPayload(), snapshotTime);

  const resolved = await resolveAdminSystemSnapshot(now, {
    buildLiveSnapshot: async () =>
      buildSnapshotPayload({ pendingCount: 11, verifiedCount: 110, anomalyCount: 0 }),
  });
  assert(resolved.metadata.dataSource === "live", "admin dashboard should always use live source");
  assert(resolved.snapshot.analysis.pendingCount === 11, "live counts should override stale snapshot");
  assert(resolved.metadata.isStale === false, "live snapshot should not be marked stale");
}

async function testUsesLiveQueryWhenSnapshotExpired(): Promise<void> {
  resetAdminDashboardStoreForTests();
  const now = new Date("2026-07-19T12:00:00.000Z");
  const expiredSnapshotTime = "2026-07-19T09:00:00.000Z";

  seedSystemSnapshotForTests(
    buildSnapshotPayload({ pendingCount: 99, verifiedCount: 1, anomalyCount: 0 }),
    expiredSnapshotTime
  );

  const resolved = await resolveAdminSystemSnapshot(now, {
    buildLiveSnapshot: async () =>
      buildSnapshotPayload({ pendingCount: 2, verifiedCount: 10, anomalyCount: 0 }),
  });

  assert(resolved.metadata.dataSource === "live", "expired snapshot should fall back to live query");
  assert(resolved.metadata.snapshotTime === "2026-07-19T00:00:00.000Z", "live query should expose sync time");
  assert(resolved.snapshot.analysis.pendingCount === 2, "expired snapshot should use live counts");
}

async function testUsesLiveQueryWhenSnapshotMissing(): Promise<void> {
  resetAdminDashboardStoreForTests();
  const now = new Date("2026-07-19T12:00:00.000Z");

  const resolved = await resolveAdminSystemSnapshot(now, {
    buildLiveSnapshot: async () =>
      buildSnapshotPayload({ pendingCount: 7, verifiedCount: 3, anomalyCount: 2 }),
  });

  assert(resolved.metadata.dataSource === "live", "missing snapshot should fall back to live query");
  assert(resolved.snapshot.analysis.pendingCount === 7, "missing snapshot should use live counts");
}

async function testBuildAdminDashboardResponseIncludesMetadata(): Promise<void> {
  resetAdminDashboardStoreForTests();
  seedSystemSnapshotForTests(buildSnapshotPayload(), "2026-07-19T11:45:00.000Z");

  const dashboard = await buildAdminDashboardResponse(new Date("2026-07-19T12:00:00.000Z"));
  assert(dashboard.metadata.dataSource === "live", "dashboard response should use live metadata");
  assert(dashboard.metadata.snapshotTime !== null, "dashboard response should include sync time");
}

export async function runAdminDashboardServiceTests(): Promise<void> {
  await testAlwaysUsesLiveQuery();
  await testUsesLiveQueryWhenSnapshotExpired();
  await testUsesLiveQueryWhenSnapshotMissing();
  await testBuildAdminDashboardResponseIncludesMetadata();
  assert(
    isSystemSnapshotFresh("2026-07-19T11:56:00.000Z", new Date("2026-07-19T12:00:00.000Z"), ADMIN_DASHBOARD_SNAPSHOT_MAX_AGE_MS),
    "snapshot freshness helper should still work"
  );
}

void runAdminDashboardServiceTests()
  .then(() => {
    console.log("Admin dashboard service tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
