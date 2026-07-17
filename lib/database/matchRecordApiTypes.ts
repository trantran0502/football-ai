import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { StorageHealth } from "@/lib/storage/storageStatus";

export interface MatchRecordVerifyResult {
  record: HistoricalMatchRecord | null;
  storage: StorageHealth;
}
