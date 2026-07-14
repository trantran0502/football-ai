/**
 * M5 acceptance: Supabase-first storage with persistence across reads.
 * Run: npx tsx scripts/test-m5-supabase-persistence.ts [baseUrl]
 * Requires: dev server running with valid SUPABASE_* in .env.local
 */

const baseUrl = process.argv[2] ?? "http://localhost:3000";

interface ApiResponse<T> {
  ok: boolean;
  data: T;
  message?: string | null;
  stats?: {
    total: number;
    pending: number;
    verified: number;
    failed: number;
    cancelled: number;
  };
  status?: string;
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<{ status: number; body: ApiResponse<T> }> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: "no-store",
  });
  const body = (await response.json()) as ApiResponse<T>;
  return { status: response.status, body };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const sampleOdds = `M5測試-${Date.now()} 法國 vs 西班牙
獨贏
主 2.1
和 3.2
客 3.5
全場讓分
主0 0.9
客0 0.95
全場大小
大(2.5) 0.88
小 0.98
雙方進球
是 0.75
否 1.05`;

async function analyzeViaApi(rawOdds: string): Promise<{
  report: {
    match: { homeTeam: string; awayTeam: string; league?: string };
    markets: unknown[];
    candidates: unknown[];
    betaRecommendation: { candidates: unknown[] };
  };
}> {
  const { analyzeMatch } = await import("../lib/analysis/analyzeMatch");
  const report = analyzeMatch(rawOdds);
  return { report };
}

