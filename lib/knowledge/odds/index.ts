export {
  convertOdds,
  getRegisteredPlatforms,
  registerPlatformConverter,
} from "@/lib/knowledge/odds/oddsConverter";
export { calculateImpliedProbability } from "@/lib/knowledge/odds/impliedProbability";
export { normalizeMarket } from "@/lib/knowledge/odds/marketNormalizer";

export type {
  BttsMarketInput,
  DecimalOdds,
  HandicapMarketInput,
  ImpliedProbability,
  MarketInput,
  MoneylineMarketInput,
  NormalizedMarket,
  NormalizedMarketKind,
  NormalizedSelection,
  OddsConverter,
  OddsPlatform,
  OverUnderMarketInput,
  PlatformOddsInput,
} from "@/lib/knowledge/odds/types";
