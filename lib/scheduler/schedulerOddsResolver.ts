import type { OddsData, OddsProvider, OddsQuery } from "@/lib/providers/providerTypes";
import {
  assertSchedulerOddsProviderAllowed,
  resolveSchedulerOddsProviderSource,
  type ResolveSchedulerOddsProviderSourceDeps,
  type SchedulerOddsProviderSource,
} from "@/lib/scheduler/schedulerOddsConfig";
import { createSchedulerOddsProvider } from "@/lib/scheduler/schedulerOddsProvider";
import { buildSchedulerPlaceholderOdds } from "@/lib/scheduler/schedulerPlaceholderOdds";
import { formatSchedulerRawOdds } from "@/lib/scheduler/schedulerRawOddsFormatter";

export interface SchedulerOddsResolverInput {
  query: OddsQuery;
  homeTeam: string;
  awayTeam: string;
}

export interface SchedulerOddsResolverDeps extends ResolveSchedulerOddsProviderSourceDeps {
  providerSource?: SchedulerOddsProviderSource;
  provider?: OddsProvider;
  formatter?: (oddsData: OddsData) => string | null;
  canUseOddsProvider?: () => boolean;
  createProvider?: (source: SchedulerOddsProviderSource) => OddsProvider | null;
}

export interface SchedulerOddsResolveOutcome {
  rawOdds: string;
  source: SchedulerOddsProviderSource;
  usedFallback: boolean;
  providerError: boolean;
}

function pickOddsData(results: OddsData[], query: OddsQuery): OddsData | null {
  if (results.length === 0) {
    return null;
  }

  if (query.fixtureId !== undefined) {
    const byFixture = results.find((item) => item.fixtureId === query.fixtureId);
    if (byFixture) {
      return byFixture;
    }
  }

  if (query.matchId) {
    const byMatch = results.find((item) => item.matchId === query.matchId);
    if (byMatch) {
      return byMatch;
    }
  }

  return results[0] ?? null;
}

function buildPlaceholderOutcome(
  input: SchedulerOddsResolverInput,
  source: SchedulerOddsProviderSource,
  providerError: boolean
): SchedulerOddsResolveOutcome {
  return {
    rawOdds: buildSchedulerPlaceholderOdds(input.homeTeam, input.awayTeam),
    source,
    usedFallback: true,
    providerError,
  };
}

/**
 * 解析 Scheduler rawOdds，並回傳 observability outcome。
 * Feature Flag → Provider → Formatter → Fallback。
 */
export async function resolveSchedulerRawOddsDetailed(
  input: SchedulerOddsResolverInput,
  deps: SchedulerOddsResolverDeps = {}
): Promise<SchedulerOddsResolveOutcome> {
  const source =
    deps.providerSource ?? resolveSchedulerOddsProviderSource(deps);
  assertSchedulerOddsProviderAllowed(source);

  if (source === "placeholder") {
    return buildPlaceholderOutcome(input, "placeholder", false);
  }

  const canUseProvider = deps.canUseOddsProvider?.() ?? true;
  if (!canUseProvider) {
    return buildPlaceholderOutcome(input, source, true);
  }

  const createProvider = deps.createProvider ?? createSchedulerOddsProvider;
  const provider = deps.provider ?? createProvider(source);
  if (!provider) {
    return buildPlaceholderOutcome(input, "placeholder", true);
  }

  const formatter = deps.formatter ?? formatSchedulerRawOdds;

  try {
    const results = await provider.fetchOdds(input.query);
    const oddsData = pickOddsData(results, input.query);
    if (!oddsData) {
      return buildPlaceholderOutcome(input, source, true);
    }

    const formatted = formatter(oddsData);
    if (!formatted?.trim()) {
      return buildPlaceholderOutcome(input, source, true);
    }

    return {
      rawOdds: formatted,
      source,
      usedFallback: false,
      providerError: false,
    };
  } catch {
    return buildPlaceholderOutcome(input, source, true);
  }
}

/**
 * 解析 Scheduler rawOdds。
 * 永遠回傳 non-empty string，不帶 metadata。
 */
export async function resolveSchedulerRawOdds(
  input: SchedulerOddsResolverInput,
  deps: SchedulerOddsResolverDeps = {}
): Promise<string> {
  const outcome = await resolveSchedulerRawOddsDetailed(input, deps);
  return outcome.rawOdds;
}
