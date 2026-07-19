import {
  computeNextRunFromHours,
  DEFAULT_DAILY_ANALYSIS_HOURS_UTC,
  DEFAULT_RESULT_UPDATE_HOURS_UTC,
  formatUtcHourList,
  parseUtcHoursEnv,
} from "@/lib/scheduler/cronSchedule";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testParseUtcHoursEnv(): void {
  assert(
    parseUtcHoursEnv("9, 13,21", DEFAULT_RESULT_UPDATE_HOURS_UTC).join(",") === "9,13,21",
    "should parse and sort hours"
  );
  assert(
    parseUtcHoursEnv("", DEFAULT_DAILY_ANALYSIS_HOURS_UTC).join(",") === "0,3,6",
    "empty env should use fallback"
  );
}

function testFormatUtcHourList(): void {
  assert(formatUtcHourList([0, 9]).join("|") === "00:00 UTC|09:00 UTC", "hour formatting");
}

function testComputeNextRunFromHours(): void {
  const next = computeNextRunFromHours([0, 3, 6], new Date("2026-07-19T07:00:00.000Z"));
  assert(next === "2026-07-20T00:00:00.000Z", "should roll to next day after last slot");
}

function runTests(): void {
  testParseUtcHoursEnv();
  testFormatUtcHourList();
  testComputeNextRunFromHours();
  console.log("cronSchedule.test.ts passed");
}

runTests();
