import { mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { loadEnvLocal } from "@/lib/healthCheck/productionHealthCheckRunner";
import {
  renderApiFootballHealthMarkdown,
  runApiFootballHealthReport,
} from "@/lib/providers/apiFootball/apiFootballHealthRunner";

async function main(): Promise<void> {
  loadEnvLocal();

  const report = await runApiFootballHealthReport();
  const markdown = renderApiFootballHealthMarkdown(report);

  writeFileSync(resolve(process.cwd(), "API_FOOTBALL_HEALTH_REPORT.md"), markdown, "utf8");

  const artifactsDir = resolve(process.cwd(), "artifacts");
  if (!existsSync(artifactsDir)) {
    mkdirSync(artifactsDir, { recursive: true });
  }
  writeFileSync(
    resolve(artifactsDir, "api-football-health-report.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );

  console.log("API-FOOTBALL HEALTH");
  console.log(`Overall: ${report.overallStatus}`);
  console.log(`Environment variable: ${report.environmentVariableName}`);
  console.log(`Key configured: ${report.keyConfigured ? "yes" : "no"}`);
  console.log(`Base URL: ${report.baseUrl}`);
  console.log(
    `Quota headers: limit=${report.quotaHeaders.requestsLimit ?? "-"} remaining=${report.quotaHeaders.requestsRemaining ?? "-"}`
  );
  console.log(`Manual Action Required: ${report.manualActionRequired ? "yes" : "no"}`);

  if (report.rootCauses.length > 0) {
    console.log("Root Causes:");
    for (const cause of report.rootCauses) {
      console.log(`- ${cause}`);
    }
  }

  console.log("Report: API_FOOTBALL_HEALTH_REPORT.md");

  const exitCode =
    report.overallStatus === "FAIL" ||
    report.overallStatus === "MANUAL ACTION REQUIRED"
      ? 1
      : 0;
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
