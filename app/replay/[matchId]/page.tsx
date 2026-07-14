import { ReplayViewer } from "@/components/replay/ReplayViewer";
import { getReplayForMatch } from "@/lib/replay/replayService";
import Link from "next/link";
import { notFound } from "next/navigation";

interface ReplayPageProps {
  params: Promise<{ matchId: string }>;
}

export default async function ReplayPage(props: ReplayPageProps) {
  const { matchId } = await props.params;
  const replay = await getReplayForMatch(matchId);

  if (!replay) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <Link
          href="/admin"
          className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          ← 返回 Admin
        </Link>
      </div>
      <ReplayViewer replay={replay} />
    </main>
  );
}
