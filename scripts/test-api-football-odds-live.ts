import { ApiFootballClient } from "@/lib/providers/apiFootball/apiFootballClient";
import {
  mapApiFootballBetsToMarketSelections,
  summarizeMappedMarketCoverage,
} from "@/lib/providers/apiFootball/apiFootballOddsMapper";
import { ApiFootballOddsAdapter } from "@/lib/providers/odds/apiFootballOddsAdapter";
import { loadEnvLocal } from "@/lib/healthCheck/productionHealthCheckRunner";

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  loadEnvLocal();
  const apiKey = process.env.API_FOOTBALL_KEY?.trim();
  if (!apiKey) {
    console.log("SKIP: API_FOOTBALL_KEY is not configured.");
    return;
  }

  const client = new ApiFootballClient({ apiKey });
  if (!client.isConfigured()) {
    console.log("SKIP: API-Football client is not configured.");
    return;
  }

  const date = process.env.API_FOOTBALL_ODDS_PROBE_DATE?.trim() || todayKey();
  console.log(`API-Football odds live probe date=${date}`);

  try {
    const response = await client.getOdds({ date });
    const adapter = new ApiFootballOddsAdapter(client);
    const mapped = await adapter.fetchOdds({ date });

    const bookmakerIds = new Set<string>();
    const coverageTotals = {
      moneyline: 0,
      handicap: 0,
      totalGoals: 0,
      btts: 0,
    };

    for (const item of mapped) {
      if (item.bookmakerId) {
        bookmakerIds.add(item.bookmakerId);
      }
      const coverage = summarizeMappedMarketCoverage(item.marketSelections);
      for (const key of Object.keys(coverageTotals) as Array<keyof typeof coverageTotals>) {
        if (coverage[key] > 0) {
          coverageTotals[key] += 1;
        }
      }
    }

    console.log(
      JSON.stringify(
        {
          fixtureCount: response.items.length,
          mappedFixtureCount: mapped.length,
          bookmakerCount: bookmakerIds.size,
          mappedMarketCoverage: coverageTotals,
          paginationPages: response.pagesFetched,
        },
        null,
        2
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`LIVE_PROBE_FAILED: ${message}`);
    process.exitCode = 1;
  }
}

void main();
