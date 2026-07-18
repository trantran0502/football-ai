import { FEATURE_PROVIDER_KEYS } from "@/lib/providers/registry/types";
import { MARKET_ENGINE_INITIAL_WEIGHT } from "@/lib/recommendation/marketEngine/marketScore";
import {
  DEFAULT_PROVIDER_WEIGHTS,
  sumProviderWeights,
} from "@/lib/recommendation/providerWeights";
import {
  assertMarketBlendWeight,
  assertProviderWeightsSumToOne,
  buildFallbackWeightConfig,
  parseProviderWeights,
} from "@/lib/recommendation/weightConfigRuntime";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNear(actual: number, expected: number, message: string, epsilon = 1e-9): void {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function testFallbackMatchesProductionConstants(): void {
  const config = buildFallbackWeightConfig();

  assert(config.source === "fallback", "fallback source");
  assert(config.activeVersion === null, "no active version on fallback");

  for (const key of FEATURE_PROVIDER_KEYS) {
    assertNear(
      config.providerWeights[key],
      DEFAULT_PROVIDER_WEIGHTS[key],
      `fallback provider weight ${key}`
    );
  }

  assertNear(
    config.marketBlendWeight,
    MARKET_ENGINE_INITIAL_WEIGHT,
    "fallback market blend weight"
  );
}

function testFallbackProviderWeightsSumToOne(): void {
  const config = buildFallbackWeightConfig();
  assertProviderWeightsSumToOne(config.providerWeights);
  assertNear(sumProviderWeights(config.providerWeights), 1, "fallback provider sum");
}

function testDefaultProductionConstantsSumToOne(): void {
  assertProviderWeightsSumToOne(DEFAULT_PROVIDER_WEIGHTS);
  assertNear(sumProviderWeights(DEFAULT_PROVIDER_WEIGHTS), 1, "DEFAULT_PROVIDER_WEIGHTS sum");
}

function testParseProviderWeightsRoundTrip(): void {
  const parsed = parseProviderWeights(DEFAULT_PROVIDER_WEIGHTS);
  for (const key of FEATURE_PROVIDER_KEYS) {
    assertNear(parsed[key], DEFAULT_PROVIDER_WEIGHTS[key], `parsed ${key}`);
  }
}

function testParseProviderWeightsRejectsInvalidSum(): void {
  let threw = false;
  try {
    parseProviderWeights({
      ...DEFAULT_PROVIDER_WEIGHTS,
      recentForm: 0.99,
    });
  } catch {
    threw = true;
  }
  assert(threw, "invalid sum should throw");
}

function testParseProviderWeightsRejectsUnknownKey(): void {
  let threw = false;
  try {
    parseProviderWeights({
      ...DEFAULT_PROVIDER_WEIGHTS,
      unknownProvider: 0.1,
    });
  } catch {
    threw = true;
  }
  assert(threw, "unknown provider key should throw");
}

function testMarketBlendWeightValidation(): void {
  assertMarketBlendWeight(MARKET_ENGINE_INITIAL_WEIGHT);
  let threw = false;
  try {
    assertMarketBlendWeight(1.5);
  } catch {
    threw = true;
  }
  assert(threw, "out-of-range market blend should throw");
}

export function runWeightConfigTests(): void {
  testFallbackMatchesProductionConstants();
  testFallbackProviderWeightsSumToOne();
  testDefaultProductionConstantsSumToOne();
  testParseProviderWeightsRoundTrip();
  testParseProviderWeightsRejectsInvalidSum();
  testParseProviderWeightsRejectsUnknownKey();
  testMarketBlendWeightValidation();
}

runWeightConfigTests();
console.log("Weight config module tests passed.");
