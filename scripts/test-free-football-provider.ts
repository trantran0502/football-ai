import { calculateTeamRecentForm, toRecentMatchSummary } from "../lib/providers/free";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const recentMatches = [
  toRecentMatchSummary(
    {
      fixtureId: 1,
      date: "2026-07-01",
      league: "Premier League",
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      homeGoals: 2,
      awayGoals: 1,
      halfTimeHome: 1,
      halfTimeAway: 0,
    },
    "Arsenal"
  ),
  toRecentMatchSummary(
    {
      fixtureId: 2,
      date: "2026-06-24",
      league: "Premier League",
      homeTeam: "Liverpool",
      awayTeam: "Arsenal",
      homeGoals: 1,
      awayGoals: 1,
      halfTimeHome: 0,
      halfTimeAway: 1,
    },
    "Arsenal"
  ),
  toRecentMatchSummary(
    {
      fixtureId: 3,
      date: "2026-06-17",
      league: "Premier League",
      homeTeam: "Arsenal",
      awayTeam: "Tottenham",
      homeGoals: 3,
      awayGoals: 2,
      halfTimeHome: 2,
      halfTimeAway: 1,
    },
    "Arsenal"
  ),
];

const form = calculateTeamRecentForm(recentMatches);

assert(form.sampleSize === 3, "sample size");
assert(form.wins === 2, "wins");
assert(form.draws === 1, "draws");
assert(form.losses === 0, "losses");
assert(form.goalsFor === 6, "goals for");
assert(form.goalsAgainst === 4, "goals against");
assert(form.avgGoalsFor === 2, "avg goals for");
assert(form.bttsRate !== null && form.bttsRate > 0, "btts rate");
assert(form.over25Rate !== null && form.over25Rate > 0, "over 2.5 rate");

console.log("Recent form:", form);
console.log("All free football provider calculator tests passed.");
