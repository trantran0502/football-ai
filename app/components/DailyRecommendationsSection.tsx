"use client";

import Link from "next/link";
import type { DailyRecommendationRecord } from "@/lib/dailyRecommendations/dailyRecommendationTypes";
import { filterBettableDailyRecommendations } from "@/lib/dailyRecommendations/bettableRecommendationFilter";
import { filterQualifiedDailyRecommendations } from "@/lib/dailyRecommendations/dailyRecommendationThresholdFilter";
import {
  DAILY_RECOMMENDATION_RANK_LABELS,
  formatKickoffDisplay,
  resolveDailyRecommendationGrade,
} from "@/lib/dailyRecommendations/dailyRecommendationPresentation";

interface DailyRecommendationsSectionProps {
  recommendations: DailyRecommendationRecord[];
  loading: boolean;
  error: string | null;
}

function RecommendationCard({ item }: { item: DailyRecommendationRecord }) {
  const grade = resolveDailyRecommendationGrade(item.score);
  const kickoff = formatKickoffDisplay(item.kickoffTime, item.matchDate);
  const rankLabel = DAILY_RECOMMENDATION_RANK_LABELS[item.rank] ?? `Top ${item.rank}`;
  const replayId = item.matchRecordId || item.analysisSnapshot?.replay?.match?.matchId;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber-600">{rankLabel}</p>
          <p className="mt-1 text-base font-semibold text-slate-900">
            聯賽：{item.leagueName || "未分類"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">推薦等級</p>
          <p className="text-lg font-bold text-slate-900">
            {grade.stars} {item.grade}
          </p>
        </div>
      </div>

      <div className="mb-4 rounded-xl bg-slate-50 px-4 py-5 text-center">
        <p className="text-lg font-semibold text-slate-900">{item.homeTeam}</p>
        <p className="my-1 text-sm font-medium text-slate-400">VS</p>
        <p className="text-lg font-semibold text-slate-900">{item.awayTeam}</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-slate-500">開賽時間</p>
          <p className="font-medium text-slate-900">{kickoff.date}</p>
          <p className="font-medium text-slate-900">{kickoff.time}</p>
        </div>
        <div>
          <p className="text-slate-500">推薦玩法</p>
          <p className="font-medium text-slate-900">{item.market}</p>
          <p className="font-medium text-emerald-700">{item.recommendation}</p>
        </div>
        <div>
          <p className="text-slate-500">目前賠率</p>
          <p className="text-lg font-semibold text-slate-900">{item.odds.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-slate-500">AI 信心</p>
          <p className="text-lg font-semibold text-indigo-700">{item.confidence}%</p>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
        <p className="text-sm text-slate-500">AI 評分</p>
        <p className="text-2xl font-bold text-slate-900">
          {item.score} <span className="text-base font-medium text-slate-500">/ 100</span>
        </p>
      </div>

      <div className="mb-4">
        <p className="mb-2 text-sm font-medium text-slate-700">推薦原因</p>
        <ul className="space-y-1 text-sm text-slate-700">
          {item.reasoning.slice(0, 5).map((reason) => (
            <li key={reason}>✓ {reason}</li>
          ))}
        </ul>
      </div>

      {replayId ? (
        <Link
          href={`/replay/${encodeURIComponent(replayId)}`}
          className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
        >
          查看更多
        </Link>
      ) : null}
    </article>
  );
}

export function DailyRecommendationsSection({
  recommendations,
  loading,
  error,
}: DailyRecommendationsSectionProps) {
  const bettableRecommendations = filterBettableDailyRecommendations(recommendations);
  const qualifiedRecommendations = filterQualifiedDailyRecommendations(bettableRecommendations);

  return (
    <section className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-5">
      <h2 className="text-xl font-bold text-slate-900">🔥 今日 AI 推薦</h2>
      <p className="mt-1 text-sm text-slate-600">
        由 Daily Scheduler 自動挑選今日最值得下注的比賽（最多 3 場）。
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">載入今日推薦中…</p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {!loading && !error && qualifiedRecommendations.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">今日暫無符合門檻的推薦</p>
      ) : null}

      <div className="mt-4 space-y-4">
        {qualifiedRecommendations.map((item) => (
          <RecommendationCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
