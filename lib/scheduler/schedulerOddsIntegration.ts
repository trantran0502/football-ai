import type { ProductionFixture } from "@/lib/production/productionTypes";
import type { OddsQuery } from "@/lib/providers/providerTypes";
import { canMakeApiFootballRequest } from "@/lib/providers/apiFootball/apiFootballQuota";
import {
  toProductionFixture,
} from "@/lib/scheduler/fixtureMapping";
import { buildSchedulerPlaceholderOdds } from "@/lib/scheduler/schedulerPlaceholderOdds";
import {
  assertSchedulerOddsProviderAllowed,
  logSchedulerOddsProvider,
  resolveSchedulerOddsProviderSource,
  type SchedulerOddsProviderSource,
} from "@/lib/scheduler/schedulerOddsConfig";
import {
  resolveSchedulerRawOddsDetailed,
  type SchedulerOddsResolverDeps,
} from "@/lib/scheduler/schedulerOddsResolver";
import type { SchedulerFixtureSource } from "@/lib/scheduler/schedulerTypes";

export interface SchedulerOddsStats {
  source: SchedulerOddsProviderSource;
  total: number;
  resolved: number;
  fallback: number;
  providerErrors: number;
}

export interface SchedulerOddsIntegrationDeps extends SchedulerOddsResolverDeps {
  canMakeApiFootballRequest?: () => boolean;
  providerSource?: SchedulerOddsProviderSource;
}

export function buildOddsQueryFromSchedulerFixture(
  fixture: SchedulerFixtureSource
): OddsQuery {
  return {
    fixtureId: fixture.fixtureId,
  };
}

/**
 * 在 filter analyzable 之後、ProductionFixture 之前解析 rawOdds。
 * 單場 fallback 不會中斷 batch。
 */
export async function resolveSchedulerFixturesToProduction(
  fixtures: SchedulerFixtureSource[],
  deps: SchedulerOddsIntegrationDeps = {}
): Promise<{
  productionFixtures: ProductionFixture[];
  schedulerOdds: SchedulerOddsStats;
}> {
  const providerSource =
    deps.providerSource ?? resolveSchedulerOddsProviderSource(deps);
  assertSchedulerOddsProviderAllowed(providerSource);
  logSchedulerOddsProvider(providerSource);
  const quotaGate = deps.canMakeApiFootballRequest ?? canMakeApiFootballRequest;
  const schedulerOdds: SchedulerOddsStats = {
    source: providerSource,
    total: fixtures.length,
    resolved: 0,
    fallback: 0,
    providerErrors: 0,
  };
  const productionFixtures: ProductionFixture[] = [];
  let providerBlocked =
    providerSource === "api-football" && !quotaGate();

  for (const fixture of fixtures) {
    if (providerSource === "api-football") {
      if (providerBlocked || !quotaGate()) {
        providerBlocked = true;
        schedulerOdds.fallback += 1;
        schedulerOdds.providerErrors += 1;
        productionFixtures.push(
          toProductionFixture({
            ...fixture,
            rawOdds: buildSchedulerPlaceholderOdds(fixture.homeTeam, fixture.awayTeam),
          })
        );
        continue;
      }
    }

    const outcome = await resolveSchedulerRawOddsDetailed(
      {
        query: buildOddsQueryFromSchedulerFixture(fixture),
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
      },
      {
        ...deps,
        providerSource,
        canUseOddsProvider: () => !providerBlocked && quotaGate(),
      }
    );

    if (outcome.usedFallback) {
      schedulerOdds.fallback += 1;
    } else {
      schedulerOdds.resolved += 1;
    }
    if (outcome.providerError) {
      schedulerOdds.providerErrors += 1;
    }
    if (providerSource === "api-football" && !quotaGate()) {
      providerBlocked = true;
    }

    productionFixtures.push(
      toProductionFixture({
        ...fixture,
        rawOdds: outcome.rawOdds,
      })
    );
  }

  return { productionFixtures, schedulerOdds };
}
