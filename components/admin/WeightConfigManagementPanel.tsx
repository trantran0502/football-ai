"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FEATURE_PROVIDER_KEYS, type FeatureProviderKey } from "@/lib/providers/registry/types";
import {
  activateWeightConfigAction,
  createWeightConfigDraftAction,
  rollbackWeightConfigAction,
} from "@/app/admin/weight-optimizer/actions";
import {
  canActivateVersion,
  canRollbackToVersion,
  canShowRollbackSection,
  formatTimestamp,
  formatWeightPercent,
  getRollbackCandidates,
  type WeightConfigActivePanelData,
  type WeightConfigDraftDefaults,
  validateProviderWeightsForm,
} from "@/lib/admin/weightConfigUiHelpers";
import type { WeightConfigVersion } from "@/lib/recommendation/weightConfigTypes";

function panelClassName(): string {
  return "rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950";
}

function messageClassName(success: boolean): string {
  return success
    ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200"
    : "rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200";
}

function ProviderWeightsEditor(props: {
  weights: Record<FeatureProviderKey, number>;
  disabled: boolean;
  onChange: (key: FeatureProviderKey, value: number) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {FEATURE_PROVIDER_KEYS.map((key) => (
        <label key={key} className="block text-sm">
          <span className="text-zinc-500">{key}</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            disabled={props.disabled}
            value={props.weights[key]}
            onChange={(event) => props.onChange(key, Number(event.target.value))}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      ))}
    </div>
  );
}

function ProviderWeightsDisplay(props: {
  weights: Record<FeatureProviderKey, number>;
}) {
  return (
    <dl className="grid gap-2 text-sm md:grid-cols-2">
      {FEATURE_PROVIDER_KEYS.map((key) => (
        <div key={key}>
          <dt className="text-zinc-500">{key}</dt>
          <dd className="font-medium">{formatWeightPercent(props.weights[key])}</dd>
        </div>
      ))}
    </dl>
  );
}

