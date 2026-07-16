import {
  buildRecommendationValidationDashboardData,
  getProviderDiagnosticSourceColorClass,
  getProviderDiagnosticSourceLabel,
  type RecommendationValidationDashboardData,
} from "@/lib/recommendation/recommendationValidationDashboard";
import type { ReplayProviderRecommendationDiagnostic } from "@/lib/replay/replayTypes";

function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{props.label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {props.value}
      </p>
    </div>
  );
}

export function RecommendationValidationDashboard(props: {
  usableProviderCount: number;
  unavailableProviderCount: number;
  providerOverallConfidence: number | null;
  providerDiagnostics: ReplayProviderRecommendationDiagnostic[];
}) {
  const data: RecommendationValidationDashboardData =
    buildRecommendationValidationDashboardData({
      usableProviderCount: props.usableProviderCount,
      unavailableProviderCount: props.unavailableProviderCount,
      providerOverallConfidence: props.providerOverallConfidence,
      providerDiagnostics: props.providerDiagnostics,
    });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Recommendation Validation Dashboard
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          Provider weighting diagnostics shared with Replay snapshot.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Usable Providers"
          value={String(data.usableProviderCount)}
        />
        <MetricCard
          label="Unavailable Providers"
          value={String(data.unavailableProviderCount)}
        />
        <MetricCard
          label="Provider Overall Confidence"
          value={formatPercent(data.providerOverallConfidence)}
        />
      </div>

      {data.providerDiagnostics.length === 0 ? (
        <p className="text-sm text-zinc-500">無 providerDiagnostics 資料</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Confidence</th>
                <th className="px-3 py-2">Weight</th>
                <th className="px-3 py-2">Contribution</th>
              </tr>
            </thead>
            <tbody>
              {data.providerDiagnostics.map((row) => (
                <tr
                  key={row.providerKey}
                  className="border-b border-zinc-100 dark:border-zinc-900"
                >
                  <td className="px-3 py-2 font-mono text-xs">{row.providerKey}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getProviderDiagnosticSourceColorClass(row.source)}`}
                    >
                      {getProviderDiagnosticSourceLabel(row.source)}
                    </span>
                  </td>
                  <td className="px-3 py-2">{row.confidence.toFixed(3)}</td>
                  <td className="px-3 py-2">{row.weight.toFixed(4)}</td>
                  <td className="px-3 py-2 font-medium">{row.contribution.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
