import { createHistoryRepository } from "@/lib/database/historyRepository";
import { createLocalStorageMatchDatabase } from "@/lib/database/localStorageDatabase";
import type { HistoryRepository } from "@/lib/database/historyRepository";

let browserRepository: HistoryRepository | null = null;

export function getBrowserHistoryRepository(): HistoryRepository {
  if (typeof window === "undefined") {
    return createHistoryRepository(createLocalStorageMatchDatabase());
  }

  if (!browserRepository) {
    browserRepository = createHistoryRepository(createLocalStorageMatchDatabase());
  }

  return browserRepository;
}

export function resetBrowserHistoryRepository(): void {
  browserRepository = null;
}
