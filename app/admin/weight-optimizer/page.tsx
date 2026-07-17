import Link from "next/link";
import { runAutomatedLearningPipeline } from "@/lib/admin/recommendationPipelineService";
import { WeightOptimizerDashboard } from "@/components/recommendation/WeightOptimizerDashboard";
import {
  PipelineInspectorPanel,
  WeightOptimizerDiagnosticsPanel,
} from "@/components/admin/RecommendationPipelinePanels";
import { buildWeightOptimizerReport } from "@/lib/recommendation/weightOptimizer";
import { listRecommendationLearningFromSupabase } from "@/lib/supabase/services/recommendationLearningService";
import { withSupabaseRetry } from "@/lib/admin/supabaseRetry";

export default async function WeightOptimizerAdminPage() {
  const snapshot = await runAutomatedLearningPipeline();
  const learningResult = await withSupabaseRetry(
    "weight_optimizer_list_learning",
    "GET recommendation_learning",
    () => listRecommendationLearningFromSupabase()
  );
  const records = learningResult.ok ? learningResult.value : [];
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
          <Link href="/admin/system-health">System Health</Link>
          <Link href="/admin/recommendation-learning">Recommendation Learning</Link>
          <Link href="/admin">Admin Home</Link>
        </div>
      </header>

      <WeightOptimizerDiagnosticsPanel
        diagnostics={snapshot.weightOptimizer}
        statistics={snapshot.statistics}
      />
      <PipelineInspectorPanel steps={snapshot.pipeline} />

      {report.diagnostics.recordsUsed > 0 ? (
        <WeightOptimizerDashboard report={report} />
      ) : null}
    </main>
  );
}
