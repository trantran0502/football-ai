import type { FundamentalsBacktestReport } from "@/lib/fundamentalsBacktest/fundamentalsBacktestTypes";

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

export function HistoricalBacktestDashboard(props: { report: FundamentalsBacktestReport }) {
  const { report } = props;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
        <p className="font-semibold">Historical Fundamentals Backtest · No Odds / No ROI</p>
        <p className="mt-1">
          dataMode={report.dataMode} · 僅使用賽前基本面資料，禁止 Data Leakage，不計算盤口 ROI 或水位。
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total Historical Fixtures" value={String(report.totalHistoricalFixtures)} />
        <MetricCard label="Valid Snapshots" value={String(report.validSnapshots)} />
        <MetricCard label="Invalid Snapshots" value={String(report.invalidSnapshots)} />
        <MetricCard label="Leakage Detected" value={String(report.leakageDetectedCount)} />
        <MetricCard label="Missing Data Rate" value={formatPercent(report.missingDataRate)} />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Prediction Accuracy" value={formatPercent(report.directionAccuracy)} />
        <MetricCard label="BTTS Accuracy" value={formatPercent(report.bttsAccuracy)} />
        <MetricCard label="Over / Under Accuracy" value={formatPercent(report.overUnderAccuracy)} />
        <MetricCard label="Sample Size" value={String(report.sampleSize)} />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-3 text-lg font-semibold">League Ranking</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
                  <th className="px-2 py-2">League</th>
                  <th className="px-2 py-2">Sample</th>
                  <th className="px-2 py-2">Direction</th>
                  <th className="px-2 py-2">BTTS</th>
                  <th className="px-2 py-2">O/U</th>
                </tr>
              </thead>
              <tbody>
                {report.leagueRanking.map((row) => (
                  <tr key={row.leagueName} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="px-2 py-2 font-medium">{row.leagueName}</td>
                    <td className="px-2 py-2">{row.sampleSize}</td>
                    <td className="px-2 py-2">{formatPercent(row.directionAccuracy)}</td>
                    <td className="px-2 py-2">{formatPercent(row.bttsAccuracy)}</td>
                    <td className="px-2 py-2">{formatPercent(row.overUnderAccuracy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-3 text-lg font-semibold">Evidence Provider Ranking</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
                  <th className="px-2 py-2">Provider</th>
                  <th className="px-2 py-2">Usage</th>
                  <th className="px-2 py-2">Accuracy</th>
                  <th className="px-2 py-2">Confidence</th>
                  <th className="px-2 py-2">Calibration Gap</th>
                </tr>
              </thead>
              <tbody>
                {report.evidenceProviderRanking.map((row) => (
                  <tr key={row.category} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="px-2 py-2 font-medium">{row.category}</td>
                    <td className="px-2 py-2">{row.usageCount}</td>
                    <td className="px-2 py-2">{formatPercent(row.hitRate)}</td>
                    <td className="px-2 py-2">{formatPercent(row.averageConfidence)}</td>
                    <td className="px-2 py-2">{formatPercent(row.confidenceCalibrationGap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
