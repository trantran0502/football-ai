export type SchedulerOddsProviderSource = "placeholder" | "mock" | "api-football";

export type SchedulerOddsSource = "mock" | "api-football";

export type SchedulerOddsProviderMode = "REAL" | "MOCK";

function parseBooleanEnv(value: string | undefined): boolean | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return null;
}

export function isProductionNodeEnvironment(): boolean {
  return process.env.NODE_ENV === "production";
}

export function isTestNodeEnvironment(): boolean {
  return process.env.NODE_ENV === "test";
}

export function readUseRealSchedulerOddsEnv(): boolean | null {
  return parseBooleanEnv(process.env.USE_REAL_SCHEDULER_ODDS);
}

export function isRealSchedulerOddsEnabled(): boolean {
  const explicit = readUseRealSchedulerOddsEnv();
  if (explicit !== null) {
    return explicit;
  }

  return isProductionNodeEnvironment();
}

export function getSchedulerOddsSource(): SchedulerOddsSource | null {
  const value = process.env.SCHEDULER_ODDS_SOURCE?.trim().toLowerCase();
  if (value === "mock") {
    return "mock";
  }
  if (value === "api-football") {
    return "api-football";
  }
  return null;
}

export function isMockSchedulerOddsAllowed(): boolean {
  if (isProductionNodeEnvironment()) {
    return false;
  }
  if (isTestNodeEnvironment()) {
    return true;
  }
  return !isRealSchedulerOddsEnabled();
}

export function assertProductionSchedulerOddsConfiguration(): void {
  if (!isProductionNodeEnvironment()) {
    return;
  }

  if (readUseRealSchedulerOddsEnv() === false) {
    throw new Error(
      "Production scheduler requires USE_REAL_SCHEDULER_ODDS=true. Mock and placeholder odds are forbidden in production."
    );
  }
}

export function assertMockSchedulerOddsAllowed(): void {
  if (!isMockSchedulerOddsAllowed()) {
    throw new Error(
      "MockOddsAdapter is only allowed when NODE_ENV=test or USE_REAL_SCHEDULER_ODDS=false."
    );
  }
}

export function assertSchedulerOddsProviderAllowed(
  source: SchedulerOddsProviderSource
): void {
  assertProductionSchedulerOddsConfiguration();

  if (isProductionNodeEnvironment()) {
    if (source !== "api-football") {
      throw new Error(
        `Production scheduler cannot use ${source} odds. Configure SCHEDULER_ODDS_SOURCE=api-football.`
      );
    }
    return;
  }

  if (source === "mock") {
    assertMockSchedulerOddsAllowed();
  }
}

export function getSchedulerOddsProviderMode(
  source: SchedulerOddsProviderSource
): SchedulerOddsProviderMode {
  return source === "api-football" ? "REAL" : "MOCK";
}

export function logSchedulerOddsProvider(source: SchedulerOddsProviderSource): void {
  console.log(`Scheduler Odds Provider: ${getSchedulerOddsProviderMode(source)}`);
}

export function shouldUseMockSchedulerOddsProvider(): boolean {
  return (
    isRealSchedulerOddsEnabled() &&
    getSchedulerOddsSource() === "mock" &&
    isMockSchedulerOddsAllowed()
  );
}

export function shouldUseApiFootballSchedulerOddsProvider(): boolean {
  if (!isRealSchedulerOddsEnabled()) {
    return false;
  }

  const source = getSchedulerOddsSource();
  return source === "api-football" || source === null;
}

export interface ResolveSchedulerOddsProviderSourceDeps {
  isRealOddsEnabled?: () => boolean;
  getOddsSource?: () => SchedulerOddsSource | null;
}

export function resolveSchedulerOddsProviderSource(
  deps: ResolveSchedulerOddsProviderSourceDeps = {}
): SchedulerOddsProviderSource {
  assertProductionSchedulerOddsConfiguration();

  const enabled = deps.isRealOddsEnabled?.() ?? isRealSchedulerOddsEnabled();
  if (!enabled) {
    const source: SchedulerOddsProviderSource = "placeholder";
    assertSchedulerOddsProviderAllowed(source);
    return source;
  }

  const configuredSource = deps.getOddsSource?.() ?? getSchedulerOddsSource();
  if (configuredSource === "mock") {
    assertMockSchedulerOddsAllowed();
    return "mock";
  }
  if (configuredSource === "api-football") {
    return "api-football";
  }

  return "api-football";
}
