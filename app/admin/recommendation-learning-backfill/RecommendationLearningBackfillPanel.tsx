"use client";

import { useState, useTransition } from "react";
import type {
  RecommendationLearningBackfillResult,
  RecommendationLearningBackfillScanResult,
} from "@/lib/recommendation/recommendationLearningBackfill";
import { runBackfillAction, scanBackfillAction } from "./actions";

export function RecommendationLearningBackfillPanel() {
  const [scanResult, setScanResult] = useState<RecommendationLearningBackfillScanResult | null>(
    null
  );
  const [backfillResult, setBackfillResult] =
    useState<RecommendationLearningBackfillResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleScan() {
    setError(null);
    startTransition(async () => {
      try {
        setScanResult(await scanBackfillAction());
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
  }

  function handleBackfill() {
    setError(null);
    startTransition(async () => {
      try {
        setBackfillResult(await runBackfillAction());
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
  }

  return (
    <div className="space-y-6 font-mono text-sm">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleScan}
          disabled={isPending}
          className="rounded border border-zinc-400 px-4 py-2"
        >
          Scan VERIFIED
        </button>
        <button
          type="button"
          onClick={handleBackfill}
          disabled={isPending}
          className="rounded border border-zinc-400 px-4 py-2"
        >
          Start Backfill
        </button>
      </div>

      {isPending ? <p>Processing...</p> : null}
      {error ? <pre className="text-red-600">{error}</pre> : null}

      {scanResult ? (
        <section>
          <h2 className="mb-2 font-semibold">Scan Result</h2>
          <pre className="overflow-x-auto rounded border border-zinc-300 p-3 dark:border-zinc-700">
            {JSON.stringify(scanResult, null, 2)}
          </pre>
        </section>
      ) : null}

      {backfillResult ? (
        <section>
          <h2 className="mb-2 font-semibold">Backfill Result</h2>
          <pre className="overflow-x-auto rounded border border-zinc-300 p-3 dark:border-zinc-700">
            {JSON.stringify(backfillResult, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
