"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { AutomatedLearningPipelineResult } from "@/lib/admin/recommendationPipelineService";
import { refreshPipelineAction } from "./actions";

export function RecommendationLearningBackfillStatus(props: {
  snapshot: AutomatedLearningPipelineResult;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      await refreshPipelineAction();
      router.refresh();
    });
  }

  return (
    <section className="space-y-4 font-mono text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          Auto pipeline complete
        </span>
        <button
          type="button"
          onClick={refresh}
          disabled={isPending}
          className="rounded border border-zinc-400 px-3 py-1"
        >
          {isPending ? "Refreshing..." : "Refresh Status"}
        </button>
      </div>

      {props.snapshot.scan ? (
        <div>
          <h2 className="mb-2 font-semibold font-sans">Scan Result</h2>
          <pre className="overflow-x-auto rounded border border-zinc-300 p-3 dark:border-zinc-700">
            {JSON.stringify(props.snapshot.scan, null, 2)}
          </pre>
        </div>
      ) : null}

      {props.snapshot.backfill ? (
        <div>
          <h2 className="mb-2 font-semibold font-sans">Backfill Result</h2>
          <pre className="overflow-x-auto rounded border border-zinc-300 p-3 dark:border-zinc-700">
            {JSON.stringify(props.snapshot.backfill, null, 2)}
          </pre>
        </div>
      ) : null}

      {props.snapshot.retryLogs.length > 0 ? (
        <div>
          <h2 className="mb-2 font-semibold font-sans">Retry Logs</h2>
          <pre className="overflow-x-auto rounded border border-zinc-300 p-3 dark:border-zinc-700">
            {JSON.stringify(props.snapshot.retryLogs, null, 2)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
