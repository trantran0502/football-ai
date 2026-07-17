import type { HistoricalFundamentalsDatasetEntry } from "@/lib/fundamentalsBacktest/fundamentalsBacktestTypes";

const dataset: HistoricalFundamentalsDatasetEntry[] = [];

export function appendFundamentalsDatasetEntry(
  entry: HistoricalFundamentalsDatasetEntry
): void {
  dataset.push(entry);
}

export function listFundamentalsDataset(): HistoricalFundamentalsDatasetEntry[] {
  return [...dataset];
}

export function clearFundamentalsDatasetForTests(): void {
  dataset.length = 0;
}

export function replaceFundamentalsDataset(
  entries: HistoricalFundamentalsDatasetEntry[]
): void {
  dataset.length = 0;
  dataset.push(...entries);
}
