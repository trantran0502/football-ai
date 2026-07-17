import type {
  LeakageValidationMetadata,
  LeakageValidationResult,
  PreMatchSnapshot,
} from "@/lib/fundamentalsBacktest/fundamentalsBacktestTypes";

function parseInstant(value: string): number {
  return new Date(value).getTime();
}

export function isOnOrAfterSource(source: string, fixtureDate: string): boolean {
  return parseInstant(source) >= parseInstant(fixtureDate);
}

export function validateDataLeakage(metadata: LeakageValidationMetadata): LeakageValidationResult {
  const leakageFields: string[] = [];

  if (isOnOrAfterSource(metadata.sourceTimestamp, metadata.fixtureDate)) {
    leakageFields.push("sourceTimestamp");
  }

  if (
    metadata.latestIncludedMatchDate &&
    isOnOrAfterSource(metadata.latestIncludedMatchDate, metadata.fixtureDate)
  ) {
    leakageFields.push("latestIncludedMatchDate");
  }

  if (
    metadata.standingsSnapshotDate &&
    isOnOrAfterSource(metadata.standingsSnapshotDate, metadata.fixtureDate)
  ) {
    leakageFields.push("standingsSnapshotDate");
  }

  if (
    metadata.squadSnapshotDate &&
    isOnOrAfterSource(metadata.squadSnapshotDate, metadata.fixtureDate)
  ) {
    leakageFields.push("squadSnapshotDate");
  }

  if (
    metadata.contextSnapshotDate &&
    isOnOrAfterSource(metadata.contextSnapshotDate, metadata.fixtureDate)
  ) {
    leakageFields.push("contextSnapshotDate");
  }

  const leakageDetected = leakageFields.length > 0;

  return {
    leakageDetected,
    leakageFields,
    validationStatus: leakageDetected ? "INVALID" : "VALID",
    validationReason: leakageDetected
      ? `Data leakage detected in: ${leakageFields.join(", ")}`
      : null,
  };
}

export function validateSnapshotLeakage(snapshot: PreMatchSnapshot): LeakageValidationResult {
  const latestIncludedMatchDate = [
    snapshot.recent10BeforeMatch.home.latestIncludedMatchDate,
    snapshot.recent10BeforeMatch.away.latestIncludedMatchDate,
    snapshot.h2hBeforeMatch?.latestIncludedMatchDate ?? null,
  ]
    .filter((value): value is string => value !== null)
    .sort((left, right) => parseInstant(right) - parseInstant(left))[0] ?? null;

  const metadata: LeakageValidationMetadata = {
    sourceTimestamp: snapshot.sourceTimestamp,
    fixtureDate: snapshot.fixtureDate,
    latestIncludedMatchDate,
    standingsSnapshotDate: snapshot.standingsBeforeMatch[0]?.snapshotDate ?? null,
    squadSnapshotDate: snapshot.squadAvailabilityBeforeMatch?.snapshotDate ?? null,
    contextSnapshotDate: snapshot.scheduleContextBeforeMatch?.snapshotDate ?? null,
  };

  const base = validateDataLeakage(metadata);
  const leakageFields = [...base.leakageFields];

  for (const entry of snapshot.standingsBeforeMatch) {
    if (entry.isFinalSeasonRanking) {
      leakageFields.push("finalSeasonRanking");
    }
    if (isOnOrAfterSource(entry.snapshotDate, snapshot.fixtureDate)) {
      leakageFields.push("standingsBeforeMatch");
    }
  }

  const uniqueFields = [...new Set(leakageFields)];
  const leakageDetected = uniqueFields.length > 0;

  return {
    leakageDetected,
    leakageFields: uniqueFields,
    validationStatus: leakageDetected ? "INVALID" : "VALID",
    validationReason: leakageDetected
      ? `Data leakage detected in: ${uniqueFields.join(", ")}`
      : null,
  };
}
