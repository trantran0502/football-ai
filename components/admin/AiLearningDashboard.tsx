import type { AiLearningDashboardStats, AiLearningReport } from "@/lib/learning/aiLearningTypes";

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function MetricCard(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-sm text-zinc-500">{props.label}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        {props.value}
      </div>
      {props.hint ? <div className="mt-1 text-xs text-zinc-400">{props.hint}</div> : null}
    </div>
  );
}

function RankingTable(props: {
  title: string;
  rows: AiLearningDashboardStats["leagueRanking"];
}) {
  if (props.rows.length === 0) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-lg font-semibold">{props.title}</h2>
        <p className="text-sm text-zinc-500">尚無資料</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-3 text-lg font-semibold">{props.title}</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
              <th className="px-2 py-2">名稱</th>
              <th className="px-2 py-2">樣本</th>
              <th className="px-2 py-2">命中率</th>
              <th className="px-2 py-2">ROI</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => (
              <tr key={row.key} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="px-2 py-2 font-medium">{row.key}</td>
                <td className="px-2 py-2">{row.usageCount}</td>
                <td className="px-2 py-2">{formatPercent(row.hitRate)}</td>
                <td className="px-2 py-2">{formatPercent(row.roi)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AiLearningDashboard(props: { report: AiLearningReport }) {
  const { report } = props;
  const { dashboard } = report;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-200">
        <p className="font-semibold">AI Learning · Analysis-only</p>
        <p className="mt-1">
          optimizerMode={report.optimizerMode} · weightsApplied={String(report.weightsApplied)}。
          本報告僅產生調整建議，不會修改 Rule Engine、Market Engine 或 Production Weight。
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Verified Matches" value={String(report.sampleSize)} />
        <MetricCard label="Report Confidence" value={formatPercent(report.confidence)} />
        <MetricCard
          label="Improvement Candidates"
          value={String(report.improvementCandidates.length)}
        />
        <MetricCard
          label="Suggested Changes"
          value={String(dashboard.suggestedChanges.length)}
        />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-lg font-semibold">Top Improvements</h2>
        {dashboard.topImprovements.length === 0 ? (
          <p className="text-sm text-zinc-500">尚無候選項目</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
                  <th className="px-2 py-2">Target</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Expected</th>
                  <th className="px-2 py-2">Confidence</th>
                  <th className="px-2 py-2">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.topImprovements.map((row) => (
                  <tr key={`${row.targetType}-${row.target}`} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="px-2 py-2 font-medium">{row.target}</td>
                    <td className="px-2 py-2">{row.targetType}</td>
                    <td className="px-2 py-2">{formatPercent(row.expectedImprovement)}</td>
                    <td className="px-2 py-2">{formatPercent(row.confidence)}</td>
                    <td className="px-2 py-2 text-zinc-600 dark:text-zinc-300">{row.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <RankingTable title="Best Rules" rows={dashboard.bestRules.map((row) => ({
          key: row.rule,
          usageCount: row.sampleSize,
          hitRate: row.hitRate,
          roi: row.roi,
        }))} />
        <RankingTable title="Worst Rules" rows={dashboard.worstRules.map((row) => ({
          key: row.rule,
          usageCount: row.sampleSize,
          hitRate: row.hitRate,
          roi: row.roi,
        }))} />
        <RankingTable title="League Ranking" rows={dashboard.leagueRanking} />
        <RankingTable title="Market Ranking" rows={dashboard.marketRanking} />
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-lg font-semibold">Suggested Changes</h2>
        {dashboard.suggestedChanges.length === 0 ? (
          <p className="text-sm text-zinc-500">尚無建議</p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
            {dashboard.suggestedChanges.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
