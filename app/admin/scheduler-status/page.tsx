import Link from "next/link";
import { buildSchedulerStatusSnapshot } from "@/lib/admin/schedulerStatusService";
import { loadRoiPerformanceResponse } from "@/lib/admin/roiPerformanceLoader";
import { parseRoiPerformanceSearchParams } from "@/lib/admin/roiPerformanceService";
import { SchedulerStatusDashboard } from "@/components/admin/SchedulerStatusDashboard";
import { RoiPerformanceSection } from "@/components/admin/RoiPerformanceSection";

export const dynamic = "force-dynamic";

export default async function SchedulerStatusPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const snapshot = await buildSchedulerStatusSnapshot();
  const roiFilters = parseRoiPerformanceSearchParams(params);
  const roi = await loadRoiPerformanceResponse(roiFilters);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wide text-zinc-500">Production Readiness</p>
          <h1 className="text-3xl font-bold">Scheduler Status</h1>
          <p className="text-sm text-zinc-500">
            更新時間：{new Date(snapshot.generatedAt).toLocaleString("zh-TW")}
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/admin" className="text-emerald-700 hover:underline dark:text-emerald-400">
              Admin Home
            </Link>
            <Link
              href="/admin/operations"
              className="text-emerald-700 hover:underline dark:text-emerald-400"
            >
              Operations
            </Link>
            <Link
              href="/admin/system-health"
              className="text-emerald-700 hover:underline dark:text-emerald-400"
            >
              System Health
            </Link>
          </div>
        </header>

        <SchedulerStatusDashboard snapshot={snapshot} />
        <RoiPerformanceSection data={roi} />
      </div>
    </main>
  );
}
