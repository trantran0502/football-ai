import { buildAdminDashboardResponse } from "@/lib/admin/adminDashboardService";
import { runAutomatedLearningPipeline } from "@/lib/admin/recommendationPipelineService";
import { SystemOverviewPanel } from "@/components/admin/RecommendationPipelinePanels";
import type { ValidationMetricBucket } from "@/lib/validation/validationTypes";
import type { EvidencePerformanceStats } from "@/lib/evidence/evidenceValidation";

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

function PerformanceRankingTable(props: {
  title: string;
  rows: Array<{
    key: string;
    usageCount: number;
    hitRate: number;
    roi: number;
    extra?: string;
  }>;
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
              <th className="px-2 py-2">使用次數</th>
              <th className="px-2 py-2">勝率</th>
              <th className="px-2 py-2">ROI</th>
              {props.rows.some((row) => row.extra) ? (
                <th className="px-2 py-2">貢獻分數</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => (
              <tr key={row.key} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="px-2 py-2 font-medium">{row.key}</td>
                <td className="px-2 py-2">{row.usageCount}</td>
                <td className="px-2 py-2">{formatPercent(row.hitRate)}</td>
                <td className="px-2 py-2">{formatPercent(row.roi)}</td>
                {props.rows.some((item) => item.extra) ? (
                  <td className="px-2 py-2">{row.extra ?? "—"}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EvidenceRankingTable(props: {
  title: string;
  rows: EvidencePerformanceStats[];
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
              <th className="px-2 py-2">Provider</th>
              <th className="px-2 py-2">使用次數</th>
              <th className="px-2 py-2">命中率</th>
              <th className="px-2 py-2">平均影響分數</th>
              <th className="px-2 py-2">平均信心</th>
              <th className="px-2 py-2">ROI</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => (
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
  );
}

function BucketTable(props: {
  title: string;
  rows: Array<{ key: string; bucket: ValidationMetricBucket }>;
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
              <th className="px-2 py-2">勝率</th>
              <th className="px-2 py-2">ROI</th>
              <th className="px-2 py-2">平均賠率</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => (
              <tr key={row.key} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="px-2 py-2 font-medium">{row.key}</td>
                <td className="px-2 py-2">{row.bucket.sampleSize}</td>
                <td className="px-2 py-2">{formatPercent(row.bucket.hitRate)}</td>
                <td className="px-2 py-2">{formatPercent(row.bucket.roi)}</td>
                <td className="px-2 py-2">{row.bucket.averageOdds.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function AdminDashboardPage() {
  const [dashboard, pipelineSnapshot] = await Promise.all([
    buildAdminDashboardResponse(),
    runAutomatedLearningPipeline(),
  ]);

  const marketRows = Object.entries(dashboard.byMarket).map(([key, bucket]) => ({
    key,
    bucket,
  }));
  const leagueRows = Object.entries(dashboard.byLeague)
    .sort((left, right) => right[1].roi - left[1].roi)
    .map(([key, bucket]) => ({ key, bucket }));
  const featureRows = Object.entries(dashboard.byFeature)
    .sort((left, right) => right[1].roi - left[1].roi)
    .map(([key, bucket]) => ({ key, bucket }));
  const ruleRows = Object.entries(dashboard.byRule)
    .sort((left, right) => right[1].sampleSize - left[1].sampleSize)
    .map(([key, bucket]) => ({ key, bucket }));

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wide text-zinc-500">V2.0</p>
          <h1 className="text-3xl font-bold">AI Admin Dashboard</h1>
          <p className="text-sm text-zinc-500">
            更新時間：{new Date(dashboard.generatedAt).toLocaleString("zh-TW")}
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <a href="/admin/system-health" className="text-emerald-700 hover:underline dark:text-emerald-400">
              System Health
            </a>
            <a href="/admin/recommendation-learning-backfill" className="text-emerald-700 hover:underline dark:text-emerald-400">
              Learning Backfill
            </a>
            <a href="/admin/weight-optimizer" className="text-emerald-700 hover:underline dark:text-emerald-400">
              Weight Optimizer
            </a>
          </div>
        </header>

        <SystemOverviewPanel snapshot={pipelineSnapshot} />

        <section>
          <h2 className="mb-3 text-lg font-semibold">系統狀態</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="API-Football 今日 Request"
              value={`${dashboard.system.apiFootball.usedToday} / ${dashboard.system.apiFootball.usedToday + dashboard.system.apiFootball.remainingToday}`}
              hint={`剩餘 ${dashboard.system.apiFootball.remainingToday}`}
            />
            <MetricCard
              label="Google Gemini 今日 Search"
              value={String(dashboard.system.googleGemini.searchesToday)}
              hint={
                dashboard.system.googleGemini.remainingToday !== null
                  ? `剩餘 ${dashboard.system.googleGemini.remainingToday}`
                  : "額度未知"
              }
            />
            <MetricCard
              label="Supabase"
              value={dashboard.system.supabase.connected ? "Connected" : "Disconnected"}
              hint={`match_records ${dashboard.system.supabase.tables.match_records}`}
            />
            <MetricCard
              label="Cache 命中率"
              value={formatPercent(dashboard.system.cache.hitRate)}
              hint={`${dashboard.system.cache.hits} hit / ${dashboard.system.cache.misses} miss`}
            />
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            最近同步：{dashboard.system.lastSyncAt ?? "尚未同步"}
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">分析狀態</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="今日分析" value={String(dashboard.analysis.analyzedToday)} />
            <MetricCard label="今日推薦" value={String(dashboard.analysis.recommendedToday)} />
            <MetricCard label="今日 PASS" value={String(dashboard.analysis.passToday)} />
            <MetricCard label="待驗證" value={String(dashboard.analysis.pendingCount)} />
            <MetricCard label="已驗證" value={String(dashboard.analysis.verifiedCount)} />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Decision Distribution</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="PASS %"
              value={formatPercent(dashboard.decision.passPercent)}
              hint={`樣本 ${dashboard.decision.sampleSize}`}
            />
            <MetricCard label="WATCH %" value={formatPercent(dashboard.decision.watchPercent)} />
            <MetricCard label="BET %" value={formatPercent(dashboard.decision.betPercent)} />
            <MetricCard
              label="Strong Bet %"
              value={formatPercent(dashboard.decision.strongBetPercent)}
            />
            <MetricCard
              label="平均 Decision Score"
              value={dashboard.decision.averageDecisionScore.toFixed(0)}
            />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="Score: Avoid"
              value={String(dashboard.decision.scoreDistribution.Avoid)}
            />
            <MetricCard
              label="Score: Weak"
              value={String(dashboard.decision.scoreDistribution.Weak)}
            />
            <MetricCard
              label="Score: Average"
              value={String(dashboard.decision.scoreDistribution.Average)}
            />
            <MetricCard
              label="Score: Good"
              value={String(dashboard.decision.scoreDistribution.Good)}
            />
            <MetricCard
              label="Score: Excellent"
              value={String(dashboard.decision.scoreDistribution.Excellent)}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Decision Validation ROI</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="PASS ROI"
              value={formatPercent(dashboard.decision.validation.passRoi)}
            />
            <MetricCard
              label="WATCH ROI"
              value={formatPercent(dashboard.decision.validation.watchRoi)}
            />
            <MetricCard
              label="BET ROI"
              value={formatPercent(dashboard.decision.validation.betRoi)}
            />
            <MetricCard
              label="Strong Bet ROI"
              value={formatPercent(dashboard.decision.validation.strongBetRoi)}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Betting Intelligence</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <MetricCard
              label="今日 Value Bet"
              value={String(dashboard.bettingIntelligence.valueBetToday)}
              hint={`樣本 ${dashboard.bettingIntelligence.sampleSize}`}
            />
            <MetricCard
              label="平均 EV"
              value={formatPercent(dashboard.bettingIntelligence.averageExpectedValue)}
            />
            <MetricCard
              label="CLV"
              value={
                dashboard.bettingIntelligence.averageClosingLineValue !== null
                  ? formatPercent(dashboard.bettingIntelligence.averageClosingLineValue)
                  : "—"
              }
            />
            <MetricCard
              label="最佳市場"
              value={dashboard.bettingIntelligence.bestMarket ?? "—"}
            />
            <MetricCard
              label="最佳莊家"
              value={dashboard.bettingIntelligence.bestBookmaker ?? "—"}
            />
            <MetricCard
              label="最佳聯賽"
              value={dashboard.bettingIntelligence.bestLeague ?? "—"}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">績效</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <MetricCard label="今日 ROI" value={formatPercent(dashboard.performance.roiToday)} />
            <MetricCard label="7 天 ROI" value={formatPercent(dashboard.performance.roi7d)} />
            <MetricCard label="30 天 ROI" value={formatPercent(dashboard.performance.roi30d)} />
            <MetricCard label="總 ROI" value={formatPercent(dashboard.performance.roiTotal)} />
            <MetricCard label="總 Hit Rate" value={formatPercent(dashboard.performance.hitRateTotal)} />
            <MetricCard
              label="總 Recommendation"
              value={String(dashboard.performance.totalRecommendations)}
            />
          </div>
        </section>

        <BucketTable title="市場統計" rows={marketRows} />
        <BucketTable title="聯賽統計" rows={leagueRows} />
        <BucketTable title="Feature 統計" rows={featureRows} />
        <BucketTable title="Rule 統計" rows={ruleRows} />

        <section>
          <h2 className="mb-3 text-lg font-semibold">Learning Engine（V6）</h2>
          <p className="mb-4 text-sm text-zinc-500">
            樣本：Validation {dashboard.learning.sampleSize.validationEntries} 筆 ·
            已驗證 {dashboard.learning.sampleSize.verifiedMatches} 場 ·
            Decision {dashboard.learning.sampleSize.decisionHistory} 筆
          </p>
          <div className="grid gap-4 xl:grid-cols-2">
            <PerformanceRankingTable
              title="Top 10 Feature"
              rows={dashboard.learning.rankings.topFeatures.map((item) => ({
                key: item.feature,
                usageCount: item.usageCount,
                hitRate: item.hitRate,
                roi: item.roi,
                extra: item.averageContributionScore.toFixed(1),
              }))}
            />
            <PerformanceRankingTable
              title="Worst 10 Feature"
              rows={dashboard.learning.rankings.worstFeatures.map((item) => ({
                key: item.feature,
                usageCount: item.usageCount,
                hitRate: item.hitRate,
                roi: item.roi,
                extra: item.averageContributionScore.toFixed(1),
              }))}
            />
            <PerformanceRankingTable
              title="Top Rule"
              rows={dashboard.learning.rankings.topRules.map((item) => ({
                key: item.rule,
                usageCount: item.usageCount,
                hitRate: item.hitRate,
                roi: item.roi,
              }))}
            />
            <PerformanceRankingTable
              title="Worst Rule"
              rows={dashboard.learning.rankings.worstRules.map((item) => ({
                key: item.rule,
                usageCount: item.usageCount,
                hitRate: item.hitRate,
                roi: item.roi,
              }))}
            />
            <PerformanceRankingTable
              title="League ROI 排名"
              rows={dashboard.learning.rankings.leagueRoiRanking.map((item) => ({
                key: item.key,
                usageCount: item.usageCount,
                hitRate: item.hitRate,
                roi: item.roi,
              }))}
            />
            <PerformanceRankingTable
              title="Market ROI 排名"
              rows={dashboard.learning.rankings.marketRoiRanking.map((item) => ({
                key: item.key,
                usageCount: item.usageCount,
                hitRate: item.hitRate,
                roi: item.roi,
              }))}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Evidence 排名</h2>
          <p className="mb-4 text-sm text-zinc-500">
            樣本 {dashboard.learning.evidencePerformance.sampleSize} 場 ·
            產生於 {dashboard.learning.evidencePerformance.generatedAt}
          </p>
          <div className="grid gap-4 xl:grid-cols-3">
            <EvidenceRankingTable
              title="Accuracy 排名"
              rows={dashboard.learning.rankings.evidenceByAccuracy}
            />
            <EvidenceRankingTable
              title="Confidence 排名"
              rows={dashboard.learning.rankings.evidenceByConfidence}
            />
            <EvidenceRankingTable
              title="Usage 排名"
              rows={dashboard.learning.rankings.evidenceByUsage}
            />
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-3 text-lg font-semibold">AI 建議</h2>
            <div className="space-y-4 text-sm">
              <div>
                <h3 className="font-medium text-emerald-600">提高權重 Feature</h3>
                <ul className="mt-1 list-disc pl-5 text-zinc-600 dark:text-zinc-300">
                  {(dashboard.learning.suggestions.increaseWeightFeatures.length > 0
                    ? dashboard.learning.suggestions.increaseWeightFeatures
                    : dashboard.aiSuggestions.increaseWeightFeatures
                  ).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-amber-600">降低權重 Feature</h3>
                <ul className="mt-1 list-disc pl-5 text-zinc-600 dark:text-zinc-300">
                  {(dashboard.learning.suggestions.decreaseWeightFeatures.length > 0
                    ? dashboard.learning.suggestions.decreaseWeightFeatures
                    : dashboard.aiSuggestions.decreaseWeightFeatures
                  ).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-rose-600">建議停用 Rule</h3>
                <ul className="mt-1 list-disc pl-5 text-zinc-600 dark:text-zinc-300">
                  {(dashboard.learning.suggestions.disableRules.length > 0
                    ? dashboard.learning.suggestions.disableRules
                    : dashboard.aiSuggestions.disableRules
                  ).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-sky-600">建議新增 Rule</h3>
                <ul className="mt-1 list-disc pl-5 text-zinc-600 dark:text-zinc-300">
                  {(dashboard.learning.suggestions.suggestedNewRules.length > 0
                    ? dashboard.learning.suggestions.suggestedNewRules
                    : dashboard.aiSuggestions.suggestedNewRules
                  ).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-3 text-lg font-semibold">錯誤監控（最近 100 筆）</h2>
            <div className="max-h-96 space-y-2 overflow-y-auto text-sm">
              {dashboard.recentErrors.length === 0 ? (
                <p className="text-zinc-500">目前沒有錯誤紀錄</p>
              ) : (
                dashboard.recentErrors.map((error) => (
                  <div
                    key={error.id}
                    className="rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-900"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium uppercase text-zinc-500">
                        {error.category}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {new Date(error.createdAt).toLocaleString("zh-TW")}
                      </span>
                    </div>
                    <p className="mt-1 text-zinc-700 dark:text-zinc-200">{error.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
