import {
  FREE_DAILY_API_LIMIT,
  getApiFootballKey,
  isFreeMode,
} from "@/lib/providers/free/config";
import type { ApiUsageInfo } from "@/lib/providers/free/types";

interface DailyUsageState {
  date: string;
  used: number;
}

let usageState: DailyUsageState = {
  date: new Date().toISOString().split("T")[0],
  used: 0,
};

function todayKey(): string {
  return new Date().toISOString().split("T")[0];
}

function resetIfNewDay(): void {
  const today = todayKey();
  if (usageState.date !== today) {
    usageState = { date: today, used: 0 };
  }
}

export function incrementApiUsage(count = 1): void {
  resetIfNewDay();
  usageState.used += count;
}

export function getApiUsageInfo(): ApiUsageInfo {
  resetIfNewDay();
  const remaining = Math.max(0, FREE_DAILY_API_LIMIT - usageState.used);
  return {
    date: usageState.date,
    used: usageState.used,
    limit: FREE_DAILY_API_LIMIT,
    remaining,
    quotaExceeded: remaining <= 0,
  };
}

export function canMakeApiRequest(requestCount = 1): boolean {
  if (!isFreeMode()) {
    return false;
  }
  resetIfNewDay();
  return usageState.used + requestCount <= FREE_DAILY_API_LIMIT;
}

export function assertApiKeyConfigured(): void {
  if (!getApiFootballKey()) {
    throw new Error("API_FOOTBALL_KEY is not configured.");
  }
}
