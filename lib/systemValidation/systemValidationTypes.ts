export type ValidationStatus = "PASS" | "FAIL" | "SKIP";

export interface ValidationCheckDetail {
  name: string;
  status: ValidationStatus;
  message?: string;
  expected?: string;
  actual?: string;
  stack?: string;
}

export interface ValidationSectionResult {
  name: string;
  status: ValidationStatus;
  checksPassed: number;
  checksFailed: number;
  warnings: string[];
  errors: string[];
  details: ValidationCheckDetail[];
}

export interface ConsistencyDiffResult {
  path: string;
  batch: unknown;
  replay: unknown;
  incremental: unknown;
}

export interface SystemValidationReport {
  overallStatus: ValidationStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  gitCommit: string | null;
  fixtureCount: number;
  build: ValidationSectionResult;
  unitTests: ValidationSectionResult & {
    passed: number;
    failed: number;
    skipped: number;
  };
  marketEngine: ValidationSectionResult;
  rules: ValidationSectionResult;
  patterns: ValidationSectionResult;
  knowledgeBatch: ValidationSectionResult;
  replay: ValidationSectionResult;
  persistence: ValidationSectionResult;
  incremental: ValidationSectionResult;
  consistency: ValidationSectionResult & {
    firstDiff: ConsistencyDiffResult | null;
    batchChecksum: string | null;
    replayChecksum: string | null;
    incrementalChecksum: string | null;
  };
  verifiedPipeline: ValidationSectionResult;
}

export interface SystemValidationRunOptions {
  fixtures?: import("@/lib/database/matchSchema").HistoricalMatchRecord[];
  skipBuild?: boolean;
  skipUnitTests?: boolean;
  artifactsDir?: string;
  tempPersistenceDir?: string;
}

export interface SystemValidationRunResult {
  report: SystemValidationReport;
  jsonPath: string;
  markdownPath: string;
}
