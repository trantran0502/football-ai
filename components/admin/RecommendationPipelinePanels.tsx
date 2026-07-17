import type { AutomatedLearningPipelineResult } from "@/lib/admin/recommendationPipelineService";
import type { SystemHealthItem } from "@/lib/admin/recommendationPipelineService";
import type { PipelineInspectorStep } from "@/lib/admin/recommendationPipelineService";
import type { LearningStatistics } from "@/lib/admin/recommendationPipelineService";
import type { WeightOptimizerDiagnosticsSummary } from "@/lib/admin/recommendationPipelineService";

function statusColor(status: string): string {
  if (status === "healthy" || status === "SUCCESS") {
    return "text-emerald-700 dark:text-emerald-400";
  }
  if (status === "warning" || status === "WARNING") {
    return "text-amber-700 dark:text-amber-400";
  }
  return "text-red-700 dark:text-red-400";
}

export function SystemHealthPanel(props: { items: SystemHealthItem[] }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-3 text-lg font-semibold">System Health</h2>
      <div className="space-y-2 text-sm">
        {props.items.map((item) => (
          <div key={item.name} className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-100 py-2 dark:border-zinc-900">
            <span className="font-medium">{item.name}</span>
            <span className={statusColor(item.status)}>{item.status.toUpperCase()}</span>
            <span className="w-full text-zinc-600 dark:text-zinc-300">{item.reason}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function LearningStatisticsPanel(props: { statistics: LearningStatistics }) {
  const s = props.statistics;
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-3 text-lg font-semibold">Recommendation Learning Statistics</h2>
      <dl className="grid gap-2 text-sm md:grid-cols-2">
        <div><dt className="text-zinc-500">Total VERIFIED</dt><dd className="font-medium">{s.totalVerified}</dd></div>
        <div><dt className="text-zinc-500">Learning Records</dt><dd className="font-medium">{s.learningRecords}</dd></div>
        <div><dt className="text-zinc-500">Complete Records</dt><dd className="font-medium">{s.completeRecords}</dd></div>
        <div><dt className="text-zinc-500">Incomplete Records</dt><dd className="font-medium">{s.incompleteRecords}</dd></div>
        <div><dt className="text-zinc-500">Coverage %</dt><dd className="font-medium">{s.coveragePercent}%</dd></div>
        <div><dt className="text-zinc-500">Missing Provider Diagnostics</dt><dd className="font-medium">{s.missingProviderDiagnostics}</dd></div>
        <div><dt className="text-zinc-500">Missing Recommendation</dt><dd className="font-medium">{s.missingRecommendation}</dd></div>
        <div><dt className="text-zinc-500">Missing Market Outcomes</dt><dd className="font-medium">{s.missingMarketOutcomes}</dd></div>
        <div><dt className="text-zinc-500">Missing Overall Confidence</dt><dd className="font-medium">{s.missingOverallConfidence}</dd></div>
      </dl>
    </section>
  );
}

export function PipelineInspectorPanel(props: { steps: PipelineInspectorStep[] }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-3 text-lg font-semibold">Pipeline Inspector</h2>
      <div className="space-y-4 text-sm">
        {props.steps.map((step, index) => (
          <div key={step.id}>
            {index > 0 ? <div className="mb-2 text-zinc-400">↓</div> : null}
            <div className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{step.label}</span>
                <span className={statusColor(step.status)}>{step.status}</span>
              </div>
              <p className="mt-1 text-zinc-600 dark:text-zinc-300">{step.reason}</p>
              <p className="mt-1 text-xs text-zinc-500">Last success: {step.lastSuccessAt ?? "—"}</p>
              <p className="text-xs text-zinc-500">Last failure: {step.lastFailureAt ?? "—"}</p>
              <p className="text-xs text-zinc-500">Last error: {step.lastError ?? "—"}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function WeightOptimizerDiagnosticsPanel(props: {
  diagnostics: WeightOptimizerDiagnosticsSummary;
  statistics: LearningStatistics;
}) {
  const d = props.diagnostics;
  const s = props.statistics;

  if (!d.waiting && d.recordsUsed > 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
      <h2 className="text-lg font-semibold">Weight Optimizer waiting.</h2>
      <p className="mt-2 font-medium">Current Status:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>VERIFIED Match: {s.totalVerified}</li>
        <li>Learning: {s.learningRecords}</li>
        <li>Complete: {s.completeRecords}</li>
      </ul>
      <p className="mt-3 font-medium">Missing:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>provider_diagnostics: {d.missingCounts.providerDiagnostics}</li>
        <li>market_outcomes: {d.missingCounts.marketOutcomes}</li>
        <li>recommendation: {d.missingCounts.recommendation}</li>
        <li>provider_overall_confidence: {d.missingCounts.providerOverallConfidence}</li>
      </ul>
      {Object.keys(d.skipReasons).length > 0 ? (
        <pre className="mt-3 overflow-x-auto rounded border border-amber-300 p-2 text-xs dark:border-amber-800">
          {JSON.stringify(d.skipReasons, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}

export function PipelineSnapshotPanel(props: { snapshot: AutomatedLearningPipelineResult }) {
  return (
    <div className="space-y-6">
      <SystemHealthPanel items={props.snapshot.health} />
      <LearningStatisticsPanel statistics={props.snapshot.statistics} />
      <PipelineInspectorPanel steps={props.snapshot.pipeline} />
      <WeightOptimizerDiagnosticsPanel
        diagnostics={props.snapshot.weightOptimizer}
        statistics={props.snapshot.statistics}
      />
      {props.snapshot.retryLogs.length > 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 font-mono text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-3 text-lg font-semibold font-sans">Retry Logs</h2>
          <pre className="overflow-x-auto">{JSON.stringify(props.snapshot.retryLogs, null, 2)}</pre>
        </section>
      ) : null}
      {props.snapshot.errors.length > 0 ? (
        <section className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm dark:border-red-900/50 dark:bg-red-950/30">
          <h2 className="mb-2 font-semibold">Errors (continued after retry)</h2>
          <ul className="list-disc pl-5">
            {props.snapshot.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function SystemOverviewPanel(props: { snapshot: AutomatedLearningPipelineResult }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-4 text-lg font-semibold">System Overview</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {props.snapshot.health.map((item) => (
          <div key={item.name} className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="text-sm text-zinc-500">{item.name}</div>
            <div className={`mt-1 text-lg font-semibold ${statusColor(item.status)}`}>
              {item.status.toUpperCase()}
            </div>
            <div className="mt-1 text-xs text-zinc-500">{item.reason}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3 text-sm">
        <div>
          <div className="text-zinc-500">Learning Coverage</div>
          <div className="text-xl font-semibold">{props.snapshot.statistics.coveragePercent}%</div>
        </div>
        <div>
          <div className="text-zinc-500">Complete Records</div>
          <div className="text-xl font-semibold">{props.snapshot.statistics.completeRecords}</div>
        </div>
        <div>
          <div className="text-zinc-500">Weight Optimizer</div>
          <div className="text-xl font-semibold">
            {props.snapshot.weightOptimizer.recordsUsed > 0 ? "Analyzing" : "Waiting"}
          </div>
        </div>
      </div>
    </section>
  );
}
