import {
  runProductionApiFootballVerification,
  writeProductionApiFootballVerificationArtifacts,
} from "@/lib/providers/apiFootball/productionApiFootballVerification";

async function main(): Promise<void> {
  const skipBuild = process.argv.includes("--skip-build");
  const report = await runProductionApiFootballVerification({ skipBuild });
  writeProductionApiFootballVerificationArtifacts(report);

  console.log("PRODUCTION API-FOOTBALL VERIFICATION");
  console.log(`Overall: ${report.overallStatus}`);
  console.log(`Production Deployment: ${report.productionDeployment}`);
  console.log(`Environment Variables: ${report.environmentVariables}`);
  console.log(`Authenticated Health Route: ${report.authenticatedHealthRoute}`);
  console.log(`Provider Raw Endpoint: ${report.providerRawEndpoint}`);
  console.log(`Provider Team Lookup: ${report.providerTeamLookup}`);
  console.log(`Provider Fixture Lookup: ${report.providerFixtureLookup}`);
  console.log(`Manual Action Required: ${report.manualActionRequired ? "yes" : "no"}`);
  console.log("Report: PRODUCTION_API_FOOTBALL_VERIFICATION.md");

  process.exit(
    report.overallStatus === "PASS" ? 0 : report.overallStatus === "FAIL" ? 1 : 2
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
