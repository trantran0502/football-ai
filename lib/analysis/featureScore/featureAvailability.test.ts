import { normalizeFeatureAvailability } from "@/lib/analysis/featureScore/featureAvailability";
import type { FeatureScore } from "@/lib/analysis/featureScore/types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testUnavailableFeatureDoesNotScoreZero(): void {
  const features = normalizeFeatureAvailability([
    {
      id: "recent_form.points_per_game",
      category: "moneyline",
      score: 0,
      weight: 0.2,
      confidence: 0.2,
      reason: "Recent form unavailable",
      metadata: {
        homeSampleSize: 0,
        awaySampleSize: 0,
      },
    },
  ]);

  assert(features[0]?.available === false, "feature should be unavailable");
  assert(features[0]?.score === 0, "internal score stays numeric");
  assert(features[0]?.metadata?.value === null, "display value should be null");
  assert(features[0]?.confidence === 0, "unavailable feature confidence should be 0");
}

function testAvailableFeatureKeepsScore(): void {
  const features = normalizeFeatureAvailability([
    {
      id: "market_odds.home",
      category: "moneyline",
      score: 0,
      weight: 0.3,
      confidence: 0.8,
      reason: "Neutral market odds",
      metadata: {
        homeSampleSize: 1,
        awaySampleSize: 1,
      },
    },
  ]);

  assert(features[0]?.available !== false, "real zero score feature should remain available");
  assert(features[0]?.score === 0, "real zero score should stay zero");
}

function runTests(): void {
  testUnavailableFeatureDoesNotScoreZero();
  testAvailableFeatureKeepsScore();
  console.log("featureAvailability.test.ts passed");
}

runTests();
