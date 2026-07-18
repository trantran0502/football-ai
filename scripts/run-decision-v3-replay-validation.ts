import { loadEnvConfig } from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildDecisionV3ReplayValidationMarkdown,
  formatReplayValidationLoadSummary,
  loadHistoricalMatchRecordsForReplayValidation,
  runDecisionV3ReplayValidation,
  sanitizeDecisionV3ReplayValidationReportForArtifact,
  stampDecisionV3ReplayValidationReport,
} from "@/lib/replay/v3";

const JSON_ARTIFACT = resolve(process.cwd(), "artifacts/decision-v3-replay-validation.json");
const MARKDOWN_ARTIFACT = resolve(process.cwd(), "artifacts/decision-v3-replay-validation.md");

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  const { records, summary } = await loadHistoricalMatchRecordsForReplayValidation();
  console.log(formatReplayValidationLoadSummary(summary));
  console.log("");

  const run = runDecisionV3ReplayValidation({
    records,
    options: {
      includeMockFixtures: false,
    },
  });

  const report = stampDecisionV3ReplayValidationReport(run.report);
  const artifact = sanitizeDecisionV3ReplayValidationReportForArtifact(report);
  const markdown = buildDecisionV3ReplayValidationMarkdown(report);

  mkdirSync(resolve(process.cwd(), "artifacts"), { recursive: true });
  writeFileSync(JSON_ARTIFACT, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  writeFileSync(MARKDOWN_ARTIFACT, markdown, "utf8");

  console.log("DECISION V3 REPLAY VALIDATION");
  console.log("");
  console.log(`Verdict: ${report.verdict}`);
  console.log(`Total records: ${report.dataset.totalRecords}`);
  console.log(`Eligible records: ${report.dataset.eligibleRecords}`);
  console.log(`Excluded records: ${report.dataset.excludedRecords}`);

  if (Object.keys(report.dataset.exclusionReasons).length > 0) {
    console.log("");
    console.log("Exclusion breakdown:");
    for (const [reason, count] of Object.entries(report.dataset.exclusionReasons).sort(
      ([left], [right]) => left.localeCompare(right)
    )) {
      console.log(`- ${reason}: ${count}`);
    }
  }

  console.log("");
  console.log(`JSON: ${JSON_ARTIFACT}`);
  console.log(`Markdown: ${MARKDOWN_ARTIFACT}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
