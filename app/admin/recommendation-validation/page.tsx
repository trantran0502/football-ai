import Link from "next/link";
import { RecommendationValidationDashboard } from "@/components/recommendation/RecommendationValidationDashboard";
import { extractRecommendationValidationDashboardProps } from "@/lib/recommendation/recommendationValidationDashboard";
import { listMatchRecordsFromSupabase } from "@/lib/supabase/queries/matchRecords";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export default async function RecommendationValidationAdminPage() {
  if (!hasSupabaseEnv()) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Recommendation Validation</h1>
        <p className="mt-4 text-sm text-zinc-500">Supabase 未設定。</p>
      </main>
    );
  }

  const { records } = await listMatchRecordsFromSupabase();
  const matchesWithDiagnostics = records
    .map((record) => extractRecommendationValidationDashboardProps(record))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const featured = matchesWithDiagnostics[0] ?? null;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Admin</p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Recommendation Validation Dashboard
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          與 Replay 使用同一份 providerDiagnostics（優先 replay.recommendation）。
        </p>
      </header>

      {featured ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-medium">{featured.matchLabel}</h2>
              <p className="text-xs text-zinc-500">Match ID: {featured.matchId}</p>
            </div>
            <Link
              href={`/replay/${featured.matchId}`}
              className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
            >
              開啟 Replay
            </Link>
          </div>
          <RecommendationValidationDashboard
            usableProviderCount={featured.usableProviderCount}
            unavailableProviderCount={featured.unavailableProviderCount}
            providerOverallConfidence={featured.providerOverallConfidence}
            providerDiagnostics={featured.providerDiagnostics}
          />
        </section>
      ) : (
        <p className="text-sm text-zinc-500">尚無含 providerDiagnostics 的分析紀錄。</p>
      )}

      {matchesWithDiagnostics.length > 1 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            其他場次
          </h2>
          <ul className="space-y-2 text-sm">
            {matchesWithDiagnostics.slice(1, 11).map((item) => (
              <li key={item.matchId}>
                <Link
                  href={`/replay/${item.matchId}`}
                  className="text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  {item.matchLabel}
                </Link>
                <span className="ml-2 text-zinc-500">
                  usable {item.usableProviderCount} / unavailable{" "}
                  {item.unavailableProviderCount}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
