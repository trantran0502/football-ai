import type { OperationsDashboardSnapshot } from "@/lib/admin/operationsDashboardTypes";

function formatPercent(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return `${value.toFixed(2)}%`;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleString("zh-TW");
}

function StatusBadge(props: { label: string; tone?: "ok" | "warn" | "neutral" }) {
  const toneClass =
    props.tone === "ok"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      : props.tone === "warn"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
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

function OnOffBadge(props: { enabled: boolean }) {
  return (
    <StatusBadge
      label={props.enabled ? "ON" : "OFF"}
      tone={props.enabled ? "warn" : "neutral"}
    />
  );
}

export function OperationsDashboard(props: { snapshot: OperationsDashboardSnapshot }) {
  const { snapshot } = props;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
        唯讀 Operations Dashboard。此頁面僅監控系統狀態，不會修改 Recommendation、Decision、Learning、Replay、Scheduler、Parser、Weight 或 Evidence。
      </div>

      <SectionCard title="Scheduler">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="今日抓取場次"
            value={String(snapshot.scheduler.fixturesFetchedToday)}
            hint={`Run date: ${snapshot.scheduler.runDate}`}
          />
          <MetricCard label="成功" value={String(snapshot.scheduler.successCount)} />
          <MetricCard label="失敗" value={String(snapshot.scheduler.failureCount)} />
          <MetricCard
            label="Scheduler"
            value={snapshot.scheduler.enabled ? "ENABLED" : "DISABLED"}
            hint={`Health: ${snapshot.scheduler.health}`}
          />
        </div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="text-zinc-500">下一次 Daily：</span>
            {formatDateTime(snapshot.scheduler.nextDailyRun)}
          </div>
          <div>
            <span className="text-zinc-500">下一次 Result：</span>
            {formatDateTime(snapshot.scheduler.nextResultRun)}
          </div>
        </div>
        <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Data Completeness（今日）
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Inserted"
              value={String(snapshot.scheduler.dataCompleteness.inserted)}
            />
            <MetricCard
              label="Duplicate Skipped"
              value={String(snapshot.scheduler.dataCompleteness.duplicateSkipped)}
            />
            <MetricCard
              label="Backfill Enriched"
              value={String(snapshot.scheduler.dataCompleteness.historicalBackfillEnriched)}
            />
            <MetricCard
              label="Incomplete Rejected"
              value={String(snapshot.scheduler.dataCompleteness.incompleteAnalysisRejected)}
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Conflicting"
              value={String(snapshot.scheduler.dataCompleteness.conflictingRecords)}
            />
            <MetricCard
              label="Odds Missing"
              value={String(snapshot.scheduler.dataCompleteness.oddsMissing)}
            />
            <MetricCard
              label="Settleable Market Missing"
              value={String(snapshot.scheduler.dataCompleteness.settleableMarketMissing)}
            />
            <MetricCard
              label="Snapshot Missing"
              value={String(snapshot.scheduler.dataCompleteness.analysisSnapshotMissing)}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Production">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Legacy 今日分析"
            value={String(snapshot.production.legacyAnalyzedToday)}
          />
          <MetricCard
            label="Decision Shadow 今日分析"
            value={String(snapshot.production.decisionShadowAnalyzedToday)}
            hint={
              snapshot.production.decisionShadowEnabled ||
              snapshot.production.dualWriteEnabled
                ? "Shadow path active"
                : "Shadow OFF"
            }
          />
          <MetricCard
            label="Agreement %"
            value={formatPercent(snapshot.production.agreementPercent)}
            hint="Replay validation cumulative"
          />
          <MetricCard
            label="Dual Write"
            value={snapshot.production.dualWriteEnabled ? "ON" : "OFF"}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <OnOffBadge enabled={snapshot.production.evidenceShadowEnabled} />
          <span className="text-xs text-zinc-500 self-center">Evidence Shadow</span>
          <OnOffBadge enabled={snapshot.production.decisionShadowEnabled} />
          <span className="text-xs text-zinc-500 self-center">Decision Shadow</span>
        </div>
      </SectionCard>

      <SectionCard title="Replay">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Eligible"
            value={String(snapshot.replay.eligibleRecords)}
          />
          <MetricCard
            label="VERIFIED 累積"
            value={String(snapshot.replay.verifiedTotal)}
          />
          <MetricCard
            label="Replay 狀態"
            value={snapshot.replay.replayVerdict}
          />
          <MetricCard
            label="Validation 更新"
            value={formatDateTime(snapshot.replay.replayGeneratedAt)}
          />
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Total records in last replay run: {snapshot.replay.totalRecords}
        </p>
      </SectionCard>

      <SectionCard title="Provider">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-zinc-100 p-4 dark:border-zinc-900">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">API-Football</h3>
              <StatusBadge label={snapshot.provider.apiFootball.health} />
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Quota: {snapshot.provider.apiFootball.usedToday} used /{" "}
              {snapshot.provider.apiFootball.remainingToday} remaining
            </p>
            <p className="text-xs text-zinc-500">
              Minute: {snapshot.provider.apiFootball.minuteUsed} /{" "}
              {snapshot.provider.apiFootball.minuteLimit}
            </p>
          </div>

          <div className="space-y-3 rounded-lg border border-zinc-100 p-4 dark:border-zinc-900">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Google Search</h3>
              <StatusBadge label={snapshot.provider.googleSearch.health} />
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Searches: {snapshot.provider.googleSearch.searchesToday}
              {snapshot.provider.googleSearch.remainingToday !== null
                ? ` / ${snapshot.provider.googleSearch.remainingToday} remaining`
                : ""}
            </p>
          </div>

          <div className="space-y-3 rounded-lg border border-zinc-100 p-4 dark:border-zinc-900">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Supabase</h3>
              <StatusBadge label={snapshot.provider.supabase.health} />
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {snapshot.provider.supabase.configured ? "Configured" : "Not configured"} ·{" "}
              {snapshot.provider.supabase.connected ? "Connected" : "Disconnected"}
            </p>
            <p className="text-xs text-zinc-500">
              match_records: {snapshot.provider.supabase.matchRecords}
            </p>
          </div>

          <div className="space-y-3 rounded-lg border border-zinc-100 p-4 dark:border-zinc-900">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Scheduler Health</h3>
              <StatusBadge label={snapshot.provider.scheduler.health} />
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Scheduler {snapshot.provider.scheduler.enabled ? "enabled" : "disabled"}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Decision">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Shadow"
            value={snapshot.decision.shadowEnabled ? "ON" : "OFF"}
          />
          <MetricCard
            label="Dual Write"
            value={snapshot.decision.dualWriteEnabled ? "ON" : "OFF"}
          />
          <MetricCard
            label="Weight Version"
            value={
              snapshot.decision.weightVersion === null
                ? "—"
                : String(snapshot.decision.weightVersion)
            }
          />
          <MetricCard
            label="Weight Source"
            value={snapshot.decision.weightSource.toUpperCase()}
            hint={`Catalog ${snapshot.decision.catalogVersion}`}
          />
        </div>
      </SectionCard>

      <SectionCard title="Evidence">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Catalog Version"
            value={snapshot.evidence.catalogVersion}
          />
          <MetricCard
            label="Shadow"
            value={snapshot.evidence.shadowEnabled ? "ON" : "OFF"}
          />
          <MetricCard label="Collected" value={snapshot.evidence.collectedLabel} />
          <MetricCard label="Missing / Blocked" value="Per-run shadow only" />
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Supported IDs: {snapshot.evidence.supportedEvidenceIds.join(", ")}
        </p>
      </SectionCard>

      <SectionCard title="System">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard label="Version" value={snapshot.system.version} />
          <MetricCard
            label="Git Commit"
            value={snapshot.system.gitCommit?.slice(0, 12) ?? "—"}
            hint={snapshot.system.gitCommit ?? undefined}
          />
          <MetricCard label="Build" value={snapshot.system.buildStatus} />
          <MetricCard
            label="Last Validation"
            value={formatDateTime(snapshot.system.lastDeploy)}
          />
          <MetricCard label="Environment" value={snapshot.system.environment} />
          <MetricCard
            label="System Validation"
            value={snapshot.system.systemValidationStatus ?? "—"}
          />
        </div>
      </SectionCard>
    </div>
  );
}