async function runFlow(label: string): Promise<{
  matchId: string;
  recommendationIds: string[];
  rollingReportId: string | null;
}> {
  console.log(`\n--- ${label} ---`);

  const health = await request<unknown>("/api/data/health");
  assert(health.status === 200, `health expected 200, got ${health.status}`);
  const supabase = (
    health.body as {
      supabase?: { connected?: boolean; tables?: Record<string, number> };
    }
  ).supabase;
  assert(supabase?.connected === true, "Supabase health check not connected");

  const { report } = await analyzeViaApi(sampleOdds);
  const matchDate = new Date().toISOString().split("T")[0];

  const create = await request<{
    id: string;
    homeTeam: string;
    awayTeam: string;
    matchDate: string;
    status: string;
    rawOdds: string;
    marketSelections: unknown[];
  }>("/api/data/match-records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawOdds: sampleOdds, report, matchDate }),
  });
  assert(
    create.status === 200,
    `match-records POST expected 200, got ${create.status}: ${create.body.message}`
  );
  assert(create.body.ok, `match-records POST ok=false: ${create.body.message}`);
  assert(Boolean(create.body.data?.id), "match-records POST missing id");
  assert(create.body.status === "created", "match should be created");
  const matchId = create.body.data!.id;

  const listAfterCreate = await request<
    Array<{ id: string; status: string; homeTeam: string }>
  >("/api/data/match-records");
  assert(listAfterCreate.status === 200, "match-records GET after create failed");
  assert(
    listAfterCreate.body.data.some((item) => item.id === matchId),
    "created match not found on GET (refresh simulation failed)"
  );
  assert(
    listAfterCreate.body.data.find((item) => item.id === matchId)?.status ===
      "PENDING",
    "match should be PENDING after create"
  );

  const verify = await request<{ id: string; status: string }>(
    "/api/data/match-records",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: matchId,
        fullTimeHomeGoals: 2,
        fullTimeAwayGoals: 1,
        halfTimeHomeGoals: 1,
        halfTimeAwayGoals: 0,
      }),
    }
  );
  assert(
    verify.status === 200,
    `match-records PATCH expected 200, got ${verify.status}: ${verify.body.message}`
  );
  assert(verify.body.ok, `match-records PATCH ok=false: ${verify.body.message}`);
  assert(
    verify.body.data?.status === "VERIFIED",
    "match should be VERIFIED after PATCH"
  );

  const listAfterVerify = await request<Array<{ id: string; status: string }>>(
    "/api/data/match-records"
  );
  assert(
    listAfterVerify.body.data.find((item) => item.id === matchId)?.status ===
      "VERIFIED",
    "verified match not readable after PATCH (refresh simulation failed)"
  );

  const now = new Date().toISOString();
  const recommendationId = crypto.randomUUID();
  const betaRecord = {
    id: recommendationId,
    matchRecordId: matchId,
    modelVersion: "beta-0.1",
    recommendedAt: now,
    homeTeam: report.match.homeTeam,
    awayTeam: report.match.awayTeam,
    matchDate,
    candidate: {
      marketType: "moneyline",
      title: "獨贏",
      side: "home",
      rawLine: null,
      odds: 2.1,
      reasons: ["M5 integration test"],
      supportingEvidence: ["evidence-1"],
      opposingEvidence: [],
      rulesUsed: ["rule-test"],
      confidenceLevel: "low",
      modelVersion: "beta-0.1",
      createdAt: now,
    },
    rawOdds: sampleOdds,
    marketSelections: report.markets,
    teamData: null,
    rulesUsed: ["rule-test"],
    status: "VERIFIED",
    finalScore: { fullTimeHomeGoals: 2, fullTimeAwayGoals: 1 },
    settlement: "WIN",
    profit: 1.1,
    hit: true,
    verifiedAt: now,
  };

  const betaPost = await request<typeof betaRecord[]>("/api/data/beta-recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: [betaRecord] }),
  });
  assert(
    betaPost.status === 200,
    `beta-recommendations POST failed: ${betaPost.body.message}`
  );
  assert(betaPost.body.ok, `beta-recommendations POST ok=false: ${betaPost.body.message}`);

  const rollingReport = {
    evaluatedAt: now,
    modelVersion: "beta-0.1",
    windowSize: 20,
    hitRate: 0.55,
    roi: 0.08,
    bestMarketType: "moneyline",
    worstMarketType: "totalGoals",
    bestRule: "rule-test",
    worstRule: "rule-other",
    suggestDownweightRules: [],
    suggestPauseRules: [],
    notes: [`M5 integration test ${label}`],
  };

  const rollingPost = await request<{ id?: string; modelVersion: string }>(
    "/api/data/beta-rolling-reports",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report: rollingReport }),
    }
  );
  assert(
    rollingPost.status === 200,
    `beta-rolling-reports POST failed: ${rollingPost.body.message}`
  );
  assert(
    rollingPost.body.ok,
    `beta-rolling-reports POST ok=false: ${rollingPost.body.message}`
  );

  const betaGet = await request<Array<{ id: string }>>("/api/data/beta-recommendations");
  assert(
    betaGet.body.data.some((item) => item.id === recommendationId),
    "beta recommendation not readable after POST"
  );

  const rollingGet = await request<Array<{ notes: string[] }>>(
    "/api/data/beta-rolling-reports"
  );
  assert(
    rollingGet.body.data.some((item) =>
      item.notes.includes(`M5 integration test ${label}`)
    ),
    "rolling report not readable after POST"
  );

  const healthAfter = await request<unknown>("/api/data/health");
  const tables = (
    healthAfter.body as {
      supabase?: { tables?: Record<string, number> };
    }
  ).supabase?.tables;

  console.log(`${label} passed`, {
    matchId,
    recommendationId,
    matchRecords: tables?.match_records,
    betaRecommendations: tables?.beta_recommendations,
    betaRollingReports: tables?.beta_rolling_reports,
  });

  return {
    matchId,
    recommendationIds: [recommendationId],
    rollingReportId: rollingPost.body.data?.id ?? null,
  };
}

async function main(): Promise<void> {
  console.log(`M5 acceptance against ${baseUrl}`);
  console.log("Storage policy: supabase-first (LocalStorage fallback in browser only)");

  const first = await runFlow("initial read/write cycle");

  const readBack = await request<Array<{ id: string; status: string }>>(
    "/api/data/match-records"
  );
  assert(
    readBack.body.data.some(
      (item) => item.id === first.matchId && item.status === "VERIFIED"
    ),
    "page refresh simulation: match not readable from Supabase"
  );

  const betaReadBack = await request<Array<{ id: string }>>(
    "/api/data/beta-recommendations"
  );
  assert(
    betaReadBack.body.data.some((item) =>
      first.recommendationIds.includes(item.id)
    ),
    "page refresh simulation: beta recommendation not readable from Supabase"
  );

  console.log("\nM5 acceptance test passed.");
  console.log(
    JSON.stringify(
      {
        storagePolicy: "supabase-first",
        matchId: first.matchId,
        recommendationIds: first.recommendationIds,
        refreshReadOk: true,
        note: "Restart dev server and re-run this script to confirm persistence across server restart.",
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

export {};
