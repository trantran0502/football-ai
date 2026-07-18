/**
 * Historical Pending Cleanup — manual script only.
 *
 * Cleanup plan:
 * 1. Dry-run:  npm run cleanup:pending-records
 * 2. Review plan output (retry candidates + legacy exclusion candidates).
 * 3. Apply:     npm run cleanup:pending-records -- --apply
 * 4. Re-run admin daily cron (or wait for scheduler) to refresh dashboard snapshot counts.
 *
 * Scope:
 * - Retry verification for PENDING records with fixture_id and finished matches.
 * - Mark legacy PENDING records (fixture_id null, match ended, complete analysis) via
 *   analysis_snapshot.pendingPolicy metadata. Status remains PENDING.
 * - Does not delete rows or overwrite raw_odds / marketSelections / analysis content / created_at.
 */

import { loadEnvConfig } from "@next/env";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { HistoricalPendingCleanupResult } from "@/lib/supabase/services/historicalPendingCleanupService";
import { runHistoricalPendingCleanup } from "@/lib/supabase/services/historicalPendingCleanupService";

const OUTPUT_DIR = resolve(process.cwd(), "artifacts/historical-pending-cleanup");

function buildCleanupArtifact(
  result: HistoricalPendingCleanupResult,
  mode: "apply" | "dry_run"
) {
  return {
    generatedAt: new Date().toISOString(),
    mode,
    dryRun: result.dryRun,
    pendingLoadSummary: result.pendingLoadSummary ?? null,
    plan: {
      generatedAt: result.plan.generatedAt,
      retryCandidateIds: result.plan.retryCandidates.map((record) => record.id),
      legacyExclusionCandidateIds: result.plan.legacyExclusionCandidates.map(
        (record) => record.id
      ),
      otherPendingRecordIds: result.plan.otherPendingRecords.map((record) => record.id),
    },
    verificationAttempts: result.verificationAttempts,
    exclusionAttempts: result.exclusionAttempts,
  };
}

function parseArgs(argv: string[]): { apply: boolean } {
  return {
    apply: argv.includes("--apply"),
  };
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  const { apply } = parseArgs(process.argv.slice(2));

  if (!hasSupabaseEnv()) {
    console.error("Supabase env is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  console.log(`Historical Pending Cleanup (${apply ? "APPLY" : "DRY-RUN"})`);
  console.log("This script does not auto-run in production pipelines.");

  const result = await runHistoricalPendingCleanup({ dryRun: !apply });
  const payload = buildCleanupArtifact(result, apply ? "apply" : "dry_run");

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = join(
    OUTPUT_DIR,
    `${apply ? "apply" : "dry-run"}-${Date.now()}.json`
  );
  writeFileSync(outputPath, JSON.stringify(payload, null, 2));

  const loadSummary = result.pendingLoadSummary;
  if (loadSummary) {
    console.log("");
    console.log("Pending load summary:");
    console.log(`  pagesLoaded=${loadSummary.pagesLoaded}`);
    console.log(`  retriesUsed=${loadSummary.retriesUsed}`);
    console.log(`  pendingRecordsLoaded=${loadSummary.pendingRecordsLoaded}`);
    console.log(`  duplicateIdsIgnored=${loadSummary.duplicateIdsIgnored}`);
  }

  console.log("");
  console.log(`Retry candidates: ${result.plan.retryCandidates.length}`);
  console.log(`Legacy exclusion candidates: ${result.plan.legacyExclusionCandidates.length}`);
  console.log(`Other pending records: ${result.plan.otherPendingRecords.length}`);
  console.log("");
  console.log(`Verification attempts: ${result.verificationAttempts.length}`);
  console.log(
    `  verified=${result.verificationAttempts.filter((item) => item.status === "verified").length}, skipped=${result.verificationAttempts.filter((item) => item.status === "skipped").length}, failed=${result.verificationAttempts.filter((item) => item.status === "failed").length}`
  );
  console.log(`Exclusion attempts: ${result.exclusionAttempts.length}`);
  console.log(
    `  excluded=${result.exclusionAttempts.filter((item) => item.status === "excluded").length}, skipped=${result.exclusionAttempts.filter((item) => item.status === "skipped").length}, failed=${result.exclusionAttempts.filter((item) => item.status === "failed").length}`
  );
  console.log("");
  console.log(`Report written to ${outputPath}`);

  if (!apply) {
    console.log("");
    console.log("Dry-run only. Re-run with --apply after reviewing the plan.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
