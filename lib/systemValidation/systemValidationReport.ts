import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import type { SystemValidationReport, ValidationSectionResult } from "./systemValidationTypes";

function sectionSummary(section: ValidationSectionResult): string {
  return `- **${section.name}**: ${section.status} (passed ${section.checksPassed}, failed ${section.checksFailed})`;
}

export function writeSystemValidationReports(
  report: SystemValidationReport,
  artifactsDir: string
): { jsonPath: string; markdownPath: string } {
  mkdirSync(artifactsDir, { recursive: true });
  const jsonPath = path.join(artifactsDir, "system-validation-report.json");
  const markdownPath = path.join(artifactsDir, "system-validation-report.md");

  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const lines: string[] = [
    "# Football AI V1 System Validation Report",
    "",
    `- **Overall**: ${report.overallStatus}`,
    `- **Started**: ${report.startedAt}`,
    `- **Completed**: ${report.completedAt}`,
    `- **Duration**: ${report.durationMs}ms`,
    `- **Git Commit**: ${report.gitCommit ?? "unknown"}`,
    `- **Fixtures**: ${report.fixtureCount}`,
    "",
    "## Summary",
    "",
    sectionSummary(report.build),
    sectionSummary(report.unitTests),
    sectionSummary(report.marketEngine),
    sectionSummary(report.rules),
    sectionSummary(report.patterns),
    sectionSummary(report.knowledgeBatch),
    sectionSummary(report.replay),
    sectionSummary(report.persistence),
    sectionSummary(report.incremental),
    sectionSummary(report.consistency),
    sectionSummary(report.verifiedPipeline),
    "",
    "## Consistency",
    "",
    `- Batch checksum: ${report.consistency.batchChecksum ?? "n/a"}`,
    `- Replay checksum: ${report.consistency.replayChecksum ?? "n/a"}`,
    `- Incremental checksum: ${report.consistency.incrementalChecksum ?? "n/a"}`,
  ];

  if (report.consistency.firstDiff) {
    lines.push(
      "",
      "### First Difference",
      "",
      `- Path: \`${report.consistency.firstDiff.path}\``,
      `- Batch: \`${JSON.stringify(report.consistency.firstDiff.batch)}\``,
      `- Replay: \`${JSON.stringify(report.consistency.firstDiff.replay)}\``,
      `- Incremental: \`${JSON.stringify(report.consistency.firstDiff.incremental)}\``,
    );
  }

  for (const section of [
    report.build,
    report.unitTests,
    report.marketEngine,
    report.rules,
    report.patterns,
    report.knowledgeBatch,
    report.replay,
    report.persistence,
    report.incremental,
    report.consistency,
    report.verifiedPipeline,
  ]) {
    if (section.errors.length === 0 && section.details.every((item) => item.status !== "FAIL")) {
      continue;
    }

    lines.push("", `## ${section.name} Details`, "");
    for (const error of section.errors) {
      lines.push(`- ERROR: ${error}`);
    }
    for (const warning of section.warnings) {
      lines.push(`- WARNING: ${warning}`);
    }
    for (const detail of section.details.filter((item) => item.status === "FAIL")) {
      lines.push(`- FAIL \`${detail.name}\`: ${detail.message ?? ""}`);
      if (detail.expected !== undefined) {
        lines.push(`  - Expected: ${detail.expected}`);
      }
      if (detail.actual !== undefined) {
        lines.push(`  - Actual: ${detail.actual}`);
      }
      if (detail.stack) {
        lines.push("  ```");
        lines.push(`  ${detail.stack}`);
        lines.push("  ```");
      }
    }
  }

  writeFileSync(markdownPath, lines.join("\n"), "utf8");
  return { jsonPath, markdownPath };
}

export function printSystemValidationConsoleSummary(report: SystemValidationReport, paths: {
  jsonPath: string;
  markdownPath: string;
}): void {
  console.log("SYSTEM VALIDATION");
  console.log("");
  console.log(`Overall: ${report.overallStatus}`);
  console.log("");
  console.log(`Build:\n${report.build.status}`);
  console.log("");
  console.log(
    `Unit Tests:\n${report.unitTests.status}\nPassed:\n${report.unitTests.passed}\nFailed:\n${report.unitTests.failed}\nSkipped:\n${report.unitTests.skipped}`
  );
  console.log("");
  console.log(`Market Engine:\n${report.marketEngine.status}`);
  console.log("");
  console.log(`Rules:\n${report.rules.status}`);
  console.log("");
  console.log(`Patterns:\n${report.patterns.status}`);
  console.log("");
  console.log(`Knowledge Batch:\n${report.knowledgeBatch.status}`);
  console.log("");
  console.log(`Replay:\n${report.replay.status}`);
  console.log("");
  console.log(`Persistence:\n${report.persistence.status}`);
  console.log("");
  console.log(`Incremental:\n${report.incremental.status}`);
  console.log("");
  console.log(`Consistency:\n${report.consistency.status}`);
  console.log("");
  console.log(`Verified Pipeline:\n${report.verifiedPipeline.status}`);
  console.log("");
  console.log("Reports:");
  console.log(paths.jsonPath);
  console.log(paths.markdownPath);
}
