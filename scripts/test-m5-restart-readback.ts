/**
 * Verify Supabase data survives dev server restart (read-only).
 * Run: npx tsx scripts/test-m5-restart-readback.ts [baseUrl] [matchId] [recId]
 */

const baseUrl = process.argv[2] ?? "http://localhost:3005";
const matchId =
  process.argv[3] ?? "3389a0ed-1dd4-4b9c-b836-3d87d5d8efdd";
const recId =
  process.argv[4] ?? "397b81c6-0578-41e9-8cbf-b4ad8e90b8fc";

async function main(): Promise<void> {
  const health = await fetch(`${baseUrl}/api/data/health`).then((r) => r.json());
  if (!(health as { supabase?: { connected?: boolean } }).supabase?.connected) {
    throw new Error("health not connected");
  }

  const matches = await fetch(`${baseUrl}/api/data/match-records`).then((r) =>
    r.json()
  );
  const match = (
    matches as { data?: Array<{ id: string; status: string }> }
  ).data?.find((item) => item.id === matchId);
  if (!match || match.status !== "VERIFIED") {
    throw new Error("match not found after server restart");
  }

  const beta = await fetch(`${baseUrl}/api/data/beta-recommendations`).then(
    (r) => r.json()
  );
  if (
    !(beta as { data?: Array<{ id: string }> }).data?.some(
      (item) => item.id === recId
    )
  ) {
    throw new Error("beta not found after restart");
  }

  const rolling = await fetch(`${baseUrl}/api/data/beta-rolling-reports`).then(
    (r) => r.json()
  );
  if (
    !(rolling as { data?: Array<{ notes: string[] }> }).data?.some((item) =>
      item.notes.some((note) => note.includes("M5 integration test"))
    )
  ) {
    throw new Error("rolling report not found after restart");
  }

  console.log("Dev server restart persistence OK", {
    matchId,
    recId,
    matchRecords: (matches as { data?: unknown[] }).data?.length,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

export {};
