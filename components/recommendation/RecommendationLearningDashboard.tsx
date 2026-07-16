import type {
  RecommendationLearningDashboardData,
  RecommendationLearningWindowStats,
  RecommendationMarketLearningStats,
  RecommendationProviderLearningStats,
} from "@/lib/recommendation/recommendationLearningTypes";

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

function ProviderRankingTable(props: {
  title: string;
  rows: RecommendationProviderLearningStats[];
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-3 text-lg font-semibold">{props.title}</h2>
      {props.rows.length === 0 ? (
        <p className="text-sm text-zinc-500">尚無 Provider 資料</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
                <th className="px-2 py-2">Provider</th>
                <th className="px-2 py-2">使用次數</th>
                <th className="px-2 py-2">命中次數</th>
                <th className="px-2 py-2">命中率</th>
                <th className="px-2 py-2">ROI</th>
                <th className="px-2 py-2">平均 Confidence</th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row) => (
                <tr
                  key={row.providerKey}
                  className="border-b border-zinc-100 dark:border-zinc-900"
                >
                  <td className="px-2 py-2 font-medium">{row.providerKey}</td>
                  <td className="px-2 py-2">{row.usageCount}</td>
                  <td className="px-2 py-2">{row.hitCount}</td>
                  <td className="px-2 py-2">{formatPercent(row.hitRate)}</td>
                  <td className="px-2 py-2">{formatPercent(row.roi)}</td>
                  <td className="px-2 py-2">{row.averageConfidence.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MarketStatsTable(props: {
  title: string;
  rows: RecommendationMarketLearningStats[];
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-3 text-lg font-semibold">{props.title}</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
              <th className="px-2 py-2">玩法</th>
              <th className="px-2 py-2">使用次數</th>
              <th className="px-2 py-2">命中次數</th>
              <th className="px-2 py-2">命中率</th>
              <th className="px-2 py-2">ROI</th>
              <th className="px-2 py-2">平均 Confidence</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => (
              <tr
                key={row.marketKey}
                className="border-b border-zinc-100 dark:border-zinc-900"
              >
                <td className="px-2 py-2 font-medium">{row.marketKey}</td>
                <td className="px-2 py-2">{row.usageCount}</td>
                <td className="px-2 py-2">{row.hitCount}</td>
                <td className="px-2 py-2">{formatPercent(row.hitRate)}</td>
                <td className="px-2 py-2">{formatPercent(row.roi)}</td>
                <td className="px-2 py-2">{row.averageConfidence.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WindowSection(props: {
  title: string;
  stats: RecommendationLearningWindowStats;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{props.title}</h2>
        <p className="text-sm text-zinc-500">樣本 {props.stats.sampleSize} 場</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard label="Hit Rate" value={formatPercent(props.stats.hitRate)} />
        <MetricCard label="ROI" value={formatPercent(props.stats.roi)} />
      </div>
      <ProviderRankingTable
        title="Provider Ranking"
        rows={props.stats.providerRanking}
      />
      <MarketStatsTable title="玩法統計" rows={props.stats.marketStats} />
    </div>
  );
}

export function RecommendationLearningDashboard(props: {
  data: RecommendationLearningDashboardData;
}) {
  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="累積場次" value={String(props.data.totalRecords)} />
        <MetricCard
          label="整體 Hit Rate"
          value={formatPercent(props.data.overall.hitRate)}
        />
        <MetricCard label="整體 ROI" value={formatPercent(props.data.overall.roi)} />
      </section>

      <WindowSection title="全部場次" stats={props.data.overall} />
      <WindowSection title="最近 100 場" stats={props.data.last100} />
      <WindowSection title="最近 500 場" stats={props.data.last500} />

      {props.data.recentRecords.length > 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-3 text-lg font-semibold">最近學習紀錄</h2>
          <ul className="space-y-2 text-sm">
            {props.data.recentRecords.map((record) => (
              <li
                key={record.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-2 dark:border-zinc-900"
              >
                <span>
                  {record.homeTeam} vs {record.awayTeam}
                </span>
                <span className="text-zinc-500">
                  fixture {record.fixtureId ?? "—"} · hit {record.hit ? "Y" : "N"} · ROI{" "}
                  {formatPercent(record.totalStake > 0 ? record.totalProfit / record.totalStake : 0)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
