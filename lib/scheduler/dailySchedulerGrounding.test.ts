import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testDailySchedulerUsesMatchRecordsProviderPrefetch(): void {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(currentDir, "dailyScheduler.ts"), "utf8");

  assert(
    source.includes("prefetchProductionProvidersFromMatchRecords"),
    "dailyScheduler must call prefetchProductionProvidersFromMatchRecords"
  );
  assert(
    !source.includes("prefetchProductionCombinedGrounding"),
    "dailyScheduler must not call prefetchProductionCombinedGrounding"
  );
  assert(
    !source.includes("prefetchProductionSquadAvailability"),
    "dailyScheduler must not call legacy prefetchProductionSquadAvailability"
  );
  assert(
    !source.includes("prefetchProductionMatchContext"),
    "dailyScheduler must not call legacy prefetchProductionMatchContext"
  );
  assert(
    !source.includes("shouldSkipGroundingDeferredRetry"),
    "dailyScheduler must not defer or retry for grounding"
  );
  assert(
    !source.includes("beginGroundingRequestBudgetBatch"),
    "dailyScheduler must not initialize grounding request budget"
  );
  assert(
    source.includes("buildFixtureGroundingDiagnostic"),
    "dailyScheduler must build fixture grounding diagnostics from provider prefetch"
  );
}

function testLegacyPrefetchProvidersDoNotFetch(): void {
  const providersDir = join(dirname(fileURLToPath(import.meta.url)), "..", "providers");
  const squadSource = readFileSync(
    join(providersDir, "squadAvailability", "productionSquadAvailabilityProvider.ts"),
    "utf8"
  );
  const matchSource = readFileSync(
    join(providersDir, "matchContext", "productionMatchContextProvider.ts"),
    "utf8"
  );

  assert(
    !squadSource.includes("prefetchProductionCombinedGrounding"),
    "legacy squad prefetch must not invoke combined fetch"
  );
  assert(
    squadSource.includes("legacy_prefetch_disabled_use_combined"),
    "legacy squad prefetch must be explicitly disabled"
  );
  assert(
    !matchSource.includes("prefetchProductionCombinedGrounding"),
    "legacy match context prefetch must not invoke combined fetch"
  );
  assert(
    matchSource.includes("legacy_prefetch_disabled_use_combined"),
    "legacy match context prefetch must be explicitly disabled"
  );
}

function runTests(): void {
  testDailySchedulerUsesMatchRecordsProviderPrefetch();
  testLegacyPrefetchProvidersDoNotFetch();
  console.log("dailySchedulerGrounding.test.ts passed");
}

runTests();
