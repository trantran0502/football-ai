"use client";

import { useEffect, useState } from "react";
import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import { formatAnalysisField } from "@/lib/analysis/analysisField";
import type { AnalysisField } from "@/lib/analysis/analysisField";
import type { AnalysisReport } from "@/lib/analysis/types";
import type { MarketInterpretation } from "@/lib/analysis/types";
import type { MarketSelection, MarketSide, MatchData } from "@/types/match";
import { formatAsianLineRaw } from "@/lib/parser/asianLine";
import { explainAnalysis } from "@/lib/explain";
import type { ExplainReport } from "@/lib/explain";
import {
  clearPersistedHistory,
  loadPersistedHistory,
  persistAnalysisToHistory,
  verifyPersistedMatch,
} from "@/lib/database/browserPersistence";
import type {
  HistoricalMatchRecord,
  MatchHistoryStats,
  MatchStatus,
} from "@/lib/database/matchSchema";
import {
  fetchTeamDataClient,
  formatUnavailableField,
  getStoredApiUsage,
  summarizeTeamForm,
  type ApiUsageInfo,
  type TeamDataPackage,
} from "@/lib/providers/free";
import {
  BETA_DISCLAIMER,
  BETA_EMPTY_MESSAGE,
  clearAllBetaRecommendations,
  computeBetaDashboardStats,
  CURRENT_MODEL_VERSION,
  getBetaRecommendationsByMatch,
  getLatestRollingReport,
  isBetaRecommendationModeEnabled,
  maybeGenerateRollingReport,
  saveBetaRecommendations,
  settleBetaRecommendationsForMatch,
  type BetaCandidate,
  type BetaDashboardStats,
  type RollingEvaluationReport,
} from "@/lib/beta";

const MARKET_TYPE_LABELS: Record<MarketSelection["marketType"], string> = {
  moneyline: "獨贏",
  handicap: "讓分",
  totalGoals: "大小球",
  teamGoals: "單隊進球",
  btts: "BTTS",
  oddEven: "單雙",
  corners: "角球",
  cards: "罰牌",
  correctScore: "波胆",
  halfTimeFullTime: "半全場",
  doubleChance: "雙勝彩",
  firstGoal: "最先入球",
  lastGoal: "最後入球",
  special: "特殊",
};

const SIDE_LABELS: Record<MarketSide, string> = {
  home: "主",
  away: "客",
  over: "大",
  under: "小",
  draw: "和",
  yes: "是",
  no: "否",
  odd: "單",
  even: "雙",
  homeOrDraw: "主或和",
  drawOrAway: "和或客",
  homeOrAway: "主或客",
  none: "無",
};

const CONFIDENCE_LABELS: Record<BetaCandidate["confidenceLevel"], string> = {
  low: "低",
  medium: "中",
  high: "高",
};

function formatHitRate(rate: number, verifiedCount: number): string {
  if (verifiedCount < 20) {
    return "樣本不足";
  }
  return `${Math.round(rate * 100)}%`;
}

function formatRoi(roi: number, verifiedCount: number): string {
  if (verifiedCount < 20) {
    return "樣本不足";
  }
  const sign = roi >= 0 ? "+" : "";
  return `${sign}${Math.round(roi * 100)}%`;
}

function formatFieldLines(
  fields: Array<{ label: string; field: AnalysisField<unknown> }>
): string[] {
  return fields.map(
    ({ label, field }) => `${label}：${formatAnalysisField(field)}`
  );
}

function formatInterpretationFields(
  interpretation: MarketInterpretation
): string[] {
  switch (interpretation.kind) {
    case "moneyline":
      return formatFieldLines([
        { label: "expectedWinner", field: interpretation.expectedWinner },
        { label: "strength", field: interpretation.strength },
        { label: "probabilities", field: interpretation.probabilities },
      ]);
    case "handicap":
      return formatFieldLines([
        { label: "expectedMargin", field: interpretation.expectedMargin },
        { label: "favoredSide", field: interpretation.favoredSide },
        { label: "line", field: interpretation.line },
        { label: "strength", field: interpretation.strength },
      ]);
    case "totalGoals":
      return formatFieldLines([
        { label: "expectedGoals", field: interpretation.expectedGoals },
        { label: "lean", field: interpretation.lean },
        { label: "line", field: interpretation.line },
      ]);
    case "btts":
      return formatFieldLines([
        { label: "bothTeamsLikely", field: interpretation.bothTeamsLikely },
        { label: "yesProbability", field: interpretation.yesProbability },
        { label: "noProbability", field: interpretation.noProbability },
      ]);
    case "generic":
      return formatFieldLines([{ label: "summary", field: interpretation.summary }]);
  }
}

