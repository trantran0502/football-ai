import Link from "next/link";
import { RecommendationLearningBackfillPanel } from "./RecommendationLearningBackfillPanel";

export default function RecommendationLearningBackfillPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Admin Tool</p>
        <h1 className="text-xl font-semibold">Recommendation Learning Backfill</h1>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <Link href="/admin/recommendation-learning-debug">Debug</Link>
          <Link href="/admin/recommendation-learning">Learning</Link>
          <Link href="/admin/weight-optimizer">Weight Optimizer</Link>
        </div>
      </header>

      <RecommendationLearningBackfillPanel />
    </main>
  );
}
