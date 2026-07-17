import {
  runProductionSupabaseVerification,
  writeProductionVerificationArtifacts,
} from "@/lib/supabase/productionVerification";

async function main(): Promise<void> {
  const skipBuild = process.argv.includes("--skip-build");
  const report = await runProductionSupabaseVerification({ skipBuild });
  writeProductionVerificationArtifacts(report);

  console.log("PRODUCTION SUPABASE VERIFICATION");
  console.log(`Overall: ${report.overallStatus}`);
  console.log(`Production Deployment: ${report.productionDeployment}`);
  console.log(`Environment Variables: ${report.environmentVariables}`);
  console.log(`Authenticated Health Route: ${report.authenticatedHealthRoute}`);
  console.log(`Production Insert: ${report.productionInsert}`);
  console.log(`Production Select: ${report.productionSelect}`);
  console.log(`Production Update: ${report.productionUpdate}`);
  console.log(`Production Delete: ${report.productionDelete}`);
  console.log(`Cleanup: ${report.cleanup}`);
  console.log(`Manual Action Required: ${report.manualActionRequired ? "yes" : "no"}`);
  console.log("Report: PRODUCTION_SUPABASE_VERIFICATION.md");

  process.exit(
    report.overallStatus === "PASS" ? 0 : report.overallStatus === "FAIL" ? 1 : 2
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
