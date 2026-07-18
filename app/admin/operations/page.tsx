import Link from "next/link";
import { buildOperationsDashboardSnapshot } from "@/lib/admin/operationsDashboardService";
import { OperationsDashboard } from "@/components/admin/OperationsDashboard";

export const dynamic = "force-dynamic";

export default async function OperationsDashboardPage() {
  const snapshot = await buildOperationsDashboardSnapshot();

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wide text-zinc-500">v1.0 Beta</p>
          <h1 className="text-3xl font-bold">Operations Dashboard</h1>
          <p className="text-sm text-zinc-500">
            更新時間：{new Date(snapshot.system.generatedAt).toLocaleString("zh-TW")}
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/admin" className="text-emerald-700 hover:underline dark:text-emerald-400">
              Admin Home
            </Link>
            <Link
              href="/admin/system-health"
              className="text-emerald-700 hover:underline dark:text-emerald-400"
            >
              System Health
            </Link>
            <Link
              href="/admin/recommendation-validation"
              className="text-emerald-700 hover:underline dark:text-emerald-400"
            >
              Recommendation Validation
            </Link>
          </div>
        </header>

        <OperationsDashboard snapshot={snapshot} />
      </div>
    </main>
  );
}
