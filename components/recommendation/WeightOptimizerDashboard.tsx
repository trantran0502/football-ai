import type { WeightOptimizerReport } from "@/lib/recommendation/weightOptimizerTypes";

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatWeight(value: number): string {
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

export function WeightOptimizerDashboard(props: { report: WeightOptimizerReport }) {
  const { report } = props;
  const { overall, providers, byMarketType, diagnostics } = report;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
        <p className="font-semibold">Analysis Mode · 尚未套用正式權重</p>
        <p className="mt-1">
          本頁僅產生建議權重（optimizerMode={diagnostics.optimizerMode}，weightsApplied=
          {String(diagnostics.weightsApplied)}）。Production Recommendation 與 providerWeights.ts
          不受影響。
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Overall Market / Team</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Current Market Weight"
            value={formatWeight(overall.market.currentWeight)}
          />
          <MetricCard
            label="Suggested Market Weight"
            value={formatWeight(overall.market.suggestedWeight)}
            hint={overall.market.adjustmentReason}
          />
          <MetricCard
            label="Current Team Weight"
            value={formatWeight(overall.team.currentWeight)}
          />
          <MetricCard
            label="Suggested Team Weight"
            value={formatWeight(overall.team.suggestedWeight)}
            hint={overall.team.adjustmentReason}
          />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="樣本數" value={String(overall.market.sampleSize)} />
          <MetricCard label="Hit Rate" value={formatPercent(overall.market.hitRate)} />
          <MetricCard label="ROI" value={formatPercent(overall.market.roi)} />
          <MetricCard
            label="Sample Reliability"
            value={formatPercent(overall.market.sampleReliability)}
          />
          <MetricCard
            label="Status"
            value={overall.market.status}
            hint={`CI ${formatPercent(overall.market.confidenceInterval.lower)} – ${formatPercent(overall.market.confidenceInterval.upper)}`}
          />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-lg font-semibold">Provider Ranking（Team Group）</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
                <th className="px-2 py-2">Provider</th>
                <th className="px-2 py-2">使用次數</th>
                <th className="px-2 py-2">Hit Rate</th>
                <th className="px-2 py-2">ROI</th>
                <th className="px-2 py-2">Current</th>
                <th className="px-2 py-2">Suggested</th>
                <th className="px-2 py-2">Reliability</th>
                <th className="px-2 py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((row) => (
                <tr
                  key={row.providerKey}
                  className="border-b border-zinc-100 dark:border-zinc-900"
                >
                  <td className="px-2 py-2 font-medium">{row.providerKey}</td>
                  <td className="px-2 py-2">{row.usageCount}</td>
                  <td className="px-2 py-2">{formatPercent(row.hitRate)}</td>
                  <td className="px-2 py-2">{formatPercent(row.roi)}</td>
                  <td className="px-2 py-2">{formatWeight(row.currentWeight)}</td>
                  <td className="px-2 py-2">{formatWeight(row.suggestedWeight)}</td>
                  <td className="px-2 py-2">{formatPercent(row.sampleReliability)}</td>
                  <td className="px-2 py-2 text-zinc-600 dark:text-zinc-300">
                    {row.adjustmentReason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-lg font-semibold">Market Type 分析</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
                <th className="px-2 py-2">玩法</th>
                <th className="px-2 py-2">樣本</th>
                <th className="px-2 py-2">Market Hit</th>
                <th className="px-2 py-2">Market ROI</th>
                <th className="px-2 py-2">Suggested Market</th>
                <th className="px-2 py-2">Suggested Team</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {byMarketType.map((row) => (
                <tr
                  key={row.marketKey}
                  className="border-b border-zinc-100 dark:border-zinc-900"
                >
                  <td className="px-2 py-2 font-medium">{row.marketKey}</td>
                  <td className="px-2 py-2">{row.market.sampleSize}</td>
                  <td className="px-2 py-2">{formatPercent(row.market.hitRate)}</td>
                  <td className="px-2 py-2">{formatPercent(row.market.roi)}</td>
                  <td className="px-2 py-2">{formatWeight(row.market.suggestedWeight)}</td>
                  <td className="px-2 py-2">{formatWeight(row.team.suggestedWeight)}</td>
                  <td className="px-2 py-2">{row.market.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-lg font-semibold">Evidence Performance（唯讀）</h2>
        <p className="mb-4 text-sm text-zinc-500">
          樣本 {report.evidencePerformance.sampleSize} 場 · 僅供分析，不自動調整權重
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
                <th className="px-2 py-2">Provider</th>
                <th className="px-2 py-2">使用次數</th>
                <th className="px-2 py-2">命中率</th>
                <th className="px-2 py-2">平均影響分數</th>
                <th className="px-2 py-2">平均信心</th>
                <th className="px-2 py-2">ROI</th>
              </tr>
            </thead>
            <tbody>
              {report.evidencePerformance.providers.map((row) => (
                <tr
                  key={row.category}
                  className="border-b border-zinc-100 dark:border-zinc-900"
                >
                  <td className="px-2 py-2 font-medium">{row.label}</td>
                  <td className="px-2 py-2">{row.usageCount}</td>
                  <td className="px-2 py-2">{formatPercent(row.hitRate)}</td>
                  <td className="px-2 py-2">{row.averageImpactScore.toFixed(1)}</td>
                  <td className="px-2 py-2">{formatPercent(row.averageConfidence)}</td>
                  <td className="px-2 py-2">{formatPercent(row.roi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-lg font-semibold">Diagnostics</h2>
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-zinc-500">recordsRead</dt>
            <dd className="font-medium">{diagnostics.recordsRead}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">recordsUsed</dt>
            <dd className="font-medium">{diagnostics.recordsUsed}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">recordsSkipped</dt>
            <dd className="font-medium">{diagnostics.recordsSkipped}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">dateRange</dt>
            <dd className="font-medium">
              {diagnostics.dateRange.from ?? "—"} → {diagnostics.dateRange.to ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">generatedAt</dt>
            <dd className="font-medium">{diagnostics.generatedAt}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">skipReasons</dt>
            <dd className="font-medium">
              {Object.keys(diagnostics.skipReasons).length === 0
                ? "—"
                : Object.entries(diagnostics.skipReasons)
                    .map(([reason, count]) => `${reason}: ${count}`)
                    .join(", ")}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
