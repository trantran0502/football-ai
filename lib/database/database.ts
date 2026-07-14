import type { HistoricalMatchId, HistoricalMatchRecord } from "@/lib/database/matchSchema";

/**
 * 資料庫抽象層。
 * 目前以 in-memory 實作，未來可替換為 SQLite / Prisma / Supabase adapter。
 */
export interface MatchDatabase {
  insert(record: HistoricalMatchRecord): void;
  update(record: HistoricalMatchRecord): boolean;
  findById(id: HistoricalMatchId): HistoricalMatchRecord | null;
  findAll(): HistoricalMatchRecord[];
  clear(): void;
}

export class InMemoryMatchDatabase implements MatchDatabase {
  private readonly records = new Map<HistoricalMatchId, HistoricalMatchRecord>();

  insert(record: HistoricalMatchRecord): void {
    this.records.set(record.id, structuredClone(record));
  }

  update(record: HistoricalMatchRecord): boolean {
    if (!this.records.has(record.id)) {
      return false;
    }
    this.records.set(record.id, structuredClone(record));
    return true;
  }

  findById(id: HistoricalMatchId): HistoricalMatchRecord | null {
    const record = this.records.get(id);
    return record ? structuredClone(record) : null;
  }

  findAll(): HistoricalMatchRecord[] {
    return [...this.records.values()]
      .map((record) => structuredClone(record))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  clear(): void {
    this.records.clear();
  }
}

let defaultDatabase: MatchDatabase | null = null;

export function createMatchDatabase(): MatchDatabase {
  return new InMemoryMatchDatabase();
}

export function getDefaultMatchDatabase(): MatchDatabase {
  if (!defaultDatabase) {
    defaultDatabase = createMatchDatabase();
  }
  return defaultDatabase;
}

export function setDefaultMatchDatabase(database: MatchDatabase): void {
  defaultDatabase = database;
}

export function resetDefaultMatchDatabase(): void {
  defaultDatabase = null;
}