export function WeightConfigManagementPanel(props: {
  activeConfig: WeightConfigActivePanelData;
  versions: WeightConfigVersion[];
  draftDefaults: WeightConfigDraftDefaults;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [providerWeights, setProviderWeights] = useState(props.draftDefaults.providerWeights);
  const [marketBlendWeight, setMarketBlendWeight] = useState(props.draftDefaults.marketBlendWeight);
  const [rollbackTargetId, setRollbackTargetId] = useState<string>(() => {
    const candidates = getRollbackCandidates(props.versions);
    return candidates[0]?.id ?? "";
  });
  const [statusMessage, setStatusMessage] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const validation = useMemo(
    () => validateProviderWeightsForm(providerWeights, marketBlendWeight),
    [providerWeights, marketBlendWeight]
  );

  const rollbackCandidates = useMemo(
    () => getRollbackCandidates(props.versions),
    [props.versions]
  );

  const showRollback = canShowRollbackSection({
    hasActiveVersion: props.activeConfig.hasActiveVersion,
    versions: props.versions,
  });

  function refreshAfterMutation(result: { success: boolean; message: string }) {
    setStatusMessage({ success: result.success, message: result.message });
    if (result.success) {
      router.refresh();
    }
  }

  function updateProviderWeight(key: FeatureProviderKey, value: number) {
    setProviderWeights((current) => ({
      ...current,
      [key]: Number.isFinite(value) ? value : 0,
    }));
  }

  function handleCreateDraft() {
    if (!validation.valid || isPending) {
      return;
    }

    startTransition(async () => {
      const result = await createWeightConfigDraftAction({
        providerWeights,
        marketBlendWeight,
        sourceReportSnapshot: props.draftDefaults.sourceReportSnapshot,
      });
      refreshAfterMutation(result);
    });
  }

  function handleActivate(version: WeightConfigVersion) {
    if (!canActivateVersion(version) || isPending) {
      return;
    }

    const confirmed = window.confirm(
      "此操作只切換 Weight Config 資料庫狀態，目前不會改變 production 推薦結果。確定要 activate 這個 draft 嗎？"
    );
    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const result = await activateWeightConfigAction(version.id);
      refreshAfterMutation(result);
    });
  }

  function handleRollback() {
    if (!showRollback || isPending) {
      return;
    }

    const target = rollbackCandidates.find((version) => version.id === rollbackTargetId);
    if (!target || !canRollbackToVersion(target)) {
      setStatusMessage({
        success: false,
        message: "請選擇可回復的 archived 版本。",
      });
      return;
    }

    const confirmed = window.confirm(
      `此操作只切換 Weight Config 資料庫狀態，目前不會改變 production 推薦結果。確定要 rollback 到 version ${target.version} 嗎？`
    );
    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const result = await rollbackWeightConfigAction({
        targetVersionId: target.id,
      });
      refreshAfterMutation(result);
    });
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-100">
        <p className="font-semibold">Weight Config · Database lifecycle only</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Analysis Mode</li>
          <li>Not connected to production recommendation runtime</li>
          <li>Activate / rollback 只更新 weight_config_versions，不會套用正式推薦權重</li>
        </ul>
      </div>

      {statusMessage ? (
        <div className={messageClassName(statusMessage.success)}>{statusMessage.message}</div>
      ) : null}

      <section className={panelClassName()}>
        <h2 className="mb-3 text-lg font-semibold">Active Configuration</h2>
        {props.activeConfig.hasActiveVersion && props.activeConfig.activeVersion ? (
          <div className="space-y-4 text-sm">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
              資料庫中存在 active version #{props.activeConfig.activeVersion.version}。
              正式推薦流程仍使用程式預設權重，尚未接線到此 active config。
            </p>
            <dl className="grid gap-3 md:grid-cols-2">
              <div>
                <dt className="text-zinc-500">Source</dt>
                <dd className="font-medium">database</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Version</dt>
                <dd className="font-medium">{props.activeConfig.activeVersion.version}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Market Blend Weight</dt>
                <dd className="font-medium">
                  {formatWeightPercent(props.activeConfig.activeVersion.marketBlendWeight)}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Created By</dt>
                <dd className="font-medium">{props.activeConfig.activeVersion.createdBy}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Created At</dt>
                <dd className="font-medium">
                  {formatTimestamp(props.activeConfig.activeVersion.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Applied At</dt>
                <dd className="font-medium">
                  {formatTimestamp(props.activeConfig.activeVersion.appliedAt)}
                </dd>
              </div>
            </dl>
            <ProviderWeightsDisplay weights={props.activeConfig.activeVersion.providerWeights} />
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              目前正式推薦仍使用程式預設權重，尚無啟用中的資料庫版本。
            </p>
            <dl className="grid gap-3 md:grid-cols-2">
              <div>
                <dt className="text-zinc-500">Source</dt>
                <dd className="font-medium">fallback</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Market Blend Weight</dt>
                <dd className="font-medium">
                  {formatWeightPercent(props.activeConfig.marketBlendWeight)}
                </dd>
              </div>
            </dl>
            <ProviderWeightsDisplay weights={props.activeConfig.providerWeights} />
          </div>
        )}
      </section>

      <section className={panelClassName()}>
        <h2 className="mb-3 text-lg font-semibold">Create Draft</h2>
        <p className="mb-4 text-sm text-zinc-500">
          預設值來自
          {props.draftDefaults.fromOptimizerReport
            ? " 目前 Weight Optimizer 建議權重"
            : " 程式 fallback 預設值（Optimizer 尚無可用樣本）"}
          。Source report snapshot 僅供唯讀保存，不提供 JSON 編輯。
        </p>
        <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <p className="font-medium text-zinc-700 dark:text-zinc-200">Snapshot preview</p>
          <p className="mt-1">
            generatedAt:{" "}
            {"diagnostics" in props.draftDefaults.sourceReportSnapshot &&
            props.draftDefaults.sourceReportSnapshot.diagnostics &&
            typeof props.draftDefaults.sourceReportSnapshot.diagnostics === "object" &&
            props.draftDefaults.sourceReportSnapshot.diagnostics !== null &&
            "generatedAt" in props.draftDefaults.sourceReportSnapshot.diagnostics
              ? String(
                  (
                    props.draftDefaults.sourceReportSnapshot.diagnostics as {
                      generatedAt?: string;
                    }
                  ).generatedAt ?? "—"
                )
              : "fallback-defaults"}
          </p>
        </div>
        <ProviderWeightsEditor
          weights={providerWeights}
          disabled={isPending}
          onChange={updateProviderWeight}
        />
        <label className="mt-4 block text-sm">
          <span className="text-zinc-500">Market Blend Weight</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            disabled={isPending}
            value={marketBlendWeight}
            onChange={(event) => setMarketBlendWeight(Number(event.target.value))}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900 md:max-w-xs"
          />
        </label>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
          Provider weights sum: {validation.sum.toFixed(4)}
          {validation.message ? ` · ${validation.message}` : " · valid"}
        </p>
        <button
          type="button"
          disabled={isPending || !validation.valid}
          onClick={handleCreateDraft}
          className="mt-4 rounded border border-zinc-400 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Create Draft"}
        </button>
      </section>

      <section className={panelClassName()}>
        <h2 className="mb-3 text-lg font-semibold">Version History</h2>
        {props.versions.length === 0 ? (
          <p className="text-sm text-zinc-500">尚無 weight config versions。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
                  <th className="px-2 py-2">Version</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Market Blend</th>
                  <th className="px-2 py-2">Created By</th>
                  <th className="px-2 py-2">Created At</th>
                  <th className="px-2 py-2">Applied At</th>
                  <th className="px-2 py-2">Archived At</th>
                  <th className="px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {props.versions.map((version) => (
                  <tr
                    key={version.id}
                    className="border-b border-zinc-100 align-top dark:border-zinc-900"
                  >
                    <td className="px-2 py-2 font-medium">{version.version}</td>
                    <td className="px-2 py-2">{version.status}</td>
                    <td className="px-2 py-2">
                      {formatWeightPercent(version.marketBlendWeight)}
                    </td>
                    <td className="px-2 py-2">{version.createdBy}</td>
                    <td className="px-2 py-2">{formatTimestamp(version.createdAt)}</td>
                    <td className="px-2 py-2">{formatTimestamp(version.appliedAt)}</td>
                    <td className="px-2 py-2">{formatTimestamp(version.archivedAt)}</td>
                    <td className="px-2 py-2">
                      {canActivateVersion(version) ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleActivate(version)}
                          className="rounded border border-zinc-400 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Activate
                        </button>
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
      </section>

      {showRollback ? (
        <section className={panelClassName()}>
          <h2 className="mb-3 text-lg font-semibold">Rollback</h2>
          <p className="mb-4 text-sm text-zinc-500">
            僅能回復 archived 版本，不允許 rollback 到 draft。
          </p>
          <label className="block text-sm">
            <span className="text-zinc-500">Target archived version</span>
            <select
              disabled={isPending}
              value={rollbackTargetId}
              onChange={(event) => setRollbackTargetId(event.target.value)}
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900 md:max-w-md"
            >
              {rollbackCandidates.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.version} · archived at {formatTimestamp(version.archivedAt)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={isPending || !rollbackTargetId}
            onClick={handleRollback}
            className="mt-4 rounded border border-zinc-400 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Rolling back..." : "Rollback"}
          </button>
        </section>
      ) : null}
    </section>
  );
}
