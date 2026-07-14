import type { MatchDatabase } from "@/lib/database/database";
import {
  normalizeHistoricalMatchRecord,
  type HistoricalMatchId,
  type HistoricalMatchRecord,
} from "@/lib/database/matchSchema";

export const MATCH_STORAGE_KEY = "football-ai-match-records";

function readRecords(): HistoricalMatchRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(MATCH_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as HistoricalMatchRecord[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((record) => normalizeHistoricalMatchRecord(record));
  } catch {
    return [];
  }
}

function writeRecords(records: HistoricalMatchRecord[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(MATCH_STORAGE_KEY, JSON.stringify(records));
}

/**
 * LocalStorage 實作的 MatchDatabase。
 * 供瀏覽器 UI 持久化歷史比賽紀錄。
 */
export class LocalStorageMatchDatabase implements MatchDatabase {
  insert(record: HistoricalMatchRecord): void {
    const records = readRecords();
    records.unshift(normalizeHistoricalMatchRecord(record));
    writeRecords(records);
  }

  update(record: HistoricalMatchRecord): boolean {
    const records = readRecords();
    const index = records.findIndex((item) => item.id === record.id);
    if (index === -1) {
      return false;
    }
    records[index] = normalizeHistoricalMatchRecord(record);
    writeRecords(records);
    return true;
  }

  findById(id: HistoricalMatchId): HistoricalMatchRecord | null {
    const record = readRecords().find((item) => item.id === id);
    return record ? structuredClone(record) : null;
  }

  findAll(): HistoricalMatchRecord[] {
    return readRecords()
      .map((record) => structuredClone(record))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  clear(): void {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.removeItem(MATCH_STORAGE_KEY);
  }
}

export function createLocalStorageMatchDatabase(): MatchDatabase {
  return new LocalStorageMatchDatabase();
}

export function readLocalMatchRecords(): HistoricalMatchRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(MATCH_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as HistoricalMatchRecord[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((record) => normalizeHistoricalMatchRecord(record));
  } catch {
    return [];
  }
}
