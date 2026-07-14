import { createMatchDatabase } from "../lib/database/database";
import { createHistoryRepository } from "../lib/database/historyRepository";
import { runAnalysisEngine } from "../lib/analysis/analysisEngine";
import { parseOdds } from "../lib/parser/parser";

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
小 0.98
雙方進球
是 0.75
否 1.05`;

const match = parseOdds(sample);
const analysis = runAnalysisEngine(match.marketSelections);
const database = createMatchDatabase();
const repository = createHistoryRepository(database);

const saved = repository.saveMatch({
  date: "2026-07-13",
  league: "International",
  homeTeam: match.homeTeam,
  awayTeam: match.awayTeam,
  rawOdds: sample,
  marketSelections: match.marketSelections,
  analysis,
});

assert(saved.id.length > 0, "saved match should have id");
assert(saved.status === "PENDING", "new match should be pending");
assert(saved.rawOdds === sample, "raw odds should be saved");
assert(saved.analysisSnapshot !== null, "analysis snapshot should be saved");
if (!saved.analysisSnapshot) {
  throw new Error("analysis snapshot should be saved");
}
const snapshot = saved.analysisSnapshot;
assert(
  snapshot.features.length === analysis.features.length,
  "features should be fully saved"
);
assert(
  snapshot.candidates.length === analysis.candidates.length,
  "candidates should be fully saved"
);
assert(saved.result === null, "result should be null before update");

const updated = repository.updateResult(saved.id, {
  fullTimeHomeGoals: 2,
  fullTimeAwayGoals: 1,
  halfTimeHomeGoals: 1,
  halfTimeAwayGoals: 0,
});

assert(updated !== null, "updateResult should succeed");
if (!updated) {
  throw new Error("updateResult should succeed");
}
const result = updated.result;
assert(result?.winner === "home", "winner should be home");
assert(result?.totalGoals === 3, "total goals should be 3");
assert(result?.bothTeamsScored === true, "both teams should have scored");

const fetched = repository.getMatch(saved.id);
assert(fetched?.result?.winner === "home", "getMatch should return updated record");

const all = repository.getAllMatches();
assert(all.length === 1, "getAllMatches should return one record");

console.log("All history repository tests passed.");
