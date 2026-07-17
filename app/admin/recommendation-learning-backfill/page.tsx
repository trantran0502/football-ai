import Link from "next/link";
import { runAutomatedLearningPipeline } from "@/lib/admin/recommendationPipelineService";
import {
  LearningStatisticsPanel,
  PipelineInspectorPanel,
  SystemHealthPanel,
} from "@/components/admin/RecommendationPipelinePanels";
import { RecommendationLearningBackfillStatus } from "./RecommendationLearningBackfillStatus";

export default async function RecommendationLearningBackfillPage() {
  const snapshot = await runAutomatedLearningPipeline();

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Admin Tool</p>
        <h1 className="text-xl font-semibold">Recommendation Learning Backfill</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Auto: Scan VERIFIED → Start Backfill → Refresh Status
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <Link href="/admin/system-health">System Health</Link>
          <Link href="/admin/recommendation-learning-debug">Debug</Link>
          <Link href="/admin/weight-optimizer">Weight Optimizer</Link>
        </div>
      </header>

      <RecommendationLearningBackfillStatus snapshot={snapshot} />
      <SystemHealthPanel items={snapshot.health} />
      <LearningStatisticsPanel statistics={snapshot.statistics} />
      <PipelineInspectorPanel steps={snapshot.pipeline} />
    </main>
  );
}
