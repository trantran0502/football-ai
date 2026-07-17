import Link from "next/link";
import { HistoricalBacktestDashboard } from "@/components/admin/HistoricalBacktestDashboard";
import { buildHistoricalFundamentalsBacktestFromRecords } from "@/lib/fundamentalsBacktest/historicalBacktestLoader";
import { loadAdminMatchRecords } from "@/lib/admin/adminRecordLoader";

export default async function HistoricalBacktestAdminPage() {
  const adminRecords = await loadAdminMatchRecords();
  const report = buildHistoricalFundamentalsBacktestFromRecords(adminRecords);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Admin</p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Historical Backtest Dashboard
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          歷史基本面回測：只使用賽前資料，不使用歷史盤口，禁止 Data Leakage。
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link href="/admin/ai-learning">AI Learning</Link>
          <Link href="/admin">Admin Home</Link>
        </div>
      </header>

      <HistoricalBacktestDashboard report={report} />
    </main>
  );
}