function formatMarketSelection(selection: MarketSelection): string {
  const side = SIDE_LABELS[selection.side] ?? selection.side;
  const lineRaw = selection.rawLine ?? formatAsianLineRaw(selection.line ?? 0, null);
  const linePart =
    selection.line !== null || selection.rawLine
      ? ` ${lineRaw}`
      : selection.label
        ? ` ${selection.label}`
        : "";
  const period = selection.period === "half" ? "[半場] " : "";
  return `${period}${side}${linePart} @ ${selection.odds}`;
}

function groupMarketSelections(
  markets: MarketSelection[]
): Map<string, MarketSelection[]> {
  const groups = new Map<string, MarketSelection[]>();
  for (const selection of markets) {
    const key = `${selection.marketType}::${selection.title}::${selection.period}`;
    const group = groups.get(key) ?? [];
    group.push(selection);
    groups.set(key, group);
  }
  return groups;
}

function DataCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
      <h3 className="mb-4 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-800">
        {title}
      </h3>
      {children}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
      <dt className="w-24 shrink-0 text-xs font-medium text-slate-500">
        {label}
      </dt>
      <dd className="text-sm text-slate-900">{value}</dd>
    </div>
  );
}

function MatchInfo({ match }: { match: MatchData }) {
  return (
    <DataCard title="比賽資訊">
      {match.league && <DataRow label="聯賽" value={match.league} />}
      {match.homeTeam && <DataRow label="主隊" value={match.homeTeam} />}
      {match.awayTeam && <DataRow label="客隊" value={match.awayTeam} />}
    </DataCard>
  );
}

function ParsedMarketsSection({ markets }: { markets: MarketSelection[] }) {
  const grouped = groupMarketSelections(markets);

  if (markets.length === 0) {
    return (
      <DataCard title="1. 解析出的市場">
        <p className="text-sm text-slate-500">未解析到任何市場。</p>
      </DataCard>
    );
  }

  return (
    <DataCard title="1. 解析出的市場">
      <dl className="space-y-3">
        {[...grouped.entries()].map(([key, group]) => {
          const sample = group[0];
          return (
            <DataRow
              key={key}
              label={`${sample.title} (${MARKET_TYPE_LABELS[sample.marketType]})`}
              value={group.map(formatMarketSelection).join("  |  ")}
            />
          );
        })}
      </dl>
    </DataCard>
  );
}

