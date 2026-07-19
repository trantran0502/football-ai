import type {
  SchedulerExecutionMetrics,
  SchedulerStatusSnapshot,
  SchedulerStatusWarning,
} from "@/lib/admin/schedulerStatusTypes";

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleString("zh-TW");
}

function formatValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

function StatusBadge(props: { label: string; tone?: "ok" | "warn" | "critical" | "neutral" }) {
  const toneClass =
    props.tone === "ok"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      : props.tone === "warn"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        : props.tone === "critical"
          ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${toneClass}`}>
      {props.label}
    </span>
  );
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

function ExecutionMetricsTable(props: {
  title: string;
  metrics: SchedulerExecutionMetrics;
}) {
  const rows: Array<{ label: string; value: string | number | boolean | null | undefined }> = [
    { label: "Execution ID", value: props.metrics.executionId },
    { label: "Run Date", value: props.metrics.runDate },
    { label: "Started At", value: formatDateTime(props.metrics.startedAt) },
    { label: "Finished At", value: formatDateTime(props.metrics.finishedAt) },
    { label: "Success", value: props.metrics.success },
    { label: "Status", value: props.metrics.status },
    { label: "fixturesFetched", value: props.metrics.fixturesFetched },
    { label: "pendingCount", value: props.metrics.pendingCount },
    { label: "updatesBuilt", value: props.metrics.updatesBuilt },
    { label: "verified", value: props.metrics.verified },
    { label: "failed", value: props.metrics.failed },
    { label: "skipped", value: props.metrics.skipped },
    { label: "cacheHit", value: props.metrics.cacheHit },
    { label: "fixtureSource", value: props.metrics.fixtureSource },
    { label: "apiFootballRequestCount", value: props.metrics.apiFootballRequestCount },
    { label: "rawFinishedFixtureCount", value: props.metrics.rawFinishedFixtureCount },
    { label: "finishedFixtureCount", value: props.metrics.finishedFixtureCount },
    { label: "scoredFixtureCount", value: props.metrics.scoredFixtureCount },
    { label: "matchedByFixtureId", value: props.metrics.matchedByFixtureId },
    { label: "matchedByFallback", value: props.metrics.matchedByFallback },
    { label: "unmatchedPendingCount", value: props.metrics.unmatchedPendingCount },
    { label: "missingFullTimeScoreCount", value: props.metrics.missingFullTimeScoreCount },
    { label: "missingHalfTimeScoreCount", value: props.metrics.missingHalfTimeScoreCount },
    { label: "quotaSkipped", value: props.metrics.quotaSkipped },
    { label: "Error", value: props.metrics.errorMessage },
  ];

  return (
    <SectionCard title={props.title}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="px-2 py-2 text-zinc-500">{row.label}</td>
                <td className="px-2 py-2 font-medium">{formatValue(row.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function WarningList(props: { warnings: SchedulerStatusWarning[] }) {
  if (props.warnings.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
        目前沒有 Scheduler 異常警告。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {props.warnings.map((warning) => (
        <div
          key={warning.code}
          className={`rounded-xl border p-4 text-sm ${
            warning.severity === "critical"
              ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100"
              : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
          }`}
        >
          <div className="mb-1 flex items-center gap-2">
            <StatusBadge
              label={warning.severity === "critical" ? "CRITICAL" : "WARNING"}
              tone={warning.severity === "critical" ? "critical" : "warn"}
            />
            <span className="font-medium">{warning.code}</span>
          </div>
          <p>{warning.message}</p>
        </div>
      ))}
    </div>
  );
}

export function SchedulerStatusDashboard(props: { snapshot: SchedulerStatusSnapshot }) {
  const { snapshot } = props;

  return (
    <div className="space-y-6">
      <WarningList warnings={snapshot.warnings} />

      <SectionCard title="Cron 排程">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-sm text-zinc-500">Daily Analysis (UTC)</div>
            <div className="mt-1 font-medium">{snapshot.cronSchedule.dailyAnalysisUtc.join(" · ")}</div>
            <div className="mt-2 text-xs text-zinc-400">
              下次：{formatDateTime(snapshot.cronSchedule.nextDailyRun)}
            </div>
          </div>
          <div>
            <div className="text-sm text-zinc-500">Result Update (UTC)</div>
            <div className="mt-1 font-medium">{snapshot.cronSchedule.resultUpdateUtc.join(" · ")}</div>
            <div className="mt-2 text-xs text-zinc-400">
              下次：{formatDateTime(snapshot.cronSchedule.nextResultRun)}
            </div>
          </div>
          <div>
            <div className="text-sm text-zinc-500">Daily Summary</div>
            <div className="mt-1 font-medium">{snapshot.cronSchedule.dailySummaryUtc}</div>
          </div>
          <div>
            <div className="text-sm text-zinc-500">Historical Backfill</div>
            <div className="mt-1 font-medium">{snapshot.cronSchedule.historicalBackfillUtc}</div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="API Quota">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="今日 API 使用量"
            value={`${snapshot.apiUsage.usedToday} / ${snapshot.apiUsage.dailyLimit}`}
            hint={`剩餘 ${snapshot.apiUsage.remainingToday}`}
          />
          <MetricCard
            label="Minute Quota"
            value={`${snapshot.apiUsage.minuteUsed} / ${snapshot.apiUsage.minuteLimit}`}
          />
          <MetricCard label="Run Date" value={snapshot.runDate} />
          <MetricCard
            label="最新錯誤"
            value={snapshot.latestError ? "有" : "無"}
            hint={snapshot.latestError ?? undefined}
          />
        </div>
      </SectionCard>

      <SectionCard title="資料狀態">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="總分析場次" value={String(snapshot.dataStatus.totalAnalyzed)} />
          <MetricCard label="Pending" value={String(snapshot.dataStatus.pending)} />
          <MetricCard label="Verified" value={String(snapshot.dataStatus.verified)} />
          <MetricCard label="Failed" value={String(snapshot.dataStatus.failed)} />
          <MetricCard label="今日新增分析" value={String(snapshot.dataStatus.todayNewAnalysis)} />
          <MetricCard label="今日完成驗證" value={String(snapshot.dataStatus.todayVerified)} />
          <MetricCard
            label="Pending > 24h"
            value={String(snapshot.dataStatus.pendingOver24Hours)}
          />
          <MetricCard
            label="Pending > 48h"
            value={String(snapshot.dataStatus.pendingOver48Hours)}
          />
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <ExecutionMetricsTable title="Daily Analysis（最近一次）" metrics={snapshot.dailyAnalysis} />
        <ExecutionMetricsTable title="Result Update（最近一次）" metrics={snapshot.resultUpdate} />
      </div>

      <SectionCard title="Recent Result Update Runs">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
                <th className="px-2 py-2">Started</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Pending</th>
                <th className="px-2 py-2">Updates</th>
                <th className="px-2 py-2">Verified</th>
                <th className="px-2 py-2">Fixtures</th>
                <th className="px-2 py-2">Finished</th>
                <th className="px-2 py-2">Scored</th>
                <th className="px-2 py-2">Unmatched</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.recentResultRuns.map((entry) => (
                <tr key={entry.executionId ?? entry.startedAt ?? Math.random()} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="px-2 py-2">{formatDateTime(entry.startedAt)}</td>
                  <td className="px-2 py-2">{formatValue(entry.status)}</td>
                  <td className="px-2 py-2">{formatValue(entry.pendingCount)}</td>
                  <td className="px-2 py-2">{formatValue(entry.updatesBuilt)}</td>
                  <td className="px-2 py-2">{formatValue(entry.verified)}</td>
                  <td className="px-2 py-2">{formatValue(entry.fixturesFetched)}</td>
                  <td className="px-2 py-2">{formatValue(entry.finishedFixtureCount)}</td>
                  <td className="px-2 py-2">{formatValue(entry.scoredFixtureCount)}</td>
                  <td className="px-2 py-2">{formatValue(entry.unmatchedPendingCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
