import {
  canMakeApiFootballRequest,
  canMakeApiFootballRequestForPurpose,
  canMakeApiFootballRequestForResultUpdate,
  getGeneralDailyQuotaLimit,
  getResultUpdateReservedDailyQuota,
  resetApiFootballQuotaForTests,
  runWithApiFootballQuotaPurpose,
  setApiFootballQuotaForTests,
} from "@/lib/providers/apiFootball/apiFootballQuota";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testGeneralQuotaReservesHeadroomForResultUpdate(): void {
  resetApiFootballQuotaForTests();
  const reserved = getResultUpdateReservedDailyQuota();
  const generalLimit = getGeneralDailyQuotaLimit();
  assert(generalLimit + reserved === 100, "general + reserved should equal daily limit");
  assert(
    canMakeApiFootballRequestForPurpose("general"),
    "general should be available below reserved boundary"
  );

  setApiFootballQuotaForTests({ dailyCount: generalLimit });
  assert(
    !canMakeApiFootballRequestForPurpose("general"),
    "general should stop before full daily limit"
  );
  assert(
    canMakeApiFootballRequestForResultUpdate(),
    "result update should still have reserved quota"
  );

  setApiFootballQuotaForTests({ dailyCount: 100 });
  assert(
    !canMakeApiFootballRequestForResultUpdate(),
    "result update should stop at full daily limit"
  );
}

async function testRunWithApiFootballQuotaPurposeRestoresContext(): Promise<void> {
  resetApiFootballQuotaForTests();
  setApiFootballQuotaForTests({ dailyCount: getGeneralDailyQuotaLimit() });

  assert(!canMakeApiFootballRequest(), "general should be blocked at reserved boundary");

  await runWithApiFootballQuotaPurpose("result_update", async () => {
    assert(
      canMakeApiFootballRequestForResultUpdate(),
      "result update purpose should access reserved quota"
    );
  });

  assert(!canMakeApiFootballRequest(), "general purpose should be restored after scope");
}

async function runTests(): Promise<void> {
  testGeneralQuotaReservesHeadroomForResultUpdate();
  await testRunWithApiFootballQuotaPurposeRestoresContext();
  console.log("apiFootballQuota.test.ts passed");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
