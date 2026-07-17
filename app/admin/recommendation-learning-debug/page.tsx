import Link from "next/link";
import { buildRecommendationLearningDebugPageData } from "@/lib/supabase/queries/recommendationLearning";

export default async function RecommendationLearningDebugPage() {
  const { syncResult, report } = await buildRecommendationLearningDebugPageData();

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 font-mono text-sm">
      <header>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Admin Debug</p>
        <h1 className="text-xl font-semibold">Recommendation Learning Pipeline Debug</h1>
        <div className="mt-2 flex flex-wrap gap-3">
          <Link href="/admin/recommendation-learning">Learning Dashboard</Link>
          <Link href="/admin/weight-optimizer">Weight Optimizer</Link>
          <Link href="/admin">Admin Home</Link>
        </div>
      </header>

      <section>
        <h2 className="mb-2 font-semibold">Summary</h2>
        <pre className="overflow-x-auto rounded border border-zinc-300 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950">
{JSON.stringify(
  {
    recordsRead: report.recordsRead,
    recordsComplete: report.recordsComplete,
    recordsSkipped: report.recordsSkipped,
    skipReasonCounts: report.skipReasonCounts,
    sync: syncResult,
    generatedAt: report.generatedAt,
  },
  null,
  2
)}
        </pre>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Pipeline Diagnostics Log</h2>
        {report.entries.length === 0 ? (
          <p>No match_records found.</p>
        ) : (
          report.entries.map((entry) => (
            <div
              key={entry.matchRecordId}
              className="mb-4 rounded border border-zinc-300 p-3 dark:border-zinc-700"
            >
              <div>
                {entry.matchRecordId} | {entry.homeTeam} vs {entry.awayTeam} | status=
                {entry.matchStatus} | learningExists={String(entry.learningRecordExists)}
              </div>
              <div>skipReasons: {entry.completeness.skipReasons.join(", ") || "none"}</div>
              <div>missingFields: {entry.completeness.missingFields.join(", ") || "none"}</div>
              <ol className="mt-2 list-decimal pl-5">
                {entry.pipeline.map((step) => (
                  <li key={step.id}>
                    {step.label} — {step.status} — {step.reason}
                  </li>
                ))}
              </ol>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
