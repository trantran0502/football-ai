export type {
  GoldenDiff,
  GoldenExpectedAnalysis,
  GoldenExpectedCandidates,
  GoldenExpectedParser,
  GoldenInterpretationSnapshot,
  GoldenMarketSnapshot,
  GoldenMatch,
  GoldenMatchExpectation,
  GoldenMatchInput,
  GoldenMatchResult,
  GoldenMatchRunResult,
  GoldenReport,
  GoldenStageResult,
  GoldenStageStatus,
} from "@/lib/golden/types";

export { collectDiffs, compareStage } from "@/lib/golden/compare";
export {
  GOLDEN_DATA_DIR,
  GOLDEN_EXPECTED_FILE,
  GOLDEN_MATCHES_FILE,
  loadGoldenDataset,
  loadGoldenExpectedFile,
  loadGoldenMatchesFile,
  mergeGoldenDataset,
  writeGoldenDataset,
} from "@/lib/golden/loadGoldenDataset";
export {
  buildAnalysisSnapshot,
  buildCandidateSnapshot,
  buildGoldenMatchResult,
  buildParserSnapshot,
  snapshotMarket,
} from "@/lib/golden/snapshot";
export {
  formatGoldenReport,
  runGoldenDataset,
} from "@/lib/golden/goldenDatasetRunner";
