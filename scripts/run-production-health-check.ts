import {
  loadEnvLocal,
  runProductionHealthCheck,
  writeProductionHealthCheckArtifacts,
} from "@/lib/healthCheck/productionHealthCheckRunner";

async function main(): Promise<void> {
  loadEnvLocal();
  const skipShell =
    process.argv.includes("--skip-shell") ||
    process.env.HEALTH_CHECK_SKIP_SHELL === "1";
  const report = await runProductionHealthCheck({ skipShellCommands: skipShell });
  await writeProductionHealthCheckArtifacts(report);

  console.log("FULL PRODUCTION HEALTH CHECK");
  console.log(`Overall: ${report.overallStatus}`);
  console.log(`Critical: ${report.criticalCount}`);
  console.log(`High: ${report.highCount}`);
  console.log(`Supabase: ${report.supabaseStatus}`);
  console.log(`API-Football: ${report.apiFootballStatus}`);
  console.log(`Gemini: ${report.geminiStatus}`);
  console.log(`Scheduler: ${report.schedulerStatus}`);
  console.log(`Pipeline: ${report.pipelineStatus}`);
  console.log(`Production: ${report.productionStatus}`);
  console.log(`Commit: ${report.gitCommit}`);
  console.log("Report: HEALTH_CHECK_REPORT.md");

  process.exit(report.overallStatus === "FAIL" ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
