export * from "@/lib/fundamentalsBacktest/fundamentalsBacktestTypes";
export {
  validateDataLeakage,
  validateSnapshotLeakage,
  isOnOrAfterSource,
} from "@/lib/fundamentalsBacktest/dataLeakageValidator";
export { buildPreMatchSnapshot } from "@/lib/fundamentalsBacktest/preMatchSnapshotBuilder";
export {
  collectEvidenceForSnapshot,
  buildEvidenceBreakdownForSnapshot,
} from "@/lib/fundamentalsBacktest/fundamentalsEvidenceAdapter";
export {
  buildFundamentalsPrediction,
  evaluateDirectionAccuracy,
  evaluateBttsAccuracy,
  evaluateOverUnderAccuracy,
  evaluateCleanSheetAccuracy,
  evaluateEvidenceProviderAccuracy,
} from "@/lib/fundamentalsBacktest/fundamentalsPrediction";
export {
  runFundamentalsBacktest,
  isMarketLearningAllowed,
} from "@/lib/fundamentalsBacktest/fundamentalsBacktestEngine";
export { buildHistoricalFundamentalsBacktestFromRecords } from "@/lib/fundamentalsBacktest/historicalBacktestLoader";
export {
  appendFundamentalsDatasetEntry,
  listFundamentalsDataset,
  clearFundamentalsDatasetForTests,
  replaceFundamentalsDataset,
} from "@/lib/fundamentalsBacktest/fundamentalsDatasetStore";
