import Link from "next/link";
import { AiPerformanceCenterSection } from "@/app/components/AiPerformanceCenterSection";
import { buildPerformanceCenterResponse } from "@/lib/performance/performanceService";

export default async function AdminPerformancePage() {
  let report = null;
  let error: string | null = null;

  try {
    report = await buildPerformanceCenterResponse();
  } catch (loadError) {
    error =
      loadError instanceof Error ? loadError.message : "無法載入 AI 績效中心資料";
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wide text-zinc-500">Admin</p>
          <h1 className="text-3xl font-bold">📊 AI 績效中心</h1>
          <p className="text-sm text-zinc-500">
            完整績效統計，資料來源 daily_recommendations + match_records + verification_result
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/admin" className="text-emerald-700 hover:underline dark:text-emerald-400">
              Admin Home
            </Link>
            <Link href="/" className="text-emerald-700 hover:underline dark:text-emerald-400">
              首頁
            </Link>
          </div>
        </header>

        <AiPerformanceCenterSection
          report={report}
          loading={false}
          error={error}
        />
      </div>
    </main>
  );
}
