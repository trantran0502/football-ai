import Link from "next/link";
import { WeightOptimizerDashboard } from "@/components/recommendation/WeightOptimizerDashboard";
import { buildWeightOptimizerReport } from "@/lib/recommendation/weightOptimizer";
import { listRecommendationLearningRecords } from "@/lib/supabase/queries/recommendationLearning";

export default async function WeightOptimizerAdminPage() {
  const records = await listRecommendationLearningRecords();
  const report = buildWeightOptimizerReport(records);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Admin</p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Weight Optimizer
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Analysis Mode：依 recommendation_learning 產生 Market / Team 建議權重。尚未套用正式權重。
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link
            href="/admin/recommendation-learning"
            className="text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Recommendation Learning
          </Link>
          <Link
            href="/admin/recommendation-validation"
            className="text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Validation Dashboard
          </Link>
          <Link href="/admin" className="text-emerald-700 hover:underline dark:text-emerald-400">
            Admin Home
          </Link>
        </div>
      </header>

      {report.diagnostics.recordsUsed === 0 ? (
        <p className="text-sm text-zinc-500">尚無可用 recommendation_learning 資料。</p>
      ) : (
        <WeightOptimizerDashboard report={report} />
      )}
    </main>
  );
}
