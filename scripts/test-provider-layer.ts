import {
  createProvider,
  getDefaultProvider,
  getSupportedProviderTypes,
} from "../lib/providers";

async function main(): Promise<void> {
  const provider = getDefaultProvider();

  const upcoming = await provider.getUpcomingMatches({ limit: 10 });
  const historical = await provider.getHistoricalMatches({ limit: 10 });
  const odds = await provider.getOdds({ matchId: "mock-upcoming-1" });
  const result = await provider.getResult({ matchId: "mock-historical-1" });

  if (upcoming.length < 2) {
    throw new Error("expected at least 2 upcoming matches");
  }
  if (historical.length < 3) {
    throw new Error("expected at least 3 historical matches");
  }
  if (!odds || odds.marketSelections.length === 0) {
    throw new Error("expected odds data for upcoming match");
  }
  if (!result || result.result.winner !== "home") {
    throw new Error("expected historical result for France vs Spain");
  }

  const supported = getSupportedProviderTypes();
  if (!supported.includes("mock")) {
    throw new Error("mock provider should be registered");
  }

  let unregisteredThrows = false;
  try {
    createProvider("flashscore");
  } catch {
    unregisteredThrows = true;
  }
  if (!unregisteredThrows) {
    throw new Error("unregistered provider should throw");
  }

  console.log("Provider:", provider.name);
  console.log("Upcoming:", upcoming.length);
  console.log("Historical:", historical.length);
  console.log("Odds selections:", odds.marketSelections.length);
  console.log("Result winner:", result.result.winner);
  console.log("Supported providers:", supported.join(", "));
  console.log("All provider layer tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
