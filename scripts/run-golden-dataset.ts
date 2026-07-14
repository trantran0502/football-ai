import { formatGoldenReport, runGoldenDataset } from "../lib/golden";

const report = runGoldenDataset();

console.log(formatGoldenReport(report));

if (!report.allPassed) {
  const failed = report.results.filter((item) => item.status === "FAIL");
  for (const item of failed) {
    console.error(`\nFailed match: ${item.id}`);
    if (item.parser.status === "FAIL") {
      console.error("Parser diffs:", JSON.stringify(item.parser.diffs.slice(0, 5), null, 2));
    }
    if (item.analysis.status === "FAIL") {
      console.error("Analysis diffs:", JSON.stringify(item.analysis.diffs.slice(0, 5), null, 2));
    }
    if (item.candidates.status === "FAIL") {
      console.error("Candidate diffs:", JSON.stringify(item.candidates.diffs.slice(0, 5), null, 2));
    }
  }
  process.exit(1);
}

console.log("\nAll golden dataset checks passed.");
