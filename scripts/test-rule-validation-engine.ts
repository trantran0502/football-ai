import { createMatchDatabase } from "../lib/database/database";
import { createHistoryRepository } from "../lib/database/historyRepository";
import { parseOdds } from "../lib/parser/parser";
import {
  getAllRegisteredRules,
  getAllRuleEnablements,
  isRuleEnabled,
  resetRuleEnablement,
  runRuleValidation,
  validateRule,
} from "../lib/rules";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const sample = `法國 vs 西班牙
獨贏
主 2.1
和 3.2
客 3.5
全場讓分
主0 0.9
客0 0.95
全場大小
大(2.5) 0.88
小 0.98`;

const match = parseOdds(sample);
const database = createMatchDatabase();
const repository = createHistoryRepository(database);

const saved = repository.saveMatch({
  date: "2026-07-13",
  matchDate: "2026-07-13",
  league: "International",
  homeTeam: match.homeTeam,
  awayTeam: match.awayTeam,
  rawOdds: sample,
  marketSelections: match.marketSelections,
});

repository.updateResult(saved.id, {
  fullTimeHomeGoals: 2,
  fullTimeAwayGoals: 1,
  halfTimeHomeGoals: 1,
  halfTimeAwayGoals: 0,
});

const historicalMatches = repository.getAllMatches();
const rules = getAllRegisteredRules();

assert(rules.length === 2, "Registry should contain 2 rules.");
assert(
  rules.some((rule) => rule.name === "MoneylineHandicapRule"),
  "MoneylineHandicapRule should be registered."
);
assert(
  rules.some((rule) => rule.name === "HandicapTotalGoalsRule"),
  "HandicapTotalGoalsRule should be registered."
);

resetRuleEnablement();
assert(!isRuleEnabled("MoneylineHandicapRule"), "Rules should start disabled.");
assert(!isRuleEnabled("HandicapTotalGoalsRule"), "Rules should start disabled.");

const moneylineHandicapRule = rules.find(
  (rule) => rule.name === "MoneylineHandicapRule"
)!;
const dryRunSummary = validateRule(moneylineHandicapRule, historicalMatches, {
  mode: "dryRun",
});

assert(dryRunSummary.sampleSize === 1, "Dry run should count 1 applicable match.");
assert(dryRunSummary.passCount === 0, "Dry run should not count passes.");
assert(dryRunSummary.failCount === 0, "Dry run should not count fails.");
assert(dryRunSummary.passRate === 0, "Dry run passRate should be 0.");
assert(dryRunSummary.examples.length === 0, "Dry run should not collect examples.");

const report = runRuleValidation(historicalMatches, { mode: "dryRun" });
assert(report.rules.length === 2, "runRuleValidation should validate all rules.");
assert(report.mode === "dryRun", "Report mode should be dryRun.");

const ruleOutput = moneylineHandicapRule.evaluate(historicalMatches[0]);
assert(ruleOutput !== null, "Registered rule should evaluate against historical match.");
if (!ruleOutput) {
  throw new Error("Unreachable: ruleOutput should be non-null.");
}
assert(typeof ruleOutput.consistent === "boolean", "Rule output should include consistent.");
assert(typeof ruleOutput.strength === "string", "Rule output should include strength.");
assert(typeof ruleOutput.reason === "string", "Rule output should include reason.");

const enablements = getAllRuleEnablements();
assert(enablements.length === 2, "Enablement should track all registered rules.");
assert(
  enablements.every((item) => item.status === "pending"),
  "All rules should remain pending until validation passes."
);

console.log("Registry:", rules.map((rule) => rule.name).join(", "));
console.log("Dry run sampleSize:", dryRunSummary.sampleSize);
console.log("Validation report rules:", report.rules.length);
console.log("All rule validation engine tests passed.");
