import { BETA_ROLLING_REPORT_KEY, BETA_STORAGE_KEY } from "@/lib/beta/config";
import type {
  BetaCandidate,
  BetaRecommendationRecord,
  RollingEvaluationReport,
} from "@/lib/beta/types";
import type { TeamDataPackage } from "@/lib/providers/free/types";
import type { MarketSelection } from "@/types/match";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readRecords(): BetaRecommendationRecord[] {
  if (!isBrowser()) {
    return [];
  }
  const raw = window.localStorage.getItem(BETA_STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as BetaRecommendationRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecords(records: BetaRecommendationRecord[]): void {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.setItem(BETA_STORAGE_KEY, JSON.stringify(records));
}

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function saveBetaRecommendations(input: {
  matchRecordId: string;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  rawOdds: string;
  marketSelections: MarketSelection[];
  teamData: TeamDataPackage | null;
  candidates: BetaCandidate[];
}): BetaRecommendationRecord[] {
  const existing = readRecords();
  const created = input.candidates.map((candidate) => ({
    id: generateId(),
    matchRecordId: input.matchRecordId,
    modelVersion: candidate.modelVersion,
    recommendedAt: candidate.createdAt,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    matchDate: input.matchDate,
    candidate,
    rawOdds: input.rawOdds,
    marketSelections: structuredClone(input.marketSelections),
    teamData: input.teamData ? structuredClone(input.teamData) : null,
    rulesUsed: [...candidate.rulesUsed],
    status: "PENDING" as const,
    finalScore: null,
    settlement: null,
    profit: null,
    hit: null,
    verifiedAt: null,
  }));

  writeRecords([...created, ...existing]);
  return created;
}

export function getAllBetaRecommendations(): BetaRecommendationRecord[] {
  return readRecords();
}

export function getBetaRecommendationsByMatch(
  matchRecordId: string
): BetaRecommendationRecord[] {
  return readRecords().filter((item) => item.matchRecordId === matchRecordId);
}

export function getBetaRecommendationsByVersion(
  modelVersion: string
): BetaRecommendationRecord[] {
  return readRecords().filter((item) => item.modelVersion === modelVersion);
}

export function updateBetaRecommendation(
  record: BetaRecommendationRecord
): void {
  const records = readRecords();
  const index = records.findIndex((item) => item.id === record.id);
  if (index === -1) {
    return;
  }
  records[index] = record;
  writeRecords(records);
}

export function clearAllBetaRecommendations(): void {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.removeItem(BETA_STORAGE_KEY);
  window.localStorage.removeItem(BETA_ROLLING_REPORT_KEY);
}

export function saveRollingReport(report: RollingEvaluationReport): void {
  if (!isBrowser()) {
    return;
  }
  const existing = getRollingReports();
  window.localStorage.setItem(
    BETA_ROLLING_REPORT_KEY,
    JSON.stringify([report, ...existing].slice(0, 20))
  );
}

export function getRollingReports(): RollingEvaluationReport[] {
  if (!isBrowser()) {
    return [];
  }
  const raw = window.localStorage.getItem(BETA_ROLLING_REPORT_KEY);
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw) as RollingEvaluationReport[];
  } catch {
    return [];
  }
}

export function getLatestRollingReport(): RollingEvaluationReport | null {
  return getRollingReports()[0] ?? null;
}
