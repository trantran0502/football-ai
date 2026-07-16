import Link from "next/link";
import { RecommendationLearningDashboard } from "@/components/recommendation/RecommendationLearningDashboard";
import { buildRecommendationLearningDashboardData } from "@/lib/recommendation/recommendationLearningAnalytics";
import { listRecommendationLearningRecords } from "@/lib/supabase/queries/recommendationLearning";

export default async function RecommendationLearningAdminPage() {
  const records = await listRecommendationLearningRecords();
  const dashboard = buildRecommendationLearningDashboardData(records);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Admin</p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Recommendation Learning
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          每場 VERIFIED 後累積 Provider 與玩法表現。目前不自動調整權重。
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
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

      {dashboard.totalRecords === 0 ? (
        <p className="text-sm text-zinc-500">尚無 recommendation_learning 資料。</p>
      ) : (
        <RecommendationLearningDashboard data={dashboard} />
      )}
    </main>
  );
}
