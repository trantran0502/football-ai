import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import { resetBrowserHistoryRepository } from "@/lib/database/browserHistoryRepository";
import {
  loadMatchHistoryForBrowser,
  saveMatchFromAnalysisForBrowser,
  setBrowserMatchStorageDepsForTests,
  verifyMatchForBrowser,
} from "@/lib/database/browserMatchStorage";
import { MATCH_STORAGE_KEY } from "@/lib/database/localStorageDatabase";
import type { AnalysisSnapshot, HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { buildMatchHistoryStats } from "@/lib/database/matchSchema";
import type { MarketSelection } from "@/types/match";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

const SETTLEABLE_MARKET: MarketSelection = {
  marketType: "moneyline",
  marketFamily: "moneyline",
  title: "Moneyline",
  period: "full",
  side: "home",
  line: null,
  rawLine: null,
  modifier: null,
  odds: 1.9,
  impliedProbability: 0.526,
};

const MINIMAL_SNAPSHOT = {
  features: [],
  interpretations: [],
  marketAnalysis: {},
  combinedAnalysis: {},
  candidates: [],
  recommendation: null,
  replay: null,
  bettingIntelligence: null,
  decision: null,
  capturedAt: "2026-07-15T10:00:00.000Z",
} as AnalysisSnapshot;

const SAMPLE_ODDS = `法國 vs 西班牙
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

const memoryStorage = new MemoryStorage();
const globalScope = globalThis as typeof globalThis & {
  window?: Window & typeof globalThis;
  localStorage?: Storage;
};

function setupBrowserEnvironment(): void {
  globalScope.window = globalScope as Window & typeof globalThis;
  globalScope.localStorage = memoryStorage;
}

function buildSupabaseRecord(overrides: Partial<HistoricalMatchRecord> = {}): HistoricalMatchRecord {
  return {
    id: overrides.id ?? "supabase-record-1",
    date: overrides.matchDate ?? "2026-07-19",
    matchDate: overrides.matchDate ?? "2026-07-19",
    league: "Test League",
    homeTeam: "法國",
    awayTeam: "西班牙",
    rawOdds: SAMPLE_ODDS,
    marketSelections: [SETTLEABLE_MARKET],
    result: null,
    analysisSnapshot: MINIMAL_SNAPSHOT,
    candidates: [],
    status: "PENDING",
    verificationResult: null,
    fixtureId: null,
    leagueId: null,
    season: null,
    homeTeamId: null,
    awayTeamId: null,
    source: "app",
    createdAt: "2026-07-19T10:00:00.000Z",
    updatedAt: "2026-07-19T10:00:00.000Z",
    ...overrides,
  };
}

async function testSupabasePrimaryFlow(): Promise<void> {
  setupBrowserEnvironment();
  resetBrowserHistoryRepository();
  memoryStorage.clear();
  setBrowserMatchStorageDepsForTests(null);

  const supabaseRecord = buildSupabaseRecord();
  const supabaseStats = buildMatchHistoryStats([supabaseRecord]);

  setBrowserMatchStorageDepsForTests({
    loadFromSupabase: async () => ({
      matches: [supabaseRecord],
      stats: supabaseStats,
      storage: "supabase",
    }),
    saveToSupabase: async (rawOdds, report) => ({
      status: "created",
      record: buildSupabaseRecord({
        id: "supabase-created-1",
        homeTeam: report.match.homeTeam,
        awayTeam: report.match.awayTeam,
        rawOdds,
      }),
      storage: "supabase",
    }),
    verifyOnSupabase: async () => null,
  });

  const report = analyzeMatch(SAMPLE_ODDS);
  const saveOutcome = await saveMatchFromAnalysisForBrowser(SAMPLE_ODDS, report);

  assert(saveOutcome.storage === "supabase", "save should use Supabase as primary source");
  assert(saveOutcome.status === "created", "save should create a Supabase record");
  assert(
    memoryStorage.getItem(MATCH_STORAGE_KEY) === null,
    "Supabase save must not write to LocalStorage"
  );

  const loaded = await loadMatchHistoryForBrowser();
  assert(loaded.storage === "supabase", "dashboard load should report Supabase");
  assert(loaded.stats.total === 1, "dashboard stats should come from Supabase");
  assert(loaded.matches[0]?.id === "supabase-record-1", "dashboard should show Supabase records");
}

async function testLocalStorageFallbackFlow(): Promise<void> {
  setupBrowserEnvironment();
  resetBrowserHistoryRepository();
  memoryStorage.clear();
  setBrowserMatchStorageDepsForTests({
    loadFromSupabase: async () => null,
    saveToSupabase: async () => null,
    verifyOnSupabase: async () => null,
  });

  const report = analyzeMatch(SAMPLE_ODDS);
  const saveOutcome = await saveMatchFromAnalysisForBrowser(SAMPLE_ODDS, report);

  assert(saveOutcome.storage === "local", "API failure should fall back to LocalStorage");
  assert(saveOutcome.status === "created", "fallback save should still create a record");
  assert(
    memoryStorage.getItem(MATCH_STORAGE_KEY) !== null,
    "fallback save should persist to LocalStorage"
  );

  const loaded = await loadMatchHistoryForBrowser();
  assert(loaded.storage === "local", "fallback load should report LocalStorage");
  assert(loaded.stats.total === 1, "dashboard should show fallback stats");
  assert(loaded.matches.length === 1, "dashboard should show fallback records");

  if (!saveOutcome.record) {
    throw new Error("created fallback save should include record");
  }

  const verified = await verifyMatchForBrowser(saveOutcome.record.id, {
    fullTimeHomeGoals: 2,
    fullTimeAwayGoals: 1,
    halfTimeHomeGoals: 1,
    halfTimeAwayGoals: 0,
  });

  assert(verified.storage === "local", "verify should fall back to LocalStorage");
  assert(verified.record?.status === "VERIFIED", "fallback verify should update local record");
}

async function runBrowserMatchStorageTests(): Promise<void> {
  try {
    await testSupabasePrimaryFlow();
    await testLocalStorageFallbackFlow();
    console.log("Browser match storage tests passed.");
  } finally {
    setBrowserMatchStorageDepsForTests(null);
    memoryStorage.clear();
    resetBrowserHistoryRepository();
  }
}

void runBrowserMatchStorageTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
