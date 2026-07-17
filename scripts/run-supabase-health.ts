import { mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { loadEnvLocal } from "@/lib/healthCheck/productionHealthCheckRunner";
import {
  renderSupabaseHealthMarkdown,
  runSupabaseHealthReport,
} from "@/lib/supabase/supabaseHealthRunner";

async function main(): Promise<void> {
  loadEnvLocal();

  const report = await runSupabaseHealthReport();
  const markdown = renderSupabaseHealthMarkdown(report);

  writeFileSync(resolve(process.cwd(), "SUPABASE_HEALTH_REPORT.md"), markdown, "utf8");

  const artifactsDir = resolve(process.cwd(), "artifacts");
  if (!existsSync(artifactsDir)) {
    mkdirSync(artifactsDir, { recursive: true });
  }
  writeFileSync(
    resolve(artifactsDir, "supabase-health-report.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );

  console.log("SUPABASE HEALTH");
  console.log(`Overall: ${report.overallStatus}`);
  console.log(`Migration: ${report.migrationStatus}`);
  console.log(`Local CRUD: ${report.localCrudStatus}`);
  console.log(`Production CRUD: ${report.productionCrudStatus}`);
  console.log(`RLS: ${report.rlsStatus}`);
  console.log(`Manual Action Required: ${report.manualActionRequired ? "yes" : "no"}`);

  if (report.rootCauses.length > 0) {
    console.log("Root Causes:");
    for (const cause of report.rootCauses) {
      console.log(`- ${cause}`);
    }
  }

  console.log("Report: SUPABASE_HEALTH_REPORT.md");

  const exitCode =
    report.overallStatus === "FAIL" || report.overallStatus === "MANUAL ACTION REQUIRED"
      ? 1
      : 0;
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
