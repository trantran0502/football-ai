"use client";

import Link from "next/link";
import type {
  PerformanceBucketStats,
  PerformanceCenterReport,
  PerformanceHighlight,
  PerformanceHitRateTrend,
  PerformancePeriodStats,
  PerformanceRecentPick,
} from "@/lib/performance/performanceTypes";

interface AiPerformanceCenterSectionProps {
  report: PerformanceCenterReport | null;
  loading: boolean;
  error: string | null;
  showAdminLink?: boolean;
}

function formatHitRate(hitRate: number | null): string {
  if (hitRate === null) {
    return "—";
  }
  return `${Math.round(hitRate * 1000) / 10}%`;
}

function formatRoi(roi: number | null): string {
  if (roi === null) {
    return "—";
  }
  const percent = Math.round(roi * 1000) / 10;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent}%`;
}

function formatTrendDelta(trend: PerformanceHitRateTrend): string {
  if (trend.delta === null) {
    return "";
  }
  const percent = Math.round(Math.abs(trend.delta) * 1000) / 10;
  const sign = trend.delta > 0 ? "+" : trend.delta < 0 ? "-" : "";
  if (trend.direction === "up") {
    return `↗ ${sign}${percent}%`;
  }
  if (trend.direction === "down") {
    return `↘ ${sign}${percent}%`;
  }
  return "→ 0%";
}

function formatUpdatedAt(value: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-TW");
}

function outcomeLabel(outcome: PerformanceRecentPick["outcome"]): string {
  switch (outcome) {
    case "hit":
      return "🟢 命中";
    case "miss":
      return "🔴 未命中";
    default:
      return "🟡 待驗證";
  }
}

function HighlightCard({
  title,
  highlight,
  emptyLabel,
}: {
  title: string;
  highlight: PerformanceHighlight | null;
  emptyLabel: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      {highlight ? (
        <>
          <p className="mt-2 text-xl font-bold text-slate-900">{highlight.label}</p>
          <p className="mt-1 text-lg font-semibold text-indigo-700">
            {formatHitRate(highlight.hitRate)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {highlight.hits}/{highlight.hits + highlight.misses} 命中 · ROI{" "}
            {formatRoi(highlight.roi)}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-slate-500">{emptyLabel}</p>
      )}
    </div>
  );
}

function PeriodCard({
  title,
  stats,
  trend,
}: {
  title: string;
  stats: PerformancePeriodStats;
  trend?: PerformanceHitRateTrend;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-500">推薦</dt>
          <dd className="font-semibold text-slate-900">{stats.recommendations}</dd>
        </div>
        <div>
          <dt className="text-slate-500">命中</dt>
          <dd className="font-semibold text-emerald-700">{stats.hits}</dd>
        </div>
        <div>
          <dt className="text-slate-500">失敗</dt>
          <dd className="font-semibold text-rose-700">{stats.misses}</dd>
        </div>
        <div>
          <dt className="text-slate-500">命中率</dt>
          <dd className="font-semibold text-indigo-700">
            {formatHitRate(stats.hitRate)}
            {trend?.delta !== null && trend?.direction ? (
              <span
                className={`ml-2 text-xs font-medium ${
                  trend.direction === "up"
                    ? "text-emerald-600"
                    : trend.direction === "down"
                      ? "text-rose-600"
                      : "text-slate-500"
                }`}
              >
                {formatTrendDelta(trend)}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">ROI</dt>
          <dd className="font-semibold text-amber-700">{formatRoi(stats.roi)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">淨收益</dt>
          <dd className="font-semibold text-slate-900">
            {stats.totalStake > 0 ? `${stats.profit >= 0 ? "+" : ""}${stats.profit.toFixed(2)}` : "—"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function BucketTable({
  title,
  rows,
  showMisses = false,
}: {
  title: string;
  rows: PerformanceBucketStats[];
  showMisses?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">尚無資料</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-2 py-2">項目</th>
                <th className="px-2 py-2">推薦數</th>
                <th className="px-2 py-2">命中數</th>
                {showMisses ? <th className="px-2 py-2">失敗</th> : null}
                <th className="px-2 py-2">命中率</th>
                <th className="px-2 py-2">ROI</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-slate-100">
                  <td className="px-2 py-2 font-medium text-slate-900">{row.label}</td>
                  <td className="px-2 py-2">{row.recommendations}</td>
                  <td className="px-2 py-2">{row.hits}</td>
                  {showMisses ? <td className="px-2 py-2">{row.misses}</td> : null}
                  <td className="px-2 py-2">{formatHitRate(row.hitRate)}</td>
                  <td className="px-2 py-2">{formatRoi(row.roi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AiPerformanceCenterSection({
  report,
  loading,
  error,
  showAdminLink = false,
}: AiPerformanceCenterSectionProps) {
  return (
    <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-sky-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">📊 AI 績效中心</h2>
          <p className="mt-1 text-sm text-slate-600">
            統計來源：daily_recommendations + match_records + verification_result
          </p>
        </div>
        {showAdminLink ? (
          <Link
            href="/admin/performance"
            className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
          >
            Admin 完整檢視
          </Link>
        ) : null}
      </div>

      {loading ? <p className="mt-4 text-sm text-slate-500">載入績效資料中…</p> : null}

      {error ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {!loading && !error && report ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800">🤖 AI 戰績</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-xs text-slate-500">目前連勝</p>
                <p className="text-2xl font-bold text-emerald-700">
                  {report.streaks.currentWinStreak}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">最高連勝</p>
                <p className="text-2xl font-bold text-indigo-700">
                  {report.streaks.maxWinStreak}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">目前 AI 最擅長</p>
                <p className="text-lg font-bold text-slate-900">
                  {report.bestLeague?.label ?? "—"}
                </p>
                {report.bestLeague ? (
                  <p className="text-sm font-medium text-indigo-700">
                    {formatHitRate(report.bestLeague.hitRate)}
                  </p>
                ) : null}
              </div>
              <div>
                <p className="text-xs text-slate-500">最佳玩法</p>
                <p className="text-lg font-bold text-slate-900">
                  {report.bestMarket?.label ?? "—"}
                </p>
                {report.bestMarket ? (
                  <p className="text-sm font-medium text-indigo-700">
                    {formatHitRate(report.bestMarket.hitRate)}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-indigo-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800">總績效</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
              <div>
                <p className="text-xs text-slate-500">總推薦數</p>
                <p className="text-lg font-bold text-slate-900">
                  {report.total.recommendations}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">總命中</p>
                <p className="text-lg font-bold text-emerald-700">{report.total.hits}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">總失敗</p>
                <p className="text-lg font-bold text-rose-700">{report.total.misses}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">命中率</p>
                <p className="text-lg font-bold text-indigo-700">
                  {formatHitRate(report.total.hitRate)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">ROI</p>
                <p className="text-lg font-bold text-amber-700">
                  {formatRoi(report.total.roi)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">淨收益</p>
                <p className="text-lg font-bold text-slate-900">
                  {report.total.totalStake > 0
                    ? `${report.total.profit >= 0 ? "+" : ""}${report.total.profit.toFixed(2)}`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">最近更新</p>
                <p className="text-sm font-medium text-slate-900">
                  {formatUpdatedAt(report.total.lastUpdatedAt)}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <HighlightCard
              title="最佳聯賽"
              highlight={report.bestLeague}
              emptyLabel="樣本不足（至少 3 筆已結算）"
            />
            <HighlightCard
              title="最佳玩法"
              highlight={report.bestMarket}
              emptyLabel="樣本不足（至少 3 筆已結算）"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <PeriodCard title="昨天" stats={report.yesterday} />
            <PeriodCard title="近 7 天" stats={report.last7Days} />
            <PeriodCard
              title="近 30 天"
              stats={report.last30Days}
              trend={report.hitRateTrend}
            />
            <PeriodCard title="全部歷史" stats={report.allTime} />
          </div>

          {report.hitRateTrend.delta !== null ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <span className="font-semibold">命中率趨勢：</span>
              {report.hitRateTrend.periodLabel} {formatHitRate(report.hitRateTrend.hitRate)}{" "}
              <span
                className={
                  report.hitRateTrend.direction === "up"
                    ? "font-semibold text-emerald-700"
                    : report.hitRateTrend.direction === "down"
                      ? "font-semibold text-rose-700"
                      : "font-semibold text-slate-600"
                }
              >
                {formatTrendDelta(report.hitRateTrend)}
              </span>
              {report.hitRateTrend.previousHitRate !== null ? (
                <span className="text-slate-600">
                  {" "}
                  （前 30 天 {formatHitRate(report.hitRateTrend.previousHitRate)}）
                </span>
              ) : null}
            </div>
          ) : null}

          <BucketTable title="依聯賽統計" rows={report.byLeague} />
          <BucketTable title="依玩法統計" rows={report.byMarket} />
          <BucketTable title="AI 推薦等級統計" rows={report.byGrade} />

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800">最近 20 筆推薦</h3>
            {report.recent.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">尚無推薦紀錄</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="px-2 py-2">日期</th>
                      <th className="px-2 py-2">聯賽</th>
                      <th className="px-2 py-2">比賽</th>
                      <th className="px-2 py-2">玩法</th>
                      <th className="px-2 py-2">賠率</th>
                      <th className="px-2 py-2">AI 分數</th>
                      <th className="px-2 py-2">信心</th>
                      <th className="px-2 py-2">結果</th>
                      <th className="px-2 py-2">Replay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.recent.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="px-2 py-2 whitespace-nowrap">{item.matchDate}</td>
                        <td className="px-2 py-2">{item.leagueName}</td>
                        <td className="px-2 py-2">{item.matchLabel}</td>
                        <td className="px-2 py-2">
                          <div>{item.market}</div>
                          <div className="text-emerald-700">{item.recommendation}</div>
                        </td>
                        <td className="px-2 py-2">{item.odds.toFixed(2)}</td>
                        <td className="px-2 py-2">{item.score}</td>
                        <td className="px-2 py-2">{item.confidence}%</td>
                        <td className="px-2 py-2 whitespace-nowrap">{outcomeLabel(item.outcome)}</td>
                        <td className="px-2 py-2">
                          {item.replayId ? (
                            <Link
                              href={`/replay/${encodeURIComponent(item.replayId)}`}
                              className="font-medium text-emerald-700 hover:underline"
                            >
                              Replay
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