function InterpretationsSection({
  interpretations,
}: {
  interpretations: MarketInterpretation[];
}) {
  if (interpretations.length === 0) {
    return (
      <DataCard title="2. 各市場 Interpretation">
        <p className="text-sm text-slate-500">無解讀結果。</p>
      </DataCard>
    );
  }

  return (
    <DataCard title="2. 各市場 Interpretation">
      <div className="space-y-3">
        {interpretations.map((interpretation) => (
          <div
            key={interpretation.marketId}
            className="rounded-lg border border-slate-200 bg-white p-3"
          >
            <p className="text-sm font-medium text-slate-800">
              {interpretation.title}（{MARKET_TYPE_LABELS[interpretation.marketType]}）
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-600">
              {formatInterpretationFields(interpretation).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </DataCard>
  );
}

function CrossMarketSection({
  validation,
}: {
  validation: AnalysisReport["crossMarketValidation"];
}) {
  const result = validation.moneylineHandicap;
  const rule2 = validation.handicapTotalGoals;
  const rule3 = validation.totalGoalsBtts;

  return (
    <DataCard title="3. Cross Market 結果">
      <dl className="space-y-3">
        <DataRow label="整體狀態" value={validation.status} />
        <DataRow label="可用市場" value={String(validation.availableMarkets)} />
        <DataRow label="已執行規則" value={String(validation.executedRules)} />
        <DataRow label="已跳過規則" value={String(validation.skippedRules)} />
        <DataRow label="資料覆蓋率" value={validation.coverageLabel} />
        <DataRow
          label="Rule #1 Moneyline × Handicap"
          value={result.status}
        />
        <DataRow label="Rule #1 reason" value={result.reason} />
        <DataRow
          label="Rule #2 Handicap × Total Goals"
          value={rule2.status}
        />
        <DataRow label="Rule #2 reason" value={rule2.reason} />
        <DataRow
          label="Rule #3 Total Goals × BTTS"
          value={rule3.status}
        />
        <DataRow label="Rule #3 reason" value={rule3.reason} />
      </dl>
    </DataCard>
  );
}

function BetaCandidatesSection({
  report,
}: {
  report: AnalysisReport;
}) {
  const beta = report.betaRecommendation;

  if (!beta.enabled) {
    return (
      <DataCard title="4. Beta 推薦">
        <p className="text-sm text-slate-500">
          Beta 推薦模式未啟用。請設定{" "}
          <code className="rounded bg-slate-200 px-1 text-xs">
            NEXT_PUBLIC_BETA_RECOMMENDATION_MODE=true
          </code>
        </p>
      </DataCard>
    );
  }

  if (beta.candidates.length === 0) {
    return (
      <DataCard title="4. Beta 推薦">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {beta.message || BETA_EMPTY_MESSAGE}
        </p>
      </DataCard>
    );
  }

  return (
    <DataCard title="4. Beta 推薦">
      <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
        {BETA_DISCLAIMER}
      </p>
      <div className="space-y-4">
        {beta.candidates.map((candidate) => (
          <div
            key={`${candidate.marketType}-${candidate.title}-${candidate.side}`}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">
                {candidate.title}（{MARKET_TYPE_LABELS[candidate.marketType]}）
              </p>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {SIDE_LABELS[candidate.side] ?? candidate.side}
                {candidate.rawLine ? ` ${candidate.rawLine}` : ""} @ {candidate.odds}
              </span>
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                信心：{CONFIDENCE_LABELS[candidate.confidenceLevel]}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                {candidate.modelVersion}
              </span>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-emerald-700">支持證據</p>
                <ul className="mt-1 list-inside list-disc text-sm text-slate-600">
                  {candidate.supportingEvidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium text-rose-700">反對證據</p>
                {candidate.opposingEvidence.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-500">無</p>
                ) : (
                  <ul className="mt-1 list-inside list-disc text-sm text-slate-600">
                    {candidate.opposingEvidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="mt-3">
              <p className="text-xs font-medium text-slate-500">使用 Rule</p>
              <p className="mt-1 text-sm text-slate-700">
                {candidate.rulesUsed.join("、")}
              </p>
            </div>

            <div className="mt-2">
              <p className="text-xs font-medium text-slate-500">推薦理由</p>
              <ul className="mt-1 list-inside list-disc text-sm text-slate-600">
                {candidate.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </DataCard>
  );
}

function BetaDashboardSection({
  stats,
  rollingReport,
}: {
  stats: BetaDashboardStats;
  rollingReport: RollingEvaluationReport | null;
}) {
  if (!isBetaRecommendationModeEnabled()) {
    return null;
  }

  const metricCards = [
    { label: "總推薦數", value: stats.totalRecommendations },
    { label: "已驗證", value: stats.verifiedCount },
    { label: "待驗證", value: stats.pendingCount },
    { label: "勝", value: stats.wins },
    { label: "負", value: stats.losses },
    { label: "走水", value: stats.pushes },
    { label: "半贏", value: stats.halfWins },
    { label: "半輸", value: stats.halfLoses },
    { label: "命中率", value: formatHitRate(stats.hitRate, stats.verifiedCount) },
    { label: "ROI", value: formatRoi(stats.roi, stats.verifiedCount) },
    {
      label: "平均賠率",
      value: stats.averageOdds > 0 ? stats.averageOdds.toFixed(2) : "—",
    },
    {
      label: "最近20筆",
      value: `${formatHitRate(stats.last20.rate, stats.last20.total)} / ${formatRoi(stats.last20.roi, stats.last20.total)}`,
    },
    {
      label: "最近50筆",
      value: `${formatHitRate(stats.last50.rate, stats.last50.total)} / ${formatRoi(stats.last50.roi, stats.last50.total)}`,
    },
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Beta 驗證儀表板</h2>
        <span className="text-xs text-slate-500">版本 {stats.modelVersion}</span>
      </div>

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        樣本警告：{stats.sampleWarning}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metricCards.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-200 bg-white p-4 text-center"
          >
            <p className="text-lg font-bold text-slate-900">{item.value}</p>
            <p className="mt-1 text-xs text-slate-500">{item.label}</p>
          </div>
        ))}
      </div>

      <DataCard title="各玩法命中率">
        {Object.keys(stats.marketTypeHitRates).length === 0 ? (
          <p className="text-sm text-slate-500">尚無已驗證推薦。</p>
        ) : (
          <dl className="space-y-2">
            {Object.entries(stats.marketTypeHitRates).map(([market, value]) => (
              <DataRow
                key={market}
                label={MARKET_TYPE_LABELS[market as MarketSelection["marketType"]] ?? market}
                value={`${value.hits}/${value.total}（${formatHitRate(value.rate, value.total)}）`}
              />
            ))}
          </dl>
        )}
      </DataCard>

      <DataCard title="各 Rule 命中率">
        {Object.keys(stats.ruleHitRates).length === 0 ? (
          <p className="text-sm text-slate-500">尚無已驗證推薦。</p>
        ) : (
          <dl className="space-y-2">
            {Object.entries(stats.ruleHitRates).map(([rule, value]) => (
              <DataRow
                key={rule}
                label={rule}
                value={`${value.hits}/${value.total}（${formatHitRate(value.rate, value.total)}）`}
              />
            ))}
          </dl>
        )}
      </DataCard>

      {rollingReport && (
        <DataCard title="滾動優化報告（每 20 筆）">
          <dl className="space-y-2">
            <DataRow
              label="最近20筆命中率"
              value={formatHitRate(rollingReport.hitRate, rollingReport.windowSize)}
            />
            <DataRow
              label="最近20筆 ROI"
              value={formatRoi(rollingReport.roi, rollingReport.windowSize)}
            />
            <DataRow label="最佳玩法" value={rollingReport.bestMarketType ?? "—"} />
            <DataRow label="最差玩法" value={rollingReport.worstMarketType ?? "—"} />
            <DataRow label="最佳 Rule" value={rollingReport.bestRule ?? "—"} />
            <DataRow label="最差 Rule" value={rollingReport.worstRule ?? "—"} />
            <DataRow
              label="建議降權 Rule"
              value={
                rollingReport.suggestDownweightRules.length > 0
                  ? rollingReport.suggestDownweightRules.join("、")
                  : "無"
              }
            />
            <DataRow
              label="建議暫停 Rule"
              value={
                rollingReport.suggestPauseRules.length > 0
                  ? rollingReport.suggestPauseRules.join("、")
                  : "無"
              }
            />
          </dl>
          <ul className="mt-3 list-inside list-disc text-sm text-slate-600">
            {rollingReport.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </DataCard>
      )}
    </section>
  );
}

function UnknownMarketsSection({ match }: { match: MatchData }) {
  if (match.unknownMarkets.length === 0) {
    return null;
  }

  return (
    <DataCard title="未知玩法（尚未支援）">
      <div className="space-y-3">
        {match.unknownMarkets.map((market) => (
          <div
            key={market.name}
            className="rounded-lg border border-amber-200 bg-amber-50 p-3"
          >
            <p className="text-sm font-medium text-amber-900">
              {market.name}
              <span className="ml-2 text-xs font-normal text-amber-700">
                （出現 {market.count} 次）
              </span>
            </p>
            <p className="mt-1 font-mono text-xs text-amber-800">{market.raw}</p>
          </div>
        ))}
      </div>
    </DataCard>
  );
}

function ExplainReportView({ explain }: { explain: ExplainReport }) {
  return (
    <div className="space-y-4">
      <DataCard title="重點摘要（summary）">
        <ol className="list-inside list-decimal space-y-2 text-sm text-slate-700">
          {explain.summary.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ol>
      </DataCard>

      <DataCard title="市場依據（marketReasons）">
        <div className="space-y-3">
          {explain.marketReasons.map((market) => (
            <div
              key={market.marketType}
              className="rounded-lg border border-slate-200 bg-white p-3"
            >
              <p className="text-sm font-medium text-slate-800">{market.label}</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-600">
                {market.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DataCard>

      <DataCard title="Rule 依據（ruleReasons）">
        <div className="space-y-3">
          {explain.ruleReasons.map((rule, index) => (
            <div
              key={rule.ruleId}
              className="rounded-lg border border-slate-200 bg-white p-3"
            >
              <p className="text-sm font-medium text-slate-800">
                Rule #{index + 1} {rule.displayName}
              </p>
              <dl className="mt-2 space-y-1 text-sm text-slate-600">
                <DataRow label="status" value={rule.status} />
                <DataRow label="reason" value={rule.reason} />
                <DataRow
                  label="influencedCandidates"
                  value={rule.influencedCandidates ? "true" : "false"}
                />
              </dl>
            </div>
          ))}
        </div>
      </DataCard>

      <DataCard title="衝突（conflicts）">
        {explain.conflicts.length === 0 ? (
          <p className="text-sm text-slate-500">無交叉市場衝突。</p>
        ) : (
          <div className="space-y-3">
            {explain.conflicts.map((conflict) => (
              <div
                key={conflict.ruleId}
                className="rounded-lg border border-rose-200 bg-rose-50 p-3"
              >
                <p className="text-sm font-medium text-rose-900">
                  {conflict.message}
                </p>
                <p className="mt-1 text-sm text-rose-800">{conflict.detail}</p>
              </div>
            ))}
          </div>
        )}
      </DataCard>

      <DataCard title="信心依據（confidenceReason）">
        <p className="text-sm text-slate-700">{explain.confidenceReason}</p>
      </DataCard>

      <DataCard title="ExplainReport JSON">
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
          {JSON.stringify(explain, null, 2)}
        </pre>
      </DataCard>
    </div>
  );
}

const STATUS_LABELS: Record<MatchStatus, string> = {
  PENDING: "待驗證",
  VERIFIED: "已驗證",
  FAILED: "驗證失敗",
  CANCELLED: "已取消",
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-TW");
}

function StatsSection({ stats }: { stats: MatchHistoryStats }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-700">資料統計</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { label: "總輸入筆數", value: stats.total },
        { label: "待驗證", value: stats.pending },
        { label: "已驗證", value: stats.verified },
        { label: "驗證失敗", value: stats.failed },
      ].map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-slate-200 bg-white p-4 text-center"
        >
          <p className="text-2xl font-bold text-slate-900">{item.value}</p>
          <p className="mt-1 text-xs text-slate-500">{item.label}</p>
        </div>
      ))}
      </div>
    </section>
  );
}

function ScoreVerifyForm({
  matchId,
  onVerified,
}: {
  matchId: string;
  onVerified: (rollingGenerated: boolean) => void;
}) {
  const [fullTimeHomeGoals, setFullTimeHomeGoals] = useState("0");
  const [fullTimeAwayGoals, setFullTimeAwayGoals] = useState("0");
  const [halfTimeHomeGoals, setHalfTimeHomeGoals] = useState("");
  const [halfTimeAwayGoals, setHalfTimeAwayGoals] = useState("");
  const [error, setError] = useState("");

  function handleVerify() {
    const ftHome = Number(fullTimeHomeGoals);
    const ftAway = Number(fullTimeAwayGoals);
    const htHome = halfTimeHomeGoals === "" ? 0 : Number(halfTimeHomeGoals);
    const htAway = halfTimeAwayGoals === "" ? 0 : Number(halfTimeAwayGoals);

    if (
      !Number.isFinite(ftHome) ||
      !Number.isFinite(ftAway) ||
      !Number.isFinite(htHome) ||
      !Number.isFinite(htAway)
    ) {
      setError("請輸入有效的進球數。");
      return;
    }

    const updated = verifyPersistedMatch(matchId, {
      fullTimeHomeGoals: ftHome,
      fullTimeAwayGoals: ftAway,
      halfTimeHomeGoals: htHome,
      halfTimeAwayGoals: htAway,
    });

    if (!updated) {
      setError("驗證失敗，請確認比賽狀態。");
      return;
    }

    let rollingGenerated = false;
    if (isBetaRecommendationModeEnabled()) {
      settleBetaRecommendationsForMatch(matchId, {
        fullTimeHomeGoals: ftHome,
        fullTimeAwayGoals: ftAway,
        halfTimeHomeGoals: htHome,
        halfTimeAwayGoals: htAway,
      });
      rollingGenerated = maybeGenerateRollingReport() !== null;
    }

    setError("");
    onVerified(rollingGenerated);
  }

  return (
    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
      <p className="text-sm font-medium text-emerald-900">輸入比分</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-600">
          全場主隊進球
          <input
            type="number"
            min={0}
            value={fullTimeHomeGoals}
            onChange={(e) => setFullTimeHomeGoals(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-slate-600">
          全場客隊進球
          <input
            type="number"
            min={0}
            value={fullTimeAwayGoals}
            onChange={(e) => setFullTimeAwayGoals(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-slate-600">
          上半場主隊（可選）
          <input
            type="number"
            min={0}
            value={halfTimeHomeGoals}
            onChange={(e) => setHalfTimeHomeGoals(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="0"
          />
        </label>
        <label className="text-xs text-slate-600">
          上半場客隊（可選）
          <input
            type="number"
            min={0}
            value={halfTimeAwayGoals}
            onChange={(e) => setHalfTimeAwayGoals(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="0"
          />
        </label>
      </div>
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      <button
        type="button"
        onClick={handleVerify}
        className="mt-3 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
      >
        完成驗證
      </button>
    </div>
  );
}

function HistoryMatchesSection({
  matches,
  onRefresh,
}: {
  matches: HistoricalMatchRecord[];
  onRefresh: () => void;
}) {
  if (matches.length === 0) {
    return (
      <DataCard title="歷史比賽">
        <p className="text-sm text-slate-500">尚無已保存的比賽紀錄。</p>
      </DataCard>
    );
  }

  return (
    <DataCard title="歷史比賽">
      <div className="space-y-3">
        {matches.map((match) => (
          <div
            key={match.id}
            className="rounded-lg border border-slate-200 bg-white p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {match.homeTeam} vs {match.awayTeam}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  聯賽：{match.league || "未分類"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  比賽日期：{match.matchDate || "—"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  建立時間：{formatDateTime(match.createdAt)}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-xs font-medium ${
                  match.status === "PENDING"
                    ? "bg-amber-100 text-amber-800"
                    : match.status === "VERIFIED"
                      ? "bg-emerald-100 text-emerald-800"
                      : match.status === "FAILED"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-slate-100 text-slate-600"
                }`}
              >
                {STATUS_LABELS[match.status]}
              </span>
            </div>
            {match.status === "PENDING" && (
              <ScoreVerifyForm
                matchId={match.id}
                onVerified={() => onRefresh()}
              />
            )}
            {match.status === "VERIFIED" && match.result && (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-slate-600">
                  全場比分：{match.result.fullTimeHomeGoals} -{" "}
                  {match.result.fullTimeAwayGoals}
                </p>
                {isBetaRecommendationModeEnabled() &&
                  getBetaRecommendationsByMatch(match.id).map((record) => (
                    <p key={record.id} className="text-xs text-slate-600">
                      Beta：{record.candidate.title}（
                      {SIDE_LABELS[record.candidate.side] ?? record.candidate.side}
                      ）→ {record.settlement ?? "—"}
                      {record.profit !== null
                        ? ` · 盈虧 ${record.profit >= 0 ? "+" : ""}${record.profit.toFixed(2)}`
                        : ""}
                    </p>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </DataCard>
  );
}

function TeamDataSection({
  report,
  teamData,
  loading,
  error,
  usage,
  onFetch,
}: {
  report: AnalysisReport;
  teamData: TeamDataPackage | null;
  loading: boolean;
  error: string;
  usage: ApiUsageInfo | null;
  onFetch: () => void;
}) {
  return (
    <DataCard title="免費球隊資料">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          盤口仍由使用者貼上；此功能僅在使用者按下按鈕時向免費 API 取得球隊近況與比分。
        </p>
        {usage && (
          <p className="text-xs text-slate-500">
            本日 API 使用：{usage.used} / {usage.limit}
            {usage.quotaExceeded ? "（額度已用完，仍可繼續盤口分析）" : ""}
          </p>
        )}
        <button
          type="button"
          onClick={onFetch}
          disabled={loading}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? "取得中..." : "取得球隊資料"}
        </button>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {teamData && (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
            <DataRow
              label="資料完整度"
              value={`${teamData.completeness.percent}%`}
            />
            <DataRow
              label="資料來源"
              value={teamData.sources.join(", ") || "無"}
            />
            <DataRow
              label="Fixture ID"
              value={
                teamData.fixture.fixtureId !== null
                  ? String(teamData.fixture.fixtureId)
                  : "免費資料源未提供"
              }
            />
            {teamData.finalScore && (
              <DataRow
                label="最終比分"
                value={`${teamData.finalScore.home} - ${teamData.finalScore.away}`}
              />
            )}
            {summarizeTeamForm("主隊近10場", teamData.homeRecentForm) && (
              <DataRow
                label="主隊近況"
                value={summarizeTeamForm("主隊近10場", teamData.homeRecentForm)!}
              />
            )}
            {summarizeTeamForm("客隊近10場", teamData.awayRecentForm) && (
              <DataRow
                label="客隊近況"
                value={summarizeTeamForm("客隊近10場", teamData.awayRecentForm)!}
              />
            )}
            {summarizeTeamForm("主隊主場", teamData.homeHomeForm) && (
              <DataRow
                label="主隊主場"
                value={summarizeTeamForm("主隊主場", teamData.homeHomeForm)!}
              />
            )}
            {summarizeTeamForm("客隊客場", teamData.awayAwayForm) && (
              <DataRow
                label="客隊客場"
                value={summarizeTeamForm("客隊客場", teamData.awayAwayForm)!}
              />
            )}
            {teamData.headToHead.length > 0 && (
              <DataRow
                label="最近交手"
                value={`最近 ${teamData.headToHead.length} 場`}
              />
            )}
            <div>
              <p className="text-xs font-medium text-slate-500">未取得欄位</p>
              <ul className="mt-1 list-inside list-disc text-sm text-slate-600">
                {teamData.unavailableFields.map((field) => (
                  <li key={field}>{formatUnavailableField(field)}</li>
                ))}
              </ul>
            </div>
            {teamData.errors.length > 0 && (
              <div>
                <p className="text-xs font-medium text-amber-700">提示</p>
                <ul className="mt-1 list-inside list-disc text-sm text-amber-700">
                  {teamData.errors.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {!teamData && !loading && !error && (
          <p className="text-sm text-slate-500">
            尚未取得 {report.match.homeTeam} vs {report.match.awayTeam} 的球隊資料。
          </p>
        )}
      </div>
    </DataCard>
  );
}

function AnalysisReportView({ report }: { report: AnalysisReport }) {
  const hasContent =
    report.markets.length > 0 ||
    report.match.homeTeam ||
    report.match.awayTeam;

  if (!hasContent) {
    return (
      <p className="text-sm text-amber-600">
        無法解析盤口資料，請確認格式是否正確。
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <MatchInfo match={report.match} />
      <ParsedMarketsSection markets={report.markets} />
      <InterpretationsSection interpretations={report.interpretations} />
      <CrossMarketSection validation={report.crossMarketValidation} />
      <BetaCandidatesSection report={report} />
      <UnknownMarketsSection match={report.match} />
    </div>
  );
}

export default function HomePage() {
  const [input, setInput] = useState("");
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [activeTab, setActiveTab] = useState<"analysis" | "explain">("analysis");
  const [historyMatches, setHistoryMatches] = useState<HistoricalMatchRecord[]>([]);
  const [stats, setStats] = useState<MatchHistoryStats>({
    total: 0,
    pending: 0,
    verified: 0,
    failed: 0,
    cancelled: 0,
  });
  const [notice, setNotice] = useState("");
  const [teamData, setTeamData] = useState<TeamDataPackage | null>(null);
  const [teamDataLoading, setTeamDataLoading] = useState(false);
  const [teamDataError, setTeamDataError] = useState("");
  const [apiUsage, setApiUsage] = useState<ApiUsageInfo | null>(null);
  const [betaStats, setBetaStats] = useState<BetaDashboardStats>(() =>
    computeBetaDashboardStats(CURRENT_MODEL_VERSION)
  );
  const [rollingReport, setRollingReport] = useState<RollingEvaluationReport | null>(
    null
  );

  function refreshBetaDashboard() {
    if (!isBetaRecommendationModeEnabled()) {
      return;
    }
    setBetaStats(computeBetaDashboardStats(CURRENT_MODEL_VERSION));
    setRollingReport(getLatestRollingReport());
  }

  function refreshHistory() {
    const { matches, stats } = loadPersistedHistory();
    setHistoryMatches(matches);
    setStats(stats);
    refreshBetaDashboard();
  }

  useEffect(() => {
    refreshHistory();
    setApiUsage(getStoredApiUsage());
  }, []);

  async function handleFetchTeamData() {
    if (!report?.match.homeTeam || !report.match.awayTeam) {
      return;
    }

    setTeamDataLoading(true);
    setTeamDataError("");

    try {
      const response = await fetchTeamDataClient({
        homeTeam: report.match.homeTeam,
        awayTeam: report.match.awayTeam,
        league: report.match.league,
        matchDate: new Date().toISOString().split("T")[0],
      });

      if (!response.ok || !response.data) {
        setTeamDataError(response.message ?? "取得球隊資料失敗。");
        setTeamData(null);
        return;
      }

      setTeamData(response.data);
      setApiUsage(response.data.usage);
      if (response.fromCache) {
        setNotice("已使用快取球隊資料（24 小時內）");
      }
    } catch (error) {
      setTeamDataError(
        error instanceof Error ? error.message : "取得球隊資料失敗。"
      );
      setTeamData(null);
    } finally {
      setTeamDataLoading(false);
    }
  }

  function handleAnalyze() {
    if (!input.trim()) {
      setReport(null);
      setNotice("");
      return;
    }

    const rawOdds = input.trim();
    const nextReport = analyzeMatch(rawOdds);
    setReport(nextReport);
    setActiveTab("analysis");
    setTeamData(null);
    setTeamDataError("");

    const outcome = persistAnalysisToHistory(rawOdds, nextReport);

    if (
      outcome.status === "created" &&
      isBetaRecommendationModeEnabled() &&
      nextReport.betaRecommendation.candidates.length > 0
    ) {
      saveBetaRecommendations({
        matchRecordId: outcome.record.id,
        homeTeam: nextReport.match.homeTeam,
        awayTeam: nextReport.match.awayTeam,
        matchDate: outcome.record.matchDate,
        rawOdds: input.trim(),
        marketSelections: nextReport.markets,
        teamData,
        candidates: nextReport.betaRecommendation.candidates,
      });
    }

    if (outcome.status === "duplicate") {
      setNotice("這場比賽已經儲存");
    } else {
      setNotice("儲存成功");
    }

    refreshHistory();
  }

  function handleClearAll() {
    const first = window.confirm("確定要清除所有測試資料嗎？此操作無法復原。");
    if (!first) {
      return;
    }
    const second = window.confirm("再次確認：所有歷史比賽紀錄將被永久刪除。");
    if (!second) {
      return;
    }

    clearPersistedHistory();
    clearAllBetaRecommendations();
    setNotice("已清除所有測試資料");
    refreshHistory();
  }

  const explain = report ? explainAnalysis(report) : null;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-slate-900">
            足球 AI 盤口分析系統
          </h1>
          <p className="mt-2 text-slate-500">貼上盤口資料，一鍵取得分析</p>
        </header>

        <section className="mb-8 space-y-4">
          <StatsSection stats={stats} />
          <BetaDashboardSection stats={betaStats} rollingReport={rollingReport} />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleClearAll}
              className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50"
            >
              清除所有測試資料
            </button>
          </div>
        </section>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`請貼上足球盤口資料，例如：\n\n法國 vs 西班牙\n\n獨贏\n主 2.1\n和 3.2\n客 3.5\n\n全場讓分\n主0 0.9\n客0 0.95\n\n全場大小\n大(2.5) 0.88\n小 0.98\n\n雙方進球\n是 0.75\n否 1.05`}
          className="h-80 w-full resize-y rounded-lg border border-slate-300 bg-white p-4 font-mono text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          spellCheck={false}
        />

        <button
          type="button"
          onClick={handleAnalyze}
          className="mt-4 w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          開始分析
        </button>

        {notice && (
          <p
            className={`mt-3 rounded-lg px-4 py-2 text-sm ${
              notice === "這場比賽已經儲存"
                ? "bg-amber-50 text-amber-800"
                : "bg-emerald-50 text-emerald-800"
            }`}
          >
            {notice}
          </p>
        )}

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold text-slate-700">分析結果</h2>
            {report && (
              <div className="flex rounded-lg border border-slate-200 bg-white p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab("analysis")}
                  className={`rounded-md px-3 py-1.5 font-medium transition ${
                    activeTab === "analysis"
                      ? "bg-emerald-600 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  分析結果
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("explain")}
                  className={`rounded-md px-3 py-1.5 font-medium transition ${
                    activeTab === "explain"
                      ? "bg-emerald-600 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  分析依據
                </button>
              </div>
            )}
          </div>
          {report ? (
            activeTab === "analysis" ? (
              <div className="space-y-4">
                <TeamDataSection
                  report={report}
                  teamData={teamData}
                  loading={teamDataLoading}
                  error={teamDataError}
                  usage={apiUsage}
                  onFetch={handleFetchTeamData}
                />
                <AnalysisReportView report={report} />
              </div>
            ) : (
              explain && <ExplainReportView explain={explain} />
            )
          ) : (
            <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-400">
              點擊「開始分析」後，解析結果將顯示於此
            </p>
          )}
        </section>

        <section className="mt-8">
          <HistoryMatchesSection
            matches={historyMatches}
            onRefresh={refreshHistory}
          />
        </section>
      </div>
    </main>
  );
}
