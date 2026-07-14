import { parseOdds } from "../lib/parser/parser";

const sample = `法國 vs 西班牙
獨贏
主 2.1
和 3.2
客 3.5
上半場獨贏與讓分
主 2
客 2.85
和 1.04
主0 0.72
客0 1.18
主 0.39
客(0-50) 1.51
主(0-50) 1.28
客 0.62
主隊進球數
大(1-50) 0.77
小 1.07
客隊進球數
大(0.5) 1.2
小 0.7
上半場罰牌大小
大(2.5) 0.9
小 0.95
最先入球
主 0.81
客 1.11
否 8.8
最後入球
主 1.2
客 0.9
否 7.5`;

const r = parseOdds(sample);

console.log("unknown count", r.unknownMarkets.length);
if (r.unknownMarkets.length > 0) {
  console.log(JSON.stringify(r.unknownMarkets, null, 2));
}

const titles = [...new Set(r.marketSelections.map((s) => s.title))];
console.log("titles", titles);

const combined = r.marketSelections.filter(
  (s) => s.title.includes("上半場獨贏") || s.title.includes("上半場讓分")
);
console.log(
  "combined markets",
  combined.map((s) => `${s.title} ${s.side} ${s.rawLine} ${s.odds}`)
);

const homeGoals = r.marketSelections.filter((s) => s.title === "主隊進球數");
const awayGoals = r.marketSelections.filter((s) => s.title === "客隊進球數");
console.log("homeGoals tokens", homeGoals.map((s) => `${s.side}:${s.rawLine}`));
console.log("awayGoals tokens", awayGoals.map((s) => `${s.side}:${s.rawLine}`));

const cards = r.marketSelections.filter((s) => s.title === "上半場罰牌大小");
console.log("cards", cards.map((s) => `${s.side}:${s.rawLine}`));

const firstGoal = r.marketSelections.filter((s) => s.marketType === "firstGoal");
console.log("firstGoal sides", firstGoal.map((s) => s.side));

const mismatch = r.marketSelections.filter((s) => {
  if (s.marketFamily !== "asianHandicap" && s.marketFamily !== "asianOverUnder") {
    return false;
  }
  const pairIndex =
    s.side === "home" || s.side === "over"
      ? r.marketSelections.indexOf(s)
      : -1;
  if (pairIndex === -1) {
    return false;
  }
  const partner = r.marketSelections[pairIndex + 1] ?? r.marketSelections[pairIndex - 1];
  if (!partner || partner.title !== s.title) {
    return false;
  }
  if (!s.rawLine || !partner.rawLine) {
    return false;
  }
  const expected = getOppositeCheck(s.rawLine, partner.rawLine);
  return !expected;
});

function getOppositeCheck(a: string, b: string): boolean {
  const lineA = parseLine(a);
  const lineB = parseLine(b);
  if (!lineA || !lineB || lineA.line !== lineB.line) {
    return true;
  }
  if (lineA.modifier === "plain" && lineB.modifier === "plain") {
    return true;
  }
  if (
    (lineA.modifier === "minus50" && lineB.modifier === "plus50") ||
    (lineA.modifier === "plus50" && lineB.modifier === "minus50")
  ) {
    return true;
  }
  if (lineA.modifier === "half" && lineB.modifier === "half") {
    return true;
  }
  return false;
}

function parseLine(raw: string) {
  const { parseAsianMarketLine } = require("../lib/parser/asianRules");
  return parseAsianMarketLine(raw);
}

console.log("opposite mismatches", mismatch.length);
console.log("selections from marketSelections", r.selections.length === r.marketSelections.length);
