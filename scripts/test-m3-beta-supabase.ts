/**
 * M3 integration test: POST/GET beta APIs against local Next.js server.
 * Run: npx tsx scripts/test-m3-beta-supabase.ts [baseUrl]
 */

const baseUrl = process.argv[2] ?? "http://localhost:3000";

interface ApiResponse<T> {
  ok: boolean;
  data: T;
  message?: string | null;
  count?: number;
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<{ status: number; body: ApiResponse<T> }> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = (await response.json()) as ApiResponse<T>;
  return { status: response.status, body };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  console.log(`Testing M3 against ${baseUrl}`);

  const health = await request<unknown>("/api/data/health");
  assert(health.status === 200, `health expected 200, got ${health.status}`);
  assert(
    (health.body as { supabase?: { connected?: boolean } }).supabase?.connected ===
      true,
    "Supabase health check not connected"
  );

  const matches = await request<
    Array<{
      id: string;
      homeTeam: string;
      awayTeam: string;
      matchDate: string;
      rawOdds: string;
      marketSelections: unknown[];
    }>
  >("/api/data/match-records");
  assert(matches.status === 200, `match-records GET expected 200, got ${matches.status}`);
  assert(matches.body.ok, `match-records GET ok=false: ${matches.body.message}`);
  assert(
    Array.isArray(matches.body.data) && matches.body.data.length > 0,
    "Need at least one match_record for beta_recommendations FK"
  );

  const match = matches.body.data[0];
  const recommendationId = crypto.randomUUID();
  const now = new Date().toISOString();

  const betaRecord = {
    id: recommendationId,
    matchRecordId: match.id,
    modelVersion: "beta-0.1",
    recommendedAt: now,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    matchDate: match.matchDate,
    candidate: {
      marketType: "moneyline",
      title: "獨贏",
      side: "home",
      rawLine: null,
      odds: 2.1,
      reasons: ["M3 integration test"],
      supportingEvidence: ["evidence-1", "evidence-2"],
      opposingEvidence: [],
      rulesUsed: ["rule-test"],
      confidenceLevel: "low",
      modelVersion: "beta-0.1",
      createdAt: now,
    },
    rawOdds: match.rawOdds,
    marketSelections: match.marketSelections,
    teamData: null,
    rulesUsed: ["rule-test"],
    status: "PENDING",
    finalScore: null,
    settlement: null,
    profit: null,
    hit: null,
    verifiedAt: null,
  };

  const betaPost = await request<typeof betaRecord[]>("/api/data/beta-recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: [betaRecord] }),
  });
  assert(
    betaPost.status === 200,
    `beta-recommendations POST expected 200, got ${betaPost.status}: ${betaPost.body.message}`
  );
  assert(betaPost.body.ok, `beta-recommendations POST ok=false: ${betaPost.body.message}`);
  assert(
    Array.isArray(betaPost.body.data) && betaPost.body.data.length === 1,
    "beta-recommendations POST should return one record"
  );
  assert(
    betaPost.body.data[0].id === recommendationId,
    "beta-recommendations POST returned unexpected id"
  );

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
    notes: ["M3 integration test report"],
  };

  const rollingPost = await request<typeof rollingReport>(
    "/api/data/beta-rolling-reports",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report: rollingReport }),
    }
  );
  assert(
    rollingPost.status === 200,
    `beta-rolling-reports POST expected 200, got ${rollingPost.status}: ${rollingPost.body.message}`
  );
  assert(
    rollingPost.body.ok,
    `beta-rolling-reports POST ok=false: ${rollingPost.body.message}`
  );
  assert(
    rollingPost.body.data?.modelVersion === "beta-0.1",
    "beta-rolling-reports POST returned unexpected report"
  );

  const healthAfter = await request<unknown>("/api/data/health");
  const tables = (
    healthAfter.body as {
      supabase?: {
        tables?: {
          beta_recommendations?: number;
          beta_rolling_reports?: number;
        };
      };
    }
  ).supabase?.tables;
  assert(
    (tables?.beta_recommendations ?? 0) >= 1,
    `health beta_recommendations count expected >=1, got ${tables?.beta_recommendations}`
  );
  assert(
    (tables?.beta_rolling_reports ?? 0) >= 1,
    `health beta_rolling_reports count expected >=1, got ${tables?.beta_rolling_reports}`
  );

  const betaGet = await request<typeof betaRecord[]>("/api/data/beta-recommendations");
  assert(betaGet.status === 200, `beta-recommendations GET expected 200, got ${betaGet.status}`);
  assert(
    betaGet.body.data.some((item) => item.id === recommendationId),
    "beta-recommendations GET did not return posted record"
  );

  const rollingGet = await request<typeof rollingReport[]>(
    "/api/data/beta-rolling-reports"
  );
  assert(
    rollingGet.status === 200,
    `beta-rolling-reports GET expected 200, got ${rollingGet.status}`
  );
  assert(
    rollingGet.body.data.some(
      (item) =>
        item.modelVersion === "beta-0.1" &&
        item.notes.includes("M3 integration test report")
    ),
    "beta-rolling-reports GET did not return posted report"
  );

  console.log("M3 integration test passed.");
  console.log(
    JSON.stringify(
      {
        betaRecommendationsCount: tables?.beta_recommendations,
        betaRollingReportsCount: tables?.beta_rolling_reports,
        postedRecommendationId: recommendationId,
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
