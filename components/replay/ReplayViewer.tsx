"use client";

import { useMemo, useState } from "react";
import type {
  ReplayDataSource,
  ReplayFeatureRemovalSimulation,
  ReplayResponse,
} from "@/lib/replay/replayTypes";

const SOURCE_LABELS: Record<ReplayDataSource, string> = {
  api: "API",
  "api-football": "API-Football",
  google: "Google",
  cache: "Cache",
  mock: "Mock",
  hybrid: "Hybrid",
  "team-profile": "Team Profile",
  "match-records": "Match Records",
  unavailable: "Unavailable",
  unknown: "Unknown",
};

function SourceBadge(props: { source: ReplayDataSource }) {
  const colors: Record<ReplayDataSource, string> = {
    api: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
    "api-football": "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
    google: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    cache: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    mock: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200",
    hybrid: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
    "team-profile": "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
    "match-records": "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
    unavailable: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
    unknown: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[props.source]}`}
    >
      {SOURCE_LABELS[props.source]}
    </span>
  );
}

function JsonBlock(props: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
      {JSON.stringify(props.value, null, 2)}
    </pre>
  );
}

function StepSection(props: {
  step: number;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Step {props.step}
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {props.title}
          </h2>
        </div>
        <span className="text-sm text-zinc-400">{open ? "收起" : "展開"}</span>
      </button>
      {open ? (
        <div className="border-t border-zinc-100 px-5 py-4 dark:border-zinc-900">
          {props.children}
        </div>
      ) : null}
    </section>
  );
}

function FeatureRemovalTable(props: { rows: ReplayFeatureRemovalSimulation[] }) {
  if (props.rows.length === 0) {
    return <p className="text-sm text-zinc-500">無 Feature 模擬資料</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
            <th className="px-2 py-2">Feature</th>
            <th className="px-2 py-2">原始 overallScore</th>
            <th className="px-2 py-2">移除後 overallScore</th>
            <th className="px-2 py-2">Delta</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={row.featureId} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="px-2 py-2 font-mono text-xs">{row.featureId}</td>
              <td className="px-2 py-2">{row.originalOverallScore.toFixed(2)}</td>
              <td className="px-2 py-2">{row.simulatedOverallScore.toFixed(2)}</td>
              <td
                className={`px-2 py-2 font-medium ${
                  row.delta > 0
                    ? "text-emerald-600"
                    : row.delta < 0
                      ? "text-red-600"
                      : "text-zinc-500"
                }`}
              >
                {row.delta > 0 ? "+" : ""}
                {row.delta.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReplayViewer(props: { replay: ReplayResponse }) {
  const { replay } = props;
  const snapshot = replay.snapshot;
  const { raw, providers, features, fusion, recommendation, decisionReplay, marketReplay, validation } =
    snapshot;

  const featureMap = useMemo(
    () => new Map(features.map((feature) => [feature.id, feature])),
    [features]
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8">
      <header className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Case Replay</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          {snapshot.match.homeTeam} vs {snapshot.match.awayTeam}
        </h1>
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-zinc-600 dark:text-zinc-400">
          <span>Match ID: {snapshot.match.matchId}</span>
          <span>League: {snapshot.match.league || "—"}</span>
          <span>Date: {snapshot.match.matchTime}</span>
          <span>Captured: {snapshot.capturedAt}</span>
        </div>
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          唯讀回放 — 不可修改任何資料
        </p>
      </header>

      <StepSection step={1} title="原始資料" defaultOpen>
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-medium">Cache Source</h3>
            {raw.cacheSource ? (
              <SourceBadge source={raw.cacheSource} />
            ) : (
              <span className="text-sm text-zinc-500">無</span>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">API-Football Raw JSON</h3>
            <JsonBlock value={raw.apiFootballRaw ?? "null"} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">Google Grounding Raw JSON</h3>
            <JsonBlock value={raw.googleGroundingRaw ?? "null"} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">Citations ({raw.citations.length})</h3>
            <JsonBlock value={raw.citations} />
          </div>
        </div>
      </StepSection>

      <StepSection step={2} title="Provider">
        <div className="space-y-3">
          {providers.map((provider) => (
            <details
              key={provider.key}
              className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-900"
            >
              <summary className="cursor-pointer text-sm font-medium">
                {provider.label} <SourceBadge source={provider.source} />
              </summary>
              <div className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                <p>Confidence: {provider.confidence ?? "—"}</p>
                <p>Fetched: {provider.fetchedAt ?? "—"}</p>
                {provider.citations.length > 0 ? (
                  <div>
                    <p className="mb-1 font-medium">Citations</p>
                    <JsonBlock value={provider.citations} />
                  </div>
                ) : null}
                <JsonBlock value={provider.data} />
              </div>
            </details>
          ))}
        </div>
      </StepSection>

      <StepSection step={3} title="Feature">
        <div className="space-y-3">
          {features.map((feature) => (
            <details
              key={feature.id}
              className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-900"
            >
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <span className="font-mono text-xs">{feature.id}</span>
                <SourceBadge source={feature.source} />
                <span className="text-zinc-500">score {feature.score.toFixed(1)}</span>
              </summary>
              <div className="mt-3 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                <p>Category: {feature.category}</p>
                <p>Confidence: {feature.confidence}</p>
                <p>Weight: {feature.weight}</p>
                <p>Explanation: {feature.explanation}</p>
                {feature.metadata ? <JsonBlock value={feature.metadata} /> : null}
              </div>
            </details>
          ))}
        </div>
      </StepSection>

      <StepSection step={4} title="Fusion">
        {fusion ? (
          <div className="space-y-3 text-sm">
            <p>
              overallScore: <strong>{fusion.overallScore.toFixed(2)}</strong>
            </p>
            <p>
              overallConfidence: <strong>{fusion.overallConfidence.toFixed(2)}</strong>
            </p>
            <div>
              <p className="mb-1 font-medium">Strongest Factors</p>
              <JsonBlock value={fusion.strongestFactors} />
            </div>
            <div>
              <p className="mb-1 font-medium">Weakest Factors</p>
              <JsonBlock value={fusion.weakestFactors} />
            </div>
            <div>
              <p className="mb-1 font-medium">Ignored Features</p>
              <JsonBlock value={fusion.ignoredFeatures} />
            </div>
            <div>
              <p className="mb-1 font-medium">Warnings</p>
              <JsonBlock value={fusion.warnings} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">無 Fusion 資料</p>
        )}
      </StepSection>

      <StepSection step={5} title="Recommendation">
        {recommendation ? (
          <div className="space-y-4">
            <p className="text-sm">
              Global PASS:{" "}
              <strong>{recommendation.globalPass ? "PASS" : "有候選"}</strong>
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{recommendation.message}</p>
            {recommendation.candidates.map((candidate, index) => (
              <details
                key={`${candidate.marketType}-${index}`}
                className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-900"
              >
                <summary className="cursor-pointer text-sm font-medium">
                  {candidate.selectionLabel} — {candidate.confidence.toUpperCase()} (EV{" "}
                  {candidate.expectedValue.toFixed(3)})
                </summary>
                <div className="mt-3 space-y-3 text-sm">
                  <div>
                    <p className="mb-1 font-medium text-emerald-700 dark:text-emerald-400">
                      支持 Features ({candidate.supportingFeatures.length})
                    </p>
                    {candidate.supportingFeatures.length === 0 ? (
                      <p className="text-zinc-500">無</p>
                    ) : (
                      <ul className="space-y-1">
                        {candidate.supportingFeatures.map((item) => (
                          <li key={item.featureId} className="flex items-center gap-2">
                            <span>{item.label}</span>
                            <SourceBadge
                              source={featureMap.get(item.featureId)?.source ?? "unknown"}
                            />
                            <span className="text-zinc-500">({item.score.toFixed(1)})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="mb-1 font-medium text-red-700 dark:text-red-400">
                      反對 Features ({candidate.opposingFeatures.length})
                    </p>
                    {candidate.opposingFeatures.length === 0 ? (
                      <p className="text-zinc-500">無</p>
                    ) : (
                      <ul className="space-y-1">
                        {candidate.opposingFeatures.map((item) => (
                          <li key={item.featureId} className="flex items-center gap-2">
                            <span>{item.label}</span>
                            <SourceBadge
                              source={featureMap.get(item.featureId)?.source ?? "unknown"}
                            />
                            <span className="text-zinc-500">({item.score.toFixed(1)})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="mb-1 font-medium">Reasons</p>
                    <JsonBlock value={candidate.reasons} />
                  </div>
                  <div>
                    <p className="mb-1 font-medium">Warnings</p>
                    <JsonBlock value={candidate.warnings} />
                  </div>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">無 Recommendation 資料</p>
        )}
      </StepSection>

      <StepSection step={6} title="Decision Replay">
        {decisionReplay ? (
          <div className="space-y-3 text-sm">
            <p>
              Decision: <strong>{decisionReplay.decision.decision}</strong> · Score{" "}
              <strong>{decisionReplay.decision.decisionScore.toFixed(0)}</strong> (
              {decisionReplay.decision.decisionScoreTier})
            </p>
            <div>
              <p className="mb-1 font-medium">Inputs</p>
              <JsonBlock value={decisionReplay.inputs} />
            </div>
            <div>
              <p className="mb-1 font-medium">Scored Candidates</p>
              <JsonBlock value={decisionReplay.scoredCandidates} />
            </div>
            <div>
              <p className="mb-1 font-medium text-emerald-700">Reasons</p>
              <JsonBlock value={decisionReplay.decision.reasons} />
            </div>
            <div>
              <p className="mb-1 font-medium text-red-700">Objections</p>
              <JsonBlock value={decisionReplay.decision.objections} />
            </div>
            <div>
              <p className="mb-1 font-medium">Explanation</p>
              <JsonBlock value={decisionReplay.decision.explanation} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">無 Decision Replay 資料</p>
        )}
      </StepSection>

      <StepSection step={7} title="Market Replay">
        {marketReplay ? (
          <div className="space-y-3">
            {marketReplay.selections.map((selection) => (
              <details
                key={selection.marketKey}
                className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-900"
              >
                <summary className="cursor-pointer text-sm font-medium">
                  {selection.label} · EV{" "}
                  {selection.latestExpectedValue !== null
                    ? `${(selection.latestExpectedValue * 100).toFixed(2)}%`
                    : "—"}
                </summary>
                <div className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                  <p>
                    Opening / Current / Closing: {selection.openingOdds ?? "—"} /{" "}
                    {selection.currentOdds ?? "—"} / {selection.closingOdds ?? "—"}
                  </p>
                  <div>
                    <p className="mb-1 font-medium">Timeline</p>
                    <JsonBlock value={selection.timeline} />
                  </div>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">無 Market Replay 資料</p>
        )}
      </StepSection>

      <StepSection step={8} title="Validation">
        {validation ? (
          <div className="space-y-3 text-sm">
            <p>
              ROI: <strong>{(validation.roi * 100).toFixed(1)}%</strong> · Hit Rate:{" "}
              <strong>{(validation.hitRate * 100).toFixed(1)}%</strong>
            </p>
            <div>
              <p className="mb-1 font-medium">Final Score</p>
              <JsonBlock value={validation.finalScore} />
            </div>
            <div>
              <p className="mb-1 font-medium">Settlement Summary</p>
              <JsonBlock value={validation.settlementSummary} />
            </div>
            <div>
              <p className="mb-1 font-medium">Entries</p>
              <JsonBlock value={validation.entries} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">比賽尚未結束或未驗證</p>
        )}
      </StepSection>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-lg font-semibold">What-If：移除 Feature 對 overallScore 的影響</h2>
        <p className="mb-4 text-sm text-zinc-500">
          唯讀模擬，使用既有 Fusion 引擎重新計算，不修改 Snapshot。
        </p>
        <FeatureRemovalTable rows={replay.featureRemovalSimulations} />
      </section>
    </div>
  );
}
