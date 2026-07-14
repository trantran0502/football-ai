import { analyzeMatch } from "../lib/analysis/analyzeMatch";
import { validateCrossMarkets } from "../lib/analysis/crossMarketValidator";
import { generateBetaCandidates } from "../lib/beta/betaCandidateGenerator";
import { parseOdds } from "../lib/parser/parser";
import { normalizeMarketSelections } from "../lib/parser/normalizeMarketSelections";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const moneylineOnly = `法國 vs 西班牙
獨贏
主 1.55
和 3.2
客 3.5`;

const moneylineHandicap = `法國 vs 西班牙
獨贏
主 2.1
和 3.2
客 3.5
全場讓分
主0 0.9
客0 0.95`;

process.env.BETA_RECOMMENDATION_MODE = "true";

const onlyMoneylineMarkets = normalizeMarketSelections(
  parseOdds(moneylineOnly).marketSelections
);
const onlyMoneylineValidation = validateCrossMarkets(onlyMoneylineMarkets);

assert(
  onlyMoneylineValidation.status === "INSUFFICIENT",
  "moneyline-only should be INSUFFICIENT"
);
assert(
  onlyMoneylineValidation.moneylineHandicap.status === "SKIPPED",
  "rule1 should be SKIPPED without handicap"
);
assert(
  onlyMoneylineValidation.handicapTotalGoals.status === "SKIPPED",
  "rule2 should be SKIPPED without handicap/total goals"
);
assert(
  onlyMoneylineValidation.totalGoalsBtts.status === "SKIPPED",
  "rule3 should be SKIPPED without total goals/btts"
);
assert(
  onlyMoneylineValidation.skippedRules === 3,
  "moneyline-only should skip all 3 cross rules"
);
assert(
  !onlyMoneylineValidation.moneylineHandicap.reason.includes("consistent"),
  "skipped reason should describe missing markets"
);

const mlHcMarkets = normalizeMarketSelections(
  parseOdds(moneylineHandicap).marketSelections
);
const mlHcValidation = validateCrossMarkets(mlHcMarkets);

assert(mlHcValidation.status === "PARTIAL", "moneyline+handicap should be PARTIAL");
assert(mlHcValidation.availableMarkets === 2, "should count 2 available markets");
assert(mlHcValidation.executedRules === 1, "should execute rule1 only");
assert(mlHcValidation.skippedRules === 2, "should skip rule2 and rule3");
assert(
  mlHcValidation.handicapTotalGoals.status === "SKIPPED",
  "rule2 should be SKIPPED without total goals"
);
assert(
  mlHcValidation.coverageLabel === "部分",
  "partial coverage label should be 部分"
);

const onlyMoneylineBeta = generateBetaCandidates(
  onlyMoneylineMarkets,
  onlyMoneylineValidation
);
if (onlyMoneylineBeta.candidates.length > 0) {
  const candidate = onlyMoneylineBeta.candidates[0];
  assert(
    candidate.confidenceLevel === "low",
    "single-market candidate must be low confidence"
  );
  assert(
    candidate.reasons.some((item) => item.includes("僅依單一市場判斷")),
    "single-market candidate should include cross-validation warning"
  );
}

const mlHcBeta = generateBetaCandidates(mlHcMarkets, mlHcValidation);
if (mlHcBeta.candidates.length > 0) {
  const candidate = mlHcBeta.candidates[0];
  assert(
    candidate.confidenceLevel !== "high",
    "two-market candidate should not be high confidence"
  );
  assert(candidate.rulesUsed.length >= 1, "two-market candidate should use a rule");
}

const fullReport = analyzeMatch(`法國 vs 西班牙
獨贏
主 1.55
和 3.2
客 3.5
全場讓分
主0 0.9
客0 0.95
全場大小
大(2.5) 0.88
小 0.98`);

assert(
  fullReport.crossMarketValidation.status !== "INSUFFICIENT",
  "full core markets should not be insufficient"
);
assert(
  fullReport.interpretations.length > 0,
  "analysis should still run with partial/full markets"
);

console.log("Partial market handling tests passed.");
