import { MockFootballProvider } from "@/lib/providers/mockProvider";
import type {
  FootballDataProvider,
  ProviderConstructor,
  ProviderOptions,
  ProviderType,
} from "@/lib/providers/providerTypes";

const providerRegistry = new Map<ProviderType, ProviderConstructor>();

function registerBuiltInProviders(): void {
  providerRegistry.set("mock", MockFootballProvider);
}

registerBuiltInProviders();

/**
 * 註冊自訂 Provider（未來擴充 OddsProvider、FlashscoreProvider 等）。
 */
export function registerProvider(
  type: ProviderType,
  constructor: ProviderConstructor
): void {
  providerRegistry.set(type, constructor);
}

/**
 * 取得目前已註冊的 Provider 類型。
 */
export function getSupportedProviderTypes(): ProviderType[] {
  return [...providerRegistry.keys()];
}

/**
 * Provider Factory — 目前僅 mock 可實際使用。
 */
export function createProvider(
  type: ProviderType = "mock",
  options?: ProviderOptions
): FootballDataProvider {
  const Constructor = providerRegistry.get(type);
  if (!Constructor) {
    throw new Error(`Football data provider "${type}" is not registered`);
  }
  return new Constructor(options);
}

/**
 * 取得預設 Provider（目前為 MockFootballProvider）。
 */
export function getDefaultProvider(): FootballDataProvider {
  return createProvider("mock");
}

export type {
  FootballDataProvider,
  ProviderConstructor,
} from "@/lib/providers/providerTypes";
