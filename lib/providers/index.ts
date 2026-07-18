export {
  createProvider,
  getDefaultProvider,
  getSupportedProviderTypes,
  registerProvider,
} from "@/lib/providers/provider";

export { MockFootballProvider } from "@/lib/providers/mockProvider";
export { MockOddsAdapter } from "@/lib/providers/odds/mockOddsAdapter";
export { ApiFootballOddsAdapter } from "@/lib/providers/odds/apiFootballOddsAdapter";

export * from "@/lib/providers/free";

export type {
  FootballDataProvider,
  HistoricalMatchesQuery,
  MatchStatus,
  OddsData,
  OddsProvider,
  OddsQuery,
  ProviderConstructor,
  ProviderHistoricalMatch,
  ProviderId,
  ProviderMatchId,
  ProviderOptions,
  ProviderType,
  ResultData,
  ResultQuery,
  UpcomingMatch,
  UpcomingMatchesQuery,
} from "@/lib/providers/providerTypes";
