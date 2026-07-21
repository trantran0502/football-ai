import type { RoiPerformanceResponse } from "@/lib/admin/roiPerformanceTypes";

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return value.toFixed(digits);
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

function SectionCard(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-4 text-lg font-semibold">{props.title}</h2>
      {props.children}
    </section>
  );
}

function BreakdownTable(props: {
  title: string;
  rows: RoiPerformanceResponse["breakdowns"]["byMarket"];
}) {
  return (
    <SectionCard title={props.title}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-zinc-500 dark:border-zinc-900">
              <th className="px-2 py-2 font-medium">Group</th>
              <th className="px-2 py-2 font-medium">Sample</th>
              <th className="px-2 py-2 font-medium">Wins</th>
              <th className="px-2 py-2 font-medium">Losses</th>
              <th className="px-2 py-2 font-medium">Hit Rate</th>
              <th className="px-2 py-2 font-medium">Profit</th>
              <th className="px-2 py-2 font-medium">ROI</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-4 text-zinc-400">
                  尚無資料
                </td>
              </tr>
            ) : (
              props.rows.map((row) => (
                <tr
                  key={row.key}
                  className="border-b border-zinc-100 dark:border-zinc-900"
                >
                  <td className="px-2 py-2 font-medium">{row.label}</td>
                  <td className="px-2 py-2">{row.sampleSize}</td>
                  <td className="px-2 py-2">{row.wins}</td>
                  <td className="px-2 py-2">{row.losses}</td>
                  <td className="px-2 py-2">{formatPercent(row.hitRate)}</td>
                  <td className="px-2 py-2">{formatNumber(row.totalProfit)}</td>
                  <td className="px-2 py-2">{formatPercent(row.roi)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

export function RoiPerformanceSection(props: {
  data: RoiPerformanceResponse;
}) {
  const { data } = props;
  const { summary, filters, filterOptions, pagination, excludedReasonCounts } = data;

  return (
    <div className="space-y-6">
      <SectionCard title="ROI 績效">
        <p className="mb-4 text-sm text-zinc-500">
          預設最近 30 天。僅納入正式推薦、已 verified、有效賠率、可結算市場。
          push / void 不計入 ROI denominator。verifiedCount 與 roiEligibleCount 分開顯示。
        </p>

        <form method="get" className="mb-6 grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500">From</span>
            <input
              type="date"
              name="fromDate"
              defaultValue={filters.fromDate}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500">To</span>
            <input
              type="date"
              name="toDate"
              defaultValue={filters.toDate}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500">Market</span>
            <select
              name="market"
              defaultValue={filters.market ?? ""}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">全部</option>
              {filterOptions.markets.map((market) => (
                <option key={market} value={market}>
                  {market}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500">League</span>
            <select
              name="league"
              defaultValue={filters.league ?? ""}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">全部</option>
              {filterOptions.leagues.map((league) => (
                <option key={league} value={league}>
                  {league}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500">Verification</span>
            <select
              name="verificationResult"
              defaultValue={filters.verificationResult ?? "all"}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="all">全部</option>
              {filterOptions.verificationResults.map((result) => (
                <option key={result} value={result}>
                  {result}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500">Weight Version</span>
            <select
              name="weightVersion"
              defaultValue={filters.weightVersion ?? ""}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">全部</option>
              {filterOptions.weightVersions.map((version) => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-end gap-2 text-sm">
            <input
              type="checkbox"
              name="onlyRoiEligible"
              value="1"
              defaultChecked={filters.onlyRoiEligible}
              className="h-4 w-4"
            />
            <span>只看 ROI eligible</span>
          </label>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
            >
              套用篩選
            </button>
            <a
              href="/admin/scheduler-status"
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              重置
            </a>
          </div>
        </form>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <MetricCard
            label="verifiedCount"
            value={String(summary.verifiedCount)}
            hint="已驗證比賽數"
          />
          <MetricCard
            label="roiEligibleCount"
            value={String(summary.roiEligibleCount)}
            hint="納入 ROI 分母"
          />
          <MetricCard label="Wins" value={String(summary.winCount)} />
          <MetricCard label="Losses" value={String(summary.lossCount)} />
          <MetricCard label="Push" value={String(summary.pushCount)} />
          <MetricCard label="Void" value={String(summary.voidCount)} />
          <MetricCard label="Hit Rate" value={formatPercent(summary.hitRate)} />
          <MetricCard label="Total Profit" value={formatNumber(summary.totalProfit)} />
          <MetricCard label="Cumulative ROI" value={formatPercent(summary.cumulativeRoi)} />
          <MetricCard label="Average Odds" value={formatNumber(summary.averageOdds)} />
          <MetricCard label="Today ROI" value={formatPercent(summary.todayRoi)} />
          <MetricCard label="Last 7 Days ROI" value={formatPercent(summary.last7DaysRoi)} />
          <MetricCard label="Last 30 Days ROI" value={formatPercent(summary.last30DaysRoi)} />
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <BreakdownTable title="Market Breakdown" rows={data.breakdowns.byMarket} />
        <BreakdownTable title="League Breakdown" rows={data.breakdowns.byLeague} />
        <BreakdownTable title="Grade Breakdown" rows={data.breakdowns.byGrade} />
        <BreakdownTable
          title="Weight Version Breakdown"
          rows={data.breakdowns.byWeightVersion}
        />
      </div>

      <SectionCard title="Excluded Reason Counts（verified 但未納入 ROI）">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(excludedReasonCounts).map(([reason, count]) => (
            <MetricCard key={reason} label={reason} value={String(count)} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="ROI 明細">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-500">
          <span>
            共 {pagination.totalRecords} 筆 · 第 {pagination.page} / {pagination.totalPages} 頁
          </span>
          <div className="flex gap-2">
            {pagination.page > 1 ? (
              <a
                className="text-emerald-700 hover:underline dark:text-emerald-400"
                href={`?${new URLSearchParams({
                  fromDate: filters.fromDate,
                  toDate: filters.toDate,
                  ...(filters.market ? { market: filters.market } : {}),
                  ...(filters.league ? { league: filters.league } : {}),
                  ...(filters.verificationResult && filters.verificationResult !== "all"
                    ? { verificationResult: filters.verificationResult }
                    : {}),
                  ...(filters.weightVersion
                    ? { weightVersion: filters.weightVersion }
                    : {}),
                  ...(filters.onlyRoiEligible ? { onlyRoiEligible: "1" } : {}),
                  page: String(pagination.page - 1),
                }).toString()}`}
              >
                上一頁
              </a>
            ) : null}
            {pagination.page < pagination.totalPages ? (
              <a
                className="text-emerald-700 hover:underline dark:text-emerald-400"
                href={`?${new URLSearchParams({
                  fromDate: filters.fromDate,
                  toDate: filters.toDate,
                  ...(filters.market ? { market: filters.market } : {}),
                  ...(filters.league ? { league: filters.league } : {}),
                  ...(filters.verificationResult && filters.verificationResult !== "all"
                    ? { verificationResult: filters.verificationResult }
                    : {}),
                  ...(filters.weightVersion
                    ? { weightVersion: filters.weightVersion }
                    : {}),
                  ...(filters.onlyRoiEligible ? { onlyRoiEligible: "1" } : {}),
                  page: String(pagination.page + 1),
                }).toString()}`}
              >
                下一頁
              </a>
            ) : null}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-zinc-500 dark:border-zinc-900">
                <th className="px-2 py-2 font-medium">Date</th>
                <th className="px-2 py-2 font-medium">League</th>
                <th className="px-2 py-2 font-medium">Match</th>
                <th className="px-2 py-2 font-medium">Fixture</th>
                <th className="px-2 py-2 font-medium">Market</th>
                <th className="px-2 py-2 font-medium">Selection</th>
                <th className="px-2 py-2 font-medium">Odds</th>
                <th className="px-2 py-2 font-medium">Score</th>
                <th className="px-2 py-2 font-medium">Result</th>
                <th className="px-2 py-2 font-medium">P/L</th>
                <th className="px-2 py-2 font-medium">ROI</th>
                <th className="px-2 py-2 font-medium">Grade</th>
                <th className="px-2 py-2 font-medium">Weight</th>
              </tr>
            </thead>
            <tbody>
              {data.records.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-2 py-4 text-zinc-400">
                    尚無明細
                  </td>
                </tr>
              ) : (
                data.records.map((row) => (
                  <tr
                    key={`${row.matchId}-${row.market}-${row.selection}`}
                    className="border-b border-zinc-100 dark:border-zinc-900"
                  >
                    <td className="px-2 py-2 whitespace-nowrap">{row.matchDate}</td>
                    <td className="px-2 py-2">{row.league}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {row.homeTeam} vs {row.awayTeam}
                    </td>
                    <td className="px-2 py-2">{row.fixtureId ?? "—"}</td>
                    <td className="px-2 py-2">{row.market}</td>
                    <td className="px-2 py-2">{row.selection}</td>
                    <td className="px-2 py-2">{formatNumber(row.odds)}</td>
                    <td className="px-2 py-2">{row.finalScore ?? "—"}</td>
                    <td className="px-2 py-2">{row.verificationResult}</td>
                    <td className="px-2 py-2">{formatNumber(row.profit)}</td>
                    <td className="px-2 py-2">{formatPercent(row.roi)}</td>
                    <td className="px-2 py-2">{row.recommendationGrade}</td>
                    <td className="px-2 py-2">{row.weightVersion}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
