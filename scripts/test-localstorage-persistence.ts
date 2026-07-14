import { analyzeMatch } from "../lib/analysis/analyzeMatch";
import { resetBrowserHistoryRepository } from "../lib/database/browserHistoryRepository";
import {
  clearPersistedHistory,
  loadPersistedHistory,
  persistAnalysisToHistory,
  verifyPersistedMatch,
} from "../lib/database/browserPersistence";
import { MATCH_STORAGE_KEY } from "../lib/database/localStorageDatabase";

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

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const sample = `法國 vs 西班牙
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
  fetch?: typeof fetch;
};

globalScope.window = globalScope as Window & typeof globalThis;
globalScope.localStorage = memoryStorage;
globalScope.fetch = async () =>
  new Response(JSON.stringify({ ok: false, message: "offline" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });

async function runTests(): Promise<void> {
  resetBrowserHistoryRepository();
  clearPersistedHistory();

  const report = analyzeMatch(sample);
  const saveOutcome = await persistAnalysisToHistory(sample, report);

  assert(saveOutcome.status === "created", "first save should create a record");
  assert(saveOutcome.storage === "local", "fetch failure should fall back to local");
  assert(saveOutcome.record.status === "PENDING", "new record should be pending");
  assert(saveOutcome.record.result === null, "result should be null before verify");
  assert(
    saveOutcome.record.analysisSnapshot !== null,
    "analysis snapshot should be saved"
  );
  assert(saveOutcome.record.rawOdds === sample, "raw odds should be persisted");

  let loaded = await loadPersistedHistory();
  assert(loaded.stats.total === 1, "total should be 1 after save");
  assert(loaded.stats.pending === 1, "pending should be 1 after save");
  assert(loaded.stats.verified === 0, "verified should be 0 after save");
  assert(loaded.matches.length === 1, "one match should be loaded from storage");
  assert(loaded.storage === "local", "load should report local fallback when API offline");

  const duplicateOutcome = await persistAnalysisToHistory(sample, report);
  assert(duplicateOutcome.status === "duplicate", "duplicate save should be rejected");
  loaded = await loadPersistedHistory();
  assert(loaded.stats.total === 1, "duplicate save must not increase total");

  const raw = memoryStorage.getItem(MATCH_STORAGE_KEY);
  assert(raw !== null, "records should exist in localStorage");

  resetBrowserHistoryRepository();
  const reloaded = await loadPersistedHistory();
  assert(reloaded.stats.total === 1, "reload after refresh simulation should keep records");
  assert(
    reloaded.matches[0]?.homeTeam === report.match.homeTeam,
    "home team should survive refresh"
  );

  const verified = await verifyPersistedMatch(saveOutcome.record.id, {
    fullTimeHomeGoals: 2,
    fullTimeAwayGoals: 1,
    halfTimeHomeGoals: 1,
    halfTimeAwayGoals: 0,
  });

  if (!verified.record) {
    throw new Error("verify should succeed");
  }
  const verifiedRecord = verified.record;
  assert(verifiedRecord.status === "VERIFIED", "status should become VERIFIED");
  assert(verifiedRecord.verificationResult !== null, "verification result should be saved");
  assert(verifiedRecord.result?.winner === "home", "result should be saved");
  assert(verified.storage === "local", "fetch failure should fall back to local on verify");

  const afterVerify = await loadPersistedHistory();
  assert(afterVerify.stats.pending === 0, "pending should be 0 after verify");
  assert(afterVerify.stats.verified === 1, "verified should be 1 after verify");

  console.log("LocalStorage persistence flow tests passed.");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
