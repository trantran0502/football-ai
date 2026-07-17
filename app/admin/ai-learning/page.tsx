import Link from "next/link";
import { AiLearningDashboard } from "@/components/admin/AiLearningDashboard";
import { buildLearningEngineReport } from "@/lib/learning/learningEngine";
import { loadAdminMatchRecords } from "@/lib/admin/adminRecordLoader";

export default async function AiLearningAdminPage() {
  const adminRecords = await loadAdminMatchRecords();
  const learning = buildLearningEngineReport(adminRecords);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Admin</p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          AI Learning Dashboard
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          根據 Recommendation History、Validation、Evidence Learning 與 Weight Optimizer 產生 analysis-only 調整建議。
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link href="/admin/weight-optimizer">Weight Optimizer</Link>
          <Link href="/admin/recommendation-learning">Recommendation Learning</Link>
          <Link href="/admin">Admin Home</Link>
        </div>
      </header>

      {learning.sampleSize.verifiedMatches > 0 ? (
        <AiLearningDashboard report={learning.aiLearning} />
      ) : (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          尚無足夠 VERIFIED 樣本產生 AI Learning 報告。
        </section>
      )}
    </main>
  );
}
