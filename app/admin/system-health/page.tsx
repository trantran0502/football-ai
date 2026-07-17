import Link from "next/link";
import { runAutomatedLearningPipeline } from "@/lib/admin/recommendationPipelineService";
import { PipelineSnapshotPanel } from "@/components/admin/RecommendationPipelinePanels";

export default async function SystemHealthPage() {
  const snapshot = await runAutomatedLearningPipeline();

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Admin</p>
        <h1 className="text-2xl font-semibold">System Health</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Generated at {new Date(snapshot.generatedAt).toLocaleString("zh-TW")}
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link href="/admin">Admin Home</Link>
          <Link href="/admin/recommendation-learning-backfill">Backfill</Link>
          <Link href="/admin/weight-optimizer">Weight Optimizer</Link>
        </div>
      </header>
      <PipelineSnapshotPanel snapshot={snapshot} />
    </main>
  );
}
